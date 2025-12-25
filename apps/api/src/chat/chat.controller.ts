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
        const currentUserId = user.sub;

        if (!currentUserId) {
            throw new BadRequestException('Invalid user context');
        }

        let conversationId: string | null = null;

        if (user.role === Role.USER) {
            // User can only see their own conversation
            const conversation = await this.prisma.conversation.findFirst({
                where: { userId: currentUserId },
            });
            conversationId = conversation?.id || null;
        } else if (user.role === Role.ADMIN) {
            // Admin must specify which user's conversation they want
            if (!targetUserId) {
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

        const where: any = { conversationId };

        if (user.role === Role.USER) {
            // Fetch user's lastLogin to filter history
            const currentUser = await this.prisma.user.findUnique({
                where: { id: currentUserId },
                select: { lastLogin: true }
            });

            if (currentUser?.lastLogin) {
                where.createdAt = { gt: currentUser.lastLogin };
            }
        }

        return this.prisma.message.findMany({
            where,
            orderBy: { createdAt: 'asc' },
            take: 100, // Limit to last 100 messages
        });
    }
}
