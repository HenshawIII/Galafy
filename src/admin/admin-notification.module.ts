import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { AdminNotificationService } from './admin-notification.service.js';

@Global()
@Module({
  imports: [DatabaseModule],
  providers: [AdminNotificationService],
  exports: [AdminNotificationService],
})
export class AdminNotificationModule {}
