import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications.service.js';
import { EventStatus } from '../../../generated/prisma/enums.js';
import { getWATISOString } from '../../common/utils/timezone.util.js';

/**
 * Scheduled task to send event reminder notifications
 * - 10 minutes before event starts
 * - At event start time
 */
@Injectable()
export class EventRemindersTask {
  private readonly logger = new Logger(EventRemindersTask.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs every minute to check for events starting in 10 minutes
   */
  @Cron('* * * * *') // Every minute
  async send10MinuteReminders(): Promise<void> {
    this.logger.debug('Checking for events starting in 10 minutes...');

    // Use actual UTC time for comparison since database stores UTC timestamps
    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    try {
      // Find events starting in approximately 10 minutes (within 1 minute window)
      // Exclude events that have ended (endsAt is in the past)
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            gte: new Date(tenMinutesFromNow.getTime() - 30 * 1000), // 30 seconds before
            lte: new Date(tenMinutesFromNow.getTime() + 30 * 1000), // 30 seconds after
          },
          OR: [
            { endsAt: null }, // Events without an end date
            { endsAt: { gt: now } }, // Events that haven't ended yet (UTC comparison)
          ],
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          code: true,
        },
      });

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Found ${events.length} event(s) starting in 10 minutes`);

      for (const event of events) {
        // Get all participants
        const participants = await this.databaseService.eventParticipant.findMany({
          where: { eventId: event.id },
          select: { userId: true },
        });

        for (const participant of participants) {
          await this.notificationsService.sendNotificationIfEnabled(
            participant.userId,
            {
              notification: {
                title: 'Event Starting Soon!',
                body: `${event.title} starts in 10 minutes`,
              },
              data: {
                type: 'EVENT_REMINDER_10MIN',
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

      this.logger.log(`Sent 10-minute reminders for ${events.length} event(s)`);
    } catch (error: any) {
      this.logger.error(`Error sending 10-minute reminders: ${error.message}`, error.stack);
    }
  }

  /**
   * Runs every minute to check for events starting now
   */
  @Cron('* * * * *') // Every minute
  async sendStartNotifications(): Promise<void> {
    this.logger.debug('Checking for events starting now...');

    // Use actual UTC time for comparison since database stores UTC timestamps
    const now = new Date();

    try {
      // Find events that just started (within 1 minute window)
      // Exclude events that have ended (endsAt is in the past)
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            gte: new Date(now.getTime() - 30 * 1000), // 30 seconds before now (UTC)
            lte: new Date(now.getTime() + 30 * 1000), // 30 seconds after now (UTC)
          },
          OR: [
            { endsAt: null }, // Events without an end date
            { endsAt: { gt: now } }, // Events that haven't ended yet (UTC comparison)
          ],
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          code: true,
        },
      });

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Found ${events.length} event(s) starting now`);

      for (const event of events) {
        // Update event status to LIVE
        await this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.LIVE },
        });

        this.logger.log(`Updated event ${event.code} status to LIVE`);

        // Get all participants
        const participants = await this.databaseService.eventParticipant.findMany({
          where: { eventId: event.id },
          select: { userId: true },
        });

        for (const participant of participants) {
          await this.notificationsService.sendNotificationIfEnabled(
            participant.userId,
            {
              notification: {
                title: 'Event Started!',
                body: `${event.title} is now live`,
              },
              data: {
                type: 'EVENT_STARTED',
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

      this.logger.log(`Updated ${events.length} event(s) to LIVE and sent start notifications`);
    } catch (error: any) {
      this.logger.error(`Error sending start notifications: ${error.message}`, error.stack);
    }
  }

  /**
   * Runs every minute to check for events that should be LIVE and update their status
   */
  @Cron('* * * * *') // Every minute
  async updateScheduledToLiveStatus(): Promise<void> {
    this.logger.debug('Checking for events that should be LIVE...');

    // Use actual UTC time for comparison since database stores UTC timestamps
    const now = new Date();

    // Log for debugging timezone issues
    this.logger.debug(
      `Time check - WAT: ${getWATISOString(now)}, UTC ISO: ${now.toISOString()}, UTC Timestamp: ${now.getTime()}`,
    );

    try {
      // Find events with SCHEDULED status that should be LIVE (startsAt is in the past)
      // Exclude events that have ended (endsAt is in the past)
      // Database stores UTC timestamps, so we compare with actual UTC time
      const eventsToLive = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            lte: now, // startsAt (UTC) is in the past
          },
          OR: [
            { endsAt: null }, // Events without an end date
            { endsAt: { gt: now } }, // Events that haven't ended yet (UTC comparison)
          ],
        },
        select: {
          id: true,
          code: true,
          title: true,
          startsAt: true,
        },
      });

      if (eventsToLive.length === 0) {
        return;
      }

      this.logger.log(`Found ${eventsToLive.length} event(s) that should be LIVE`);

      // Update all events to LIVE status
      const updatePromises = eventsToLive.map((event) =>
        this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.LIVE },
        }),
      );

      await Promise.all(updatePromises);

      this.logger.log(
        `Updated ${eventsToLive.length} event(s) to LIVE status: ${eventsToLive.map((e) => e.code).join(', ')}`,
      );
    } catch (error: any) {
      this.logger.error(`Error updating scheduled events to LIVE status: ${error.message}`, error.stack);
    }
  }

  /**
   * Runs every minute to check for events that have ended and update their status to ENDED
   */
  @Cron('* * * * *') // Every minute
  async updateEndedEventsStatus(): Promise<void> {
    this.logger.debug('Checking for events that have ended...');

    // Use actual UTC time for comparison since database stores UTC timestamps
    const now = new Date();

    // Log for debugging timezone issues
    this.logger.debug(
      `Time check - WAT: ${getWATISOString(now)}, UTC ISO: ${now.toISOString()}, UTC Timestamp: ${now.getTime()}`,
    );

    try {
      // Find events that have ended (endsAt is in the past) but are still LIVE or SCHEDULED
      // Database stores UTC timestamps, so we compare with actual UTC time
      const endedEvents = await this.databaseService.event.findMany({
        where: {
          status: {
            in: [EventStatus.LIVE, EventStatus.SCHEDULED],
          },
          endsAt: {
            not: null,
            lte: now, // endsAt (UTC) is in the past
          },
        },
        select: {
          id: true,
          code: true,
          title: true,
          endsAt: true,
        },
      });

      if (endedEvents.length === 0) {
        return;
      }

      this.logger.log(`Found ${endedEvents.length} event(s) that have ended`);

      // Update all ended events to ENDED status
      const updatePromises = endedEvents.map((event) =>
        this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.ENDED },
        }),
      );

      await Promise.all(updatePromises);

      this.logger.log(
        `Updated ${endedEvents.length} event(s) to ENDED status: ${endedEvents.map((e) => e.code).join(', ')}`,
      );
    } catch (error: any) {
      this.logger.error(`Error updating ended events status: ${error.message}`, error.stack);
    }
  }
}
