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

        const { passwordHash, ...result } = user;
        return result;
    }

    @Post(':id') // Using Post for compatibility or Patch? Usually Patch.
    // Let's use standard @Patch if available, but I see @Post used for many things.
    // Actually, I'll use @Post(':id') or @Patch(':id'). Let's stick to standard @Post if @Patch is not imported.
    // Wait, I see Delete, Post, Get imported. I'll add Patch to imports.
    @Post(':id/update') // Using a unique sub-route to avoid conflict with create if needed, 
    // but usually PATCH :id is better.
    async update(@Request() req: any, @Param('id') id: string, @Body() body: any) {
        if (req.user.role !== Role.ADMIN) {
            throw new ForbiddenException('Only admins can update users');
        }

        const { email, displayName } = body;

        try {
            const updatedUser = await this.prisma.user.update({
                where: { id },
                data: {
                    email,
                    displayName,
                },
            });
            const { passwordHash, ...result } = updatedUser;
            return result;
        } catch (error) {
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
