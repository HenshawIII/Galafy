import { Module } from '@nestjs/common';
import { EventsService } from './events.service.js';
import { EventsController } from './events.controller.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [EventsController],
  providers: [EventsService],
  exports: [EventsService],
})
export class EventsModule {}
