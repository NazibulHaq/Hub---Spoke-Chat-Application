import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ActivityLogsService {
    constructor(private prisma: PrismaService) { }

    async createLog(userId: string, action: string, details?: string, ipAddress?: string) {
        try {
            return await this.prisma.activityLog.create({
                data: {
                    userId,
                    action,
                    details,
                    ipAddress,
                },
            });
        } catch (error) {
            console.error('[ActivityLogsService] Failed to create log:', error);
            // We don't want to crash the main request if logging fails
        }
    }
}
