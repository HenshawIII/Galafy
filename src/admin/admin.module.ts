import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AdminAuthModule } from './auth/admin-auth.module.js';
import { CacheModule } from '../cache/cache.module.js';

@Module({
  imports: [DatabaseModule, ConfigModule, AdminAuthModule, CacheModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
