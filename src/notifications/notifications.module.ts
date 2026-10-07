import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { FirebaseAdminProvider } from './firesbase-admin.provider.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventRemindersTask } from './tasks/event-reminders.task.js';

@Module({
  imports: [DatabaseModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, FirebaseAdminProvider, EventRemindersTask],
  exports: [NotificationsService],
})
export class NotificationsModule {}
