import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { JwtModule } from '@nestjs/jwt';
import { config } from 'dotenv';
config();

@Module({
  imports: [UsersModule,JwtModule.register({
    secret: process.env.JWT_SECRET,
    global: true,
    signOptions: { expiresIn: '1h' },
  })],
  providers: [AuthService],
  controllers: [AuthController]
})
export class AuthModule {}
