import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from '../prisma/prisma.service';
import { ActivityLogsService } from '../activity-logs/activity-logs.service';
import { Role } from '@hub-spoke/shared';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AuthService {
    constructor(
        private prisma: PrismaService,
        private jwtService: JwtService,
        private activityLogs: ActivityLogsService,
    ) { }

    async validateUser(email: string, pass: string): Promise<any> {
        const user = await this.prisma.user.findUnique({ where: { email } });
        if (user && (await bcrypt.compare(pass, user.passwordHash))) {
            const { passwordHash, ...result } = user;
            return result;
        }
        return null;
    }

    async login(user: any) {
        // Update last login timestamp
        await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLogin: new Date() }
        });

        // Log the activity
        await this.activityLogs.createLog(user.id, 'LOGIN', `User ${user.email} logged in`);

        const payload = { email: user.email, sub: user.id, role: user.role, displayName: user.displayName };
        return {
            access_token: this.jwtService.sign(payload),
        };
    }

    async logout(userId: string, email: string) {
        return this.activityLogs.createLog(userId, 'LOGOUT', `User ${email} logged out`);
    }

    async register(email: string, pass: string, role: Role = Role.USER, displayName?: string) {
        const hashedPassword = await bcrypt.hash(pass, 10);
        const user = await this.prisma.user.create({
            data: {
                email,
                displayName,
                passwordHash: hashedPassword,
                role,
            },
        });
        const { passwordHash, ...result } = user;
        return result;
    }
}
