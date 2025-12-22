import { Module } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { EventStatusTask } from './tasks/event-status.task.js';
import { CacheModule } from '../cache/cache.module.js';

@Module({
  imports: [DatabaseModule, CacheModule],
  controllers: [EventsController],
  providers: [EventsService, EventStatusTask],
  exports: [EventsService],
})
export class EventsModule {}
