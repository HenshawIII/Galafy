import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { DatabaseService } from '../../database/database.service.js';
import { NotificationsService } from '../notifications.service.js';
import { EventStatus, SprayStatus } from '../../../generated/prisma/enums.js';

/**
 * Scheduled task to send rejoin notifications to users who left events
 * Sends notifications to users who left an ongoing event more than 15 minutes ago
 */
@Injectable()
export class RejoinNotificationsTask {
  private readonly logger = new Logger(RejoinNotificationsTask.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Runs every 5 minutes to check for users who left events >15 mins ago
   * Throttled to send at most once per hour per user to prevent spam
   * Note: This tracks users who called leaveEvent() - we'll need to enhance this
   * to track websocket disconnections in the future
   */
  @Cron('*/5 * * * *') // Every 5 minutes
  async sendRejoinNotifications(): Promise<void> {
    this.logger.debug('Checking for users who left events >15 minutes ago...');

    const now = new Date();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

    try {
      // Find all LIVE events
      const liveEvents = await this.databaseService.event.findMany({
        where: {
          status: EventStatus.LIVE,
        },
        select: {
          id: true,
          title: true,
          code: true,
          createdAt: true,
        },
      });

      if (liveEvents.length === 0) {
        return;
      }

      let totalNotificationsSent = 0;

      for (const event of liveEvents) {
        // Get event statistics for custom messages
        const sprayStats = await this.databaseService.spray.aggregate({
          where: { eventId: event.id, status: SprayStatus.CONFIRMED },
          _count: { id: true },
          _sum: { totalAmount: true },
        });

        // Get top spray (highest single spray amount) with sprayer info
        const topSpray = await this.databaseService.spray.findFirst({
          where: { eventId: event.id, status: SprayStatus.CONFIRMED },
          orderBy: { totalAmount: 'desc' },
          include: {
            sprayerWallet: {
              include: {
                customer: {
                  include: {
                    user: {
                      select: {
                        username: true,
                        firstName: true,
                        lastName: true,
                      },
                    },
                  },
                },
              },
            },
          },
        });

        // Custom notification messages
        const customMessages = ['View Top Sprayer', 'Event is doing well', "Don't miss out on the action!"];

        // Randomly select a message
        const randomMessage = customMessages[Math.floor(Math.random() * customMessages.length)];

        // For now, we'll track this differently - we need to add a table to track
        // when users leave events. For MVP, we'll check if there are any participants
        // who haven't been active (this is a simplified approach)
        // TODO: Add proper tracking of when users leave/opt out

        // Get all participants who joined before the event started
        // (simplified: we'll notify all participants as a fallback)
        // In production, you'd track last seen/activity time
        const participants = await this.databaseService.eventParticipant.findMany({
          where: {
            eventId: event.id,
            joinedAt: {
              lt: fifteenMinutesAgo, // Joined more than 15 mins ago
            },
          },
          select: {
            userId: true,
            joinedAt: true,
          },
        });

        for (const participant of participants) {
          // Check if user received EVENT_REJOIN notification in the last hour (throttling)
          const recentNotification = await this.databaseService.notification.findFirst({
            where: {
              userId: participant.userId,
              type: 'EVENT_REJOIN',
              createdAt: {
                gte: oneHourAgo, // Within the last hour
              },
            },
            orderBy: {
              createdAt: 'desc',
            },
          });

          // Skip if user received a rejoin notification in the last hour
          if (recentNotification) {
            continue;
          }

          // Build notification body with custom message
          let notificationBody = `${event.title} is still ongoing. ${randomMessage}`;

          if (topSpray) {
            const sprayerName =
              topSpray.sprayerWallet.customer?.user?.username ||
              topSpray.sprayerWallet.customer?.user?.firstName ||
              'Someone';
            notificationBody = `${event.title} is still ongoing. ${sprayerName} is leading!`;
          }

          await this.notificationsService.sendNotificationIfEnabled(
            participant.userId,
            {
              notification: {
                title: 'Rejoin Event',
                body: notificationBody,
              },
              data: {
                type: 'EVENT_REJOIN',
                eventId: event.id,
                eventCode: event.code,
                eventTitle: event.title,
                customMessage: randomMessage,
                sprayCount: String(sprayStats._count?.id ?? 0),
              },
            },
            true,
          );

          totalNotificationsSent++;
        }
      }

      if (totalNotificationsSent > 0) {
        this.logger.log(`Sent ${totalNotificationsSent} rejoin notification(s) for ${liveEvents.length} event(s)`);
      }
    } catch (error: any) {
      this.logger.error(`Error sending rejoin notifications: ${error.message}`, error.stack);
    }
  }
}
