import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FirebaseAdminProvider } from './firesbase-admin.provider.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebaseAdminProvider],
  exports: [NotificationsService],
})
export class NotificationsModule {}
