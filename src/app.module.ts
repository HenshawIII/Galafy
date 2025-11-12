import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { DatabaseModule } from './database/database.module.js';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import {APP_GUARD} from '@nestjs/core';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [UsersModule, DatabaseModule, ThrottlerModule.forRoot([{
    name: 'short',
    ttl: 60000,
    limit: 5,
  }]), AuthModule],
  controllers: [AppController],
  providers: [AppService, {
    provide: APP_GUARD,
    useClass: ThrottlerGuard,
  }],
})
export class AppModule {}
