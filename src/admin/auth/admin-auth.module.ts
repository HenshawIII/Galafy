import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminJwtStrategy } from './admin-jwt.strategy.js';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { PermissionsGuard } from './guards/permissions.guard.js';
import { DatabaseModule } from '../../database/database.module.js';
import { config } from 'dotenv';
config();

@Module({
  imports: [
    DatabaseModule,
    PassportModule,
    JwtModule.register({
      secret:
        process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'admin-secret',
      signOptions: {
        expiresIn: '8h', // Default, can be overridden in service
      },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [
    AdminAuthService,
    AdminJwtStrategy,
    AdminJwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
  exports: [
    AdminAuthService,
    AdminJwtAuthGuard,
    RolesGuard,
    PermissionsGuard,
  ],
})
export class AdminAuthModule {}

