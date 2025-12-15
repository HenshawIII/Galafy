import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { EventStatus } from '../../../generated/prisma/enums.js';

/**
 * Scheduled task to automatically update event status from SCHEDULED to LIVE
 * when the startsAt date/time arrives
 */
@Injectable()
export class EventStatusTask {
  private readonly logger = new Logger(EventStatusTask.name);

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Runs every minute to check for events that should go live
   * Cron expression: '* * * * *' means every minute
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async handleScheduledEvents() {
    this.logger.debug('Checking for scheduled events that should go live...');

    const now = new Date();

    try {
      // Find all events that are SCHEDULED and have reached their startsAt time
      const eventsToGoLive = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            lte: now, // startsAt is less than or equal to now
          },
        },
        select: {
          id: true,
          code: true,
          title: true,
          startsAt: true,
        },
      });

      if (eventsToGoLive.length === 0) {
        this.logger.debug('No scheduled events found that should go live');
        return;
      }

      this.logger.log(`Found ${eventsToGoLive.length} event(s) that should go live`);

      // Update each event to LIVE status
      const updatePromises = eventsToGoLive.map((event) =>
        this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.LIVE },
        }),
      );

      await Promise.all(updatePromises);

      this.logger.log(
        `Successfully updated ${eventsToGoLive.length} event(s) to LIVE status: ${eventsToGoLive.map((e) => e.code).join(', ')}`,
      );
    } catch (error: any) {
      this.logger.error(`Error updating scheduled events to LIVE: ${error.message}`, error.stack);
    }
  }
}

