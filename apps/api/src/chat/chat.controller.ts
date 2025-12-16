import { Controller, Get, UseGuards, Request, Query, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@hub-spoke/shared';

@Controller('chat')
@UseGuards(AuthGuard('jwt'))
export class ChatController {
    constructor(private prisma: PrismaService) { }

    @Get('messages')
    async getMessages(@Request() req: any, @Query('userId') targetUserId?: string) {
        const user = req.user;

        let conversationId: string | null = null;

        if (user.role === Role.USER) {
            // User can only see their own conversation
            const conversation = await this.prisma.conversation.findFirst({
                where: { userId: user.sub },
            });
            conversationId = conversation?.id || null;
        } else if (user.role === Role.ADMIN) {
            // Admin must specify which user's conversation they want
            if (!targetUserId) {
                // If no user specified, maybe return all recent messages? 
                // For now, let's require a targetUserId to fetch a specific conversation
                // OR we can return an empty list if not selected.
                return [];
            }

            const conversation = await this.prisma.conversation.findFirst({
                where: { userId: targetUserId },
            });
            conversationId = conversation?.id || null;
        }

        if (!conversationId) {
            return [];
        }

        return this.prisma.message.findMany({
            where: { conversationId },
            orderBy: { createdAt: 'asc' },
            take: 100, // Limit to last 100 messages
        });
    }
}
