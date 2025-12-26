import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';
import { UsersModule } from './users/users.module';
import { ActivityLogsModule } from './activity-logs/activity-logs.module';

@Module({
  imports: [PrismaModule, AuthModule, ChatModule, UsersModule, ActivityLogsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule { }
