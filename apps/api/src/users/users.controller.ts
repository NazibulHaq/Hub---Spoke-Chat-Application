import { Controller, Get, Post, Delete, Body, Param, UseGuards, Request, ForbiddenException, BadRequestException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthGuard } from '@nestjs/passport';
import { Role } from '@hub-spoke/shared';
import { MessageStatus } from '@prisma/client';

@Controller('users')
@UseGuards(AuthGuard('jwt'))
export class UsersController {
    constructor(private prisma: PrismaService) { }

    @Get()
    async findAll(@Request() req: any) {
        console.log(`[UsersController] GET /users called by ${req.user.email} (${req.user.role})`);
        if (req.user.role !== Role.ADMIN) {
            console.warn(`[UsersController] Access denied for ${req.user.email}`);
            throw new ForbiddenException('Only admins can view all users');
        }
        const users = await this.prisma.user.findMany({
            where: { role: Role.USER },
            select: {
                id: true,
                email: true,
                role: true,
                createdAt: true,
                lastLogin: true,
                // Count unread messages sent BY this user
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

        // Map to flat structure if needed, or frontend handles it?
        // Frontend expects `unreadCount`. Prisma returns `_count: { messages: N }`.
        return users.map(u => ({
            ...u,
            unreadCount: u._count.messages
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

        const { email, password, role } = body;

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
                passwordHash: hashedPassword,
                role: role || Role.USER,
            },
        });

        const { passwordHash, ...result } = user;
        return result;
    }
}
