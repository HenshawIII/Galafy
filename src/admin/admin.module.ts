import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';

@Module({
  imports: [DatabaseModule, ConfigModule],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
