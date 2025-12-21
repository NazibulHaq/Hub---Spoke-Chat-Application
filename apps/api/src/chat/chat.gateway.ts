import {
    WebSocketGateway,
    SubscribeMessage,
    MessageBody,
    ConnectedSocket,
    WebSocketServer,
    OnGatewayConnection,
    OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { UseGuards } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { Role, EVENTS } from '@hub-spoke/shared';
import { MessageStatus } from '@prisma/client';

@WebSocketGateway({
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        credentials: true,
    },
})
export class ChatGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer()
    server: Server;

    // Track online status: userId -> 'online'
    private connectedUsers = new Map<string, string>();

    constructor(
        private jwtService: JwtService,
        private prisma: PrismaService,
    ) { }

    async handleConnection(client: Socket) {
        try {
            const token = client.handshake.auth.token || client.handshake.headers.authorization;
            if (!token) {
                client.disconnect();
                return;
            }
            const payload = this.jwtService.verify(token, { secret: process.env.JWT_SECRET || 'secretKey' });
            client.data.user = payload;
            console.log(`[ChatGateway] Client connected: ${payload.sub} (${payload.email}) Role: ${payload.role}`);

            // Hub-and-Spoke Room Logic
            if (payload.role === Role.ADMIN) {
                await client.join('admin-room');
                console.log(`[ChatGateway] ${payload.email} joined admin-room`);

                // When Admin joins, send them the list of CURRENTLY online users
                const onlineUsers = Array.from(this.connectedUsers.keys()).map(userId => ({
                    userId,
                    status: 'online'
                }));
                // Emit only to this admin client
                client.emit('initial_online_users', onlineUsers);

            } else {
                await client.join(`user-${payload.sub}`);
                console.log(`[ChatGateway] ${payload.email} joined user-${payload.sub}`);

                this.connectedUsers.set(payload.sub, 'online');

                // Notify admins that a user is online
                this.server.to('admin-room').emit(EVENTS.SERVER.USER_STATUS, { userId: payload.sub, status: 'online' });
            }
        } catch (e) {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const user = client.data.user;
        if (user && user.role === Role.USER) {
            this.connectedUsers.delete(user.sub);
            this.server.to('admin-room').emit(EVENTS.SERVER.USER_STATUS, { userId: user.sub, status: 'offline' });
        }
    }

    @SubscribeMessage(EVENTS.CLIENT.SEND_MESSAGE)
    async handleMessage(
        @ConnectedSocket() client: Socket,
        @MessageBody() payload: { content: string; conversationId?: string; targetUserId?: string },
    ) {
        const user = client.data.user;
        let conversationId = payload.conversationId;

        if (user.role === Role.USER) {
            // User can only send to their own conversation
            let conversation = await this.prisma.conversation.findFirst({
                where: { userId: user.sub },
            });

            if (!conversation) {
                conversation = await this.prisma.conversation.create({
                    data: { userId: user.sub },
                });
            }
            conversationId = conversation.id;
        } else if (user.role === Role.ADMIN) {
            // Admin sending to a user
            if (payload.targetUserId) {
                let conversation = await this.prisma.conversation.findFirst({
                    where: { userId: payload.targetUserId },
                });
                if (!conversation) {
                    // Create conversation if it doesn't exist (Admin initiating)
                    conversation = await this.prisma.conversation.create({
                        data: { userId: payload.targetUserId },
                    });
                }
                conversationId = conversation.id;
            }
        }

        if (!conversationId) return; // Error

        let message = await this.prisma.message.create({
            data: {
                content: payload.content,
                senderId: user.sub,
                conversationId: conversationId,
                status: MessageStatus.SENT,
            },
        });

        // 2. Emit to Room
        const conversation = await this.prisma.conversation.findUnique({
            where: { id: conversationId },
        });

        if (conversation) {
            const roomName = `user-${conversation.userId}`;

            // Check if recipient is online
            const isUserSender = user.role === Role.USER;
            let isRecipientOnline = false;

            if (isUserSender) {
                // Target is Admin
                const room = this.server.sockets.adapter.rooms.get('admin-room');
                isRecipientOnline = !!(room && room.size > 0);
            } else {
                // Target is User
                isRecipientOnline = this.connectedUsers.has(conversation.userId);
            }

            if (isRecipientOnline) {
                // Update status to DELIVERED
                message = await this.prisma.message.update({
                    where: { id: message.id },
                    data: { status: MessageStatus.DELIVERED }
                });
            }

            const messageWithMetadata = {
                ...message,
                senderRole: user.role,
                conversationUserId: conversation.userId
            };

            this.server.to(roomName).emit(EVENTS.SERVER.MESSAGE_RECEIVED, messageWithMetadata);
            this.server.to('admin-room').emit(EVENTS.SERVER.MESSAGE_RECEIVED, messageWithMetadata);
        }

        // Return the message as ACK to the sender
        return message;
    }

    @SubscribeMessage(EVENTS.CLIENT.TYPING)
    async handleTyping(@ConnectedSocket() client: Socket, @MessageBody() payload: { isTyping: boolean; targetUserId?: string }) {
        const user = client.data.user;

        if (user.role === Role.USER) {
            // User typing to Admin (Global Admin Room)
            this.server.to('admin-room').emit(EVENTS.SERVER.TYPING_STATUS, {
                userId: user.sub,
                isTyping: payload.isTyping,
                role: Role.USER
            });
        } else if (user.role === Role.ADMIN && payload.targetUserId) {
            // Admin typing to specific User
            // Find conversation or just emit to user room directly
            // User room is `user-{userId}`
            const roomName = `user-${payload.targetUserId}`;
            this.server.to(roomName).emit(EVENTS.SERVER.TYPING_STATUS, {
                userId: user.sub,
                isTyping: payload.isTyping,
                role: Role.ADMIN
            });
        }
    }

    @SubscribeMessage(EVENTS.CLIENT.MARK_AS_READ)
    async handleMarkAsRead(@ConnectedSocket() client: Socket, @MessageBody() payload: { targetUserId?: string }) {
        const user = client.data.user;
        let conversationId: string | null = null;

        if (user.role === Role.USER) {
            // User reading Admin's messages
            const conversation = await this.prisma.conversation.findFirst({
                where: { userId: user.sub },
            });
            if (conversation) conversationId = conversation.id;
        } else if (user.role === Role.ADMIN && payload.targetUserId) {
            // Admin reading User's messages
            const conversation = await this.prisma.conversation.findFirst({
                where: { userId: payload.targetUserId },
            });
            if (conversation) conversationId = conversation.id;
        }

        if (!conversationId) return;

        // Update messages: Sent by OTHER party, in THIS conversation, that are NOT READ
        // We actually want to mark *all* messages in this conversation where sender is active user's partner as READ.
        // Or simpler: Update all messages in this conversation where senderId != user.sub AND status != READ

        await this.prisma.message.updateMany({
            where: {
                conversationId: conversationId,
                senderId: { not: user.sub },
                status: { not: MessageStatus.READ },
            },
            data: {
                status: MessageStatus.READ,
            },
        });

        // Notify the Sender (the "Target") that their messages were read
        // Target is payload.targetUserId (if Admin) or Admin (if User)

        let targetRoom = 'admin-room'; // Default if User reads: notify Admin
        if (user.role === Role.ADMIN && payload.targetUserId) {
            // If Admin reads: notify User
            targetRoom = `user-${payload.targetUserId}`;
        }

        this.server.to(targetRoom).emit(EVENTS.SERVER.MESSAGE_READ, {
            conversationId,
            readBy: user.sub,
        });
    }
}
