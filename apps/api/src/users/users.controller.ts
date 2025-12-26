import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@hub-spoke/shared';
import { MessageStatus } from '@prisma/client';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
    constructor(
        private prisma: PrismaService,
        private activityLogs: ActivityLogsService,
    ) { }

    @Get()
    async findAll(@Request() req: any) {
        if (req.user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can view all users');
        }
        const users = await this.prisma.user.findMany({
            where: { role: Role.USER },
            select: {
                id: true,
                email: true,
                displayName: true,
                role: true,
                createdAt: true,
                lastLogin: true,
                _count: {
                    select: {
                        messages: {
                            where: {
                                status: { not: MessageStatus.READ }
                            }
                        }
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        // Map to flat structure for the frontend
        return users.map(u => ({
            id: u.id,
            email: u.email,
            displayName: u.displayName,
            role: u.role,
            createdAt: u.createdAt,
            lastLogin: u.lastLogin,
            unreadCount: (u as any)._count?.messages || 0
        }));
    }

    @Delete(':id')
    async delete(@Request() req: any, @Param('id') id: string) {
        console.log(`[UsersController] DELETE /users/${id} called by ${req.user.email}`);
        if (req.user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can delete users');
        }

        // Prevent self-deletion
        if (req.user.sub === id) {
            throw new BadRequestException('Cannot delete yourself');
        }

        try {
            await this.prisma.user.delete({ where: { id } });
            // Log the activity
            await this.activityLogs.createLog(req.user.sub, 'USER_DELETE', `Admin ${req.user.email} deleted user ID ${id}`);
            return { message: 'User deleted successfully', id };
        } catch (error) {
            if (error.code === 'P2025') {
                throw new NotFoundException('User not found');
            }
            throw error;
        }
    }

    @Post()
    async create(@Request() req: any, @Body() body: any) {
        console.log(`[UsersController] POST /users called by ${req.user.email}`);
        if (req.user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can create users');
        }

        const { email, password, role, displayName } = body;

        if (!email || !password) {
            throw new BadRequestException('Email and password are required');
        }

        // Check if user exists
        const existing = await this.prisma.user.findUnique({ where: { email } });
        if (existing) {
            throw new BadRequestException('User with this email already exists');
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const user = await this.prisma.user.create({
            data: {
                email,
                displayName,
                passwordHash: hashedPassword,
                role: role || Role.USER,
            },
        });

        // Log the activity
        await this.activityLogs.createLog(req.user.sub, 'USER_CREATE', `Admin ${req.user.email} created user ${email}`);

        const { passwordHash, ...result } = user;
        return result;
    }

    @Patch(':id')
    async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        console.log(`[UsersController] PATCH /users/${id} START - requester: ${req.user.email}`);
        console.log(`[UsersController] Received Body:`, JSON.stringify(body));

        if (req.user.role !== Role.ADMIN) {
            console.warn(`[UsersController] Forbidden: UID ${req.user.sub} tried updating UID ${id}`);
            throw new ForbiddenException('Only admins can update users');
        }

        const { email, displayName } = body;

        try {
            console.log(`[UsersController] Prisma: Executing update for ${id}...`);
            const updatedUser = await this.prisma.user.update({
                where: { id },
                data: {
                    email,
                    displayName,
                },
            });
            console.log(`[UsersController] Prisma: Update SUCCESS for ${id}`);

            // Log the activity
            await this.activityLogs.createLog(req.user.sub, 'USER_UPDATE', `Admin ${req.user.email} updated user ID ${id}`);

            const { passwordHash, ...result } = updatedUser;
            return result;
        } catch (error) {
            console.error(`[UsersController] Update ERROR for user ${id}:`, error.message);
            if (error.code === 'P2002') {
                throw new BadRequestException('User with this email already exists');
            }
            if (error.code === 'P2025') {
                throw new NotFoundException('User not found');
            }
            throw error;
        }
    }
}
