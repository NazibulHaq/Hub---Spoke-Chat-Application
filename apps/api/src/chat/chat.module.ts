import { Module } from '@nestjs/common';
import { ChatGateway } from './chat.gateway';
import { ChatController } from './chat.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { JwtModule } from '@nestjs/jwt';

@Module({
    imports: [PrismaModule, AuthModule, JwtModule],
    controllers: [ChatController],
    providers: [ChatGateway],
})
export class ChatModule { }
