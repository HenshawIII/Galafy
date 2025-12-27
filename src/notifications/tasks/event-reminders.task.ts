import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications.service.js';
import { EventStatus } from '../../../generated/prisma/enums.js';

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

    const now = new Date();
    const tenMinutesFromNow = new Date(now.getTime() + 10 * 60 * 1000);

    try {
      // Find events starting in approximately 10 minutes (within 1 minute window)
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            gte: new Date(tenMinutesFromNow.getTime() - 30 * 1000), // 30 seconds before
            lte: new Date(tenMinutesFromNow.getTime() + 30 * 1000), // 30 seconds after
          },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
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
                startsAt: event.startsAt.toISOString(),
              },
            },
            true, // Check event reminders preference
          );
        }
      }

      this.logger.log(`Sent 10-minute reminders for ${events.length} event(s)`);
    } catch (error: any) {
      this.logger.error(
        `Error sending 10-minute reminders: ${error.message}`,
        error.stack,
      );
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
      // Find events that just started (within 1 minute window)
      const events = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.SCHEDULED,
          startsAt: {
            gte: new Date(now.getTime() - 30 * 1000), // 30 seconds before now
            lte: new Date(now.getTime() + 30 * 1000), // 30 seconds after now
          },
        },
        select: {
          id: true,
          title: true,
          startsAt: true,
          code: true,
        },
      });

      if (events.length === 0) {
        return;
      }

      this.logger.log(`Found ${events.length} event(s) starting now`);

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
                title: 'Event Started!',
                body: `${event.title} is now live`,
              },
              data: {
                type: 'EVENT_STARTED',
                eventId: event.id,
                eventCode: event.code,
                eventTitle: event.title,
                startsAt: event.startsAt.toISOString(),
              },
            },
            true, // Check event reminders preference
          );
        }
      }

      this.logger.log(`Sent start notifications for ${events.length} event(s)`);
    } catch (error: any) {
      this.logger.error(
        `Error sending start notifications: ${error.message}`,
        error.stack,
      );
    }
  }
}

