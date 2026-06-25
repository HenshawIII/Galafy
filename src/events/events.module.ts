import { Module, forwardRef } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventStatusTask } from './tasks/event-status.task.js';
import { CacheModule } from '../cache/cache.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AdminNotificationModule } from '../admin/admin-notification.module.js';

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    forwardRef(() => NotificationsModule),
    ConfigModule,
    AdminNotificationModule,
  ],
  controllers: [EventsController],
  providers: [EventsService, EventStatusTask],
  exports: [EventsService],
})
export class EventsModule {}
