import { Module } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { UsersModule } from '../users/users.module.js';
import { CustomerKycModule } from '../customer-kyc/customer-kyc.module.js';
import { DatabaseModule } from '../database/database.module.js';
import { JwtAuthGuard } from './jwt-auth.guard.js';
import { JwtAuthModule } from './jwt-auth.module.js';

@Module({
  imports: [JwtAuthModule, UsersModule, CustomerKycModule, DatabaseModule],
  providers: [AuthService],
  controllers: [AuthController],
  exports: [JwtAuthGuard],
})
export class AuthModule {}
