import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { EventStatus } from '../../../generated/prisma/enums.js';
import { NotificationsService } from '../../notifications/notifications.service.js';
import { getWATISOString } from '../../common/utils/timezone.util.js';

/**
 * Scheduled task to automatically update event status from SCHEDULED to LIVE
 * when the startsAt date/time arrives
 */
@Injectable()
export class EventStatusTask {
  private readonly logger = new Logger(EventStatusTask.name);

  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(forwardRef(() => NotificationsService))
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs every 15 minutes to check for events that should go live
   */
  @Cron('*/15 * * * *')
  async handleScheduledEvents(): Promise<void> {
    this.logger.debug('Checking for scheduled events that should go live...');

    // Use actual UTC time for comparison since database stores UTC timestamps
    const now = new Date();

    // Log for debugging timezone issues
    this.logger.debug(
      `Time check - WAT: ${getWATISOString(now)}, UTC ISO: ${now.toISOString()}, UTC Timestamp: ${now.getTime()}`,
    );

    try {
      // Find all events that are SCHEDULED and have reached their startsAt time
      // Database stores UTC timestamps, so we compare with actual UTC time
      const eventsToGoLive = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            lte: now, // startsAt (UTC) is less than or equal to now (UTC)
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

      // Update each event to LIVE status and send notifications
      for (const event of eventsToGoLive) {
        await this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.LIVE },
        });

        // Get all participants and send notifications
        const participants = await this.databaseService.eventParticipant.findMany({
          where: { eventId: event.id },
          select: { userId: true },
        });

        // Send notifications to all participants
        for (const participant of participants) {
          await this.notificationsService.sendNotificationIfEnabled(
            participant.userId,
            {
              notification: {
                title: 'Event is Live!',
                body: `${event.title} has started`,
              },
              data: {
                type: 'EVENT_LIVE',
                eventId: event.id,
                eventCode: event.code,
                eventTitle: event.title,
                startsAt: getWATISOString(event.startsAt),
              },
            },
            true, // Check event reminders preference
          );
        }
      }

      this.logger.log(
        `Successfully updated ${eventsToGoLive.length} event(s) to LIVE status: ${eventsToGoLive.map((e) => e.code).join(', ')}`,
      );
    } catch (error: any) {
      this.logger.error(`Error updating scheduled events to LIVE: ${error.message}`, error.stack);
    }
  }
}
