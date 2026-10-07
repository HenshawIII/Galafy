import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications.service.js';
import { EventStatus } from '../../../generated/prisma/enums.js';
import { getWATISOString } from '../../common/utils/timezone.util.js';

const WINDOW_MS = 30 * 1000; // ±30s match window for minute cron
const MINUTE_MS = 60 * 1000;

type ReminderEvent = {
  id: string;
  title: string;
  startsAt: Date;
  endsAt: Date | null;
  code: string;
};

/**
 * Scheduled task for event status updates and reminder pushes.
 *
 * Ongoing-event pushes are capped at three points:
 * - Event start
 * - Mid-point of event duration
 * - 15 minutes before event end
 *
 * Pre-start: optional 10-minute reminder (before the event is ongoing).
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

    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * MINUTE_MS);

    try {
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          deletedAt: null,
          startsAt: {
            gte: new Date(tenMinutesFromNow.getTime() - WINDOW_MS),
            lte: new Date(tenMinutesFromNow.getTime() + WINDOW_MS),
          },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
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
        await this.notifyParticipants(event, {
          title: 'Event Starting Soon!',
          body: `${event.title} starts in 10 minutes`,
          type: 'EVENT_REMINDER_10MIN',
        });
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

    const now = new Date();

    try {
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          deletedAt: null,
          startsAt: {
            gte: new Date(now.getTime() - WINDOW_MS),
            lte: new Date(now.getTime() + WINDOW_MS),
          },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
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
        await this.databaseService.event.update({
          where: { id: event.id },
          data: { status: EventStatus.LIVE },
        });

        this.logger.log(`Updated event ${event.code} status to LIVE`);

        await this.notifyParticipants(event, {
          title: 'Event Started!',
          body: `${event.title} is now live`,
          type: 'EVENT_STARTED',
        });
      }

      this.logger.log(`Updated ${events.length} event(s) to LIVE and sent start notifications`);
    } catch (error: any) {
      this.logger.error(`Error sending start notifications: ${error.message}`, error.stack);
    }
  }

  /**
   * Mid-point of LIVE event duration (requires endsAt).
   * Skipped when midpoint is too close to start or to the 15-minutes-to-end mark.
   */
  @Cron('* * * * *') // Every minute
  async sendMidpointReminders(): Promise<void> {
    this.logger.debug('Checking for events at mid-point...');

    const now = new Date();

    try {
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.LIVE,
          deletedAt: null,
          endsAt: { not: null, gt: now },
          startsAt: { lt: now },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          code: true,
        },
      });

      const due = events.filter((event) => {
        if (!event.endsAt) return false;
        const durationMs = event.endsAt.getTime() - event.startsAt.getTime();
        if (durationMs < 20 * MINUTE_MS) return false; // too short for a distinct midpoint

        const midpoint = new Date(event.startsAt.getTime() + durationMs / 2);
        const fifteenBeforeEnd = new Date(event.endsAt.getTime() - 15 * MINUTE_MS);

        // Avoid stacking with start or end-soon reminders
        if (Math.abs(midpoint.getTime() - event.startsAt.getTime()) < 2 * MINUTE_MS) {
          return false;
        }
        if (Math.abs(midpoint.getTime() - fifteenBeforeEnd.getTime()) < 2 * MINUTE_MS) {
          return false;
        }

        return (
          midpoint.getTime() >= now.getTime() - WINDOW_MS &&
          midpoint.getTime() <= now.getTime() + WINDOW_MS
        );
      });

      if (due.length === 0) {
        return;
      }

      this.logger.log(`Found ${due.length} event(s) at mid-point`);

      for (const event of due) {
        await this.notifyParticipants(event, {
          title: 'Event Halfway There!',
          body: `${event.title} is halfway through — don't miss the action`,
          type: 'EVENT_REMINDER_MIDPOINT',
        });
      }

      this.logger.log(`Sent mid-point reminders for ${due.length} event(s)`);
    } catch (error: any) {
      this.logger.error(`Error sending mid-point reminders: ${error.message}`, error.stack);
    }
  }

  /**
   * 15 minutes before LIVE event end (requires endsAt after start + 15m).
   */
  @Cron('* * * * *') // Every minute
  async sendFifteenMinuteBeforeEndReminders(): Promise<void> {
    this.logger.debug('Checking for events ending in 15 minutes...');

    const now = new Date();
    const fifteenMinutesFromNow = new Date(now.getTime() + 15 * MINUTE_MS);

    try {
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.LIVE,
          deletedAt: null,
          endsAt: {
            gte: new Date(fifteenMinutesFromNow.getTime() - WINDOW_MS),
            lte: new Date(fifteenMinutesFromNow.getTime() + WINDOW_MS),
          },
          startsAt: {
            // Target must be after the event has started
            lt: fifteenMinutesFromNow,
          },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          endsAt: true,
          code: true,
        },
      });

      // Drop events shorter than ~15 minutes (T-15 would be at/before start)
      const due = events.filter((event) => {
        if (!event.endsAt) return false;
        const target = event.endsAt.getTime() - 15 * MINUTE_MS;
        return target > event.startsAt.getTime() + MINUTE_MS;
      });

      if (due.length === 0) {
        return;
      }

      this.logger.log(`Found ${due.length} event(s) ending in 15 minutes`);

      for (const event of due) {
        await this.notifyParticipants(event, {
          title: 'Event Ending Soon!',
          body: `${event.title} ends in 15 minutes`,
          type: 'EVENT_REMINDER_15MIN_END',
        });
      }

      this.logger.log(`Sent 15-minute-before-end reminders for ${due.length} event(s)`);
    } catch (error: any) {
      this.logger.error(
        `Error sending 15-minute-before-end reminders: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Runs every minute to check for events that should be LIVE and update their status
   */
  @Cron('* * * * *') // Every minute
  async updateScheduledToLiveStatus(): Promise<void> {
    this.logger.debug('Checking for events that should be LIVE...');

    const now = new Date();

    this.logger.debug(
      `Time check - WAT: ${getWATISOString(now)}, UTC ISO: ${now.toISOString()}, UTC Timestamp: ${now.getTime()}`,
    );

    try {
      const eventsToLive = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          deletedAt: null,
          startsAt: {
            lte: now,
          },
          OR: [{ endsAt: null }, { endsAt: { gt: now } }],
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

    const now = new Date();

    this.logger.debug(
      `Time check - WAT: ${getWATISOString(now)}, UTC ISO: ${now.toISOString()}, UTC Timestamp: ${now.getTime()}`,
    );

    try {
      const endedEvents = await this.databaseService.event.findMany({
        where: {
          status: {
            in: [EventStatus.LIVE, EventStatus.SCHEDULED],
          },
          deletedAt: null,
          endsAt: {
            not: null,
            lte: now,
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

  private async notifyParticipants(
    event: ReminderEvent,
    payload: { title: string; body: string; type: string },
  ): Promise<void> {
    const participants = await this.databaseService.eventParticipant.findMany({
      where: { eventId: event.id },
      select: { userId: true },
    });

    for (const participant of participants) {
      await this.notificationsService.sendNotificationIfEnabled(
        participant.userId,
        {
          notification: {
            title: payload.title,
            body: payload.body,
          },
          data: {
            type: payload.type,
            eventId: event.id,
            eventCode: event.code,
            eventTitle: event.title,
            startsAt: getWATISOString(event.startsAt),
            ...(event.endsAt ? { endsAt: getWATISOString(event.endsAt) } : {}),
          },
        },
        true, // Check event reminders preference
      );
    }
  }
}
