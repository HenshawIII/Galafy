import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { FIREBASE_ADMIN } from './firesbase-admin.provider.js';
import * as admin from 'firebase-admin';
import { RegisterDeviceDto, SendMessageDto, SendBulkMessageDto, UpdateDeviceDto } from './dto/notification.dto.js';

@Injectable()
export class NotificationsService {
  constructor(
    private readonly databaseService: DatabaseService,
    @Inject(FIREBASE_ADMIN) private readonly firebaseAdmin: admin.app.App,
  ) {}

  /**
   * Register a device token for a user
   */
  async registerDevice(userId: string, registerDeviceDto: RegisterDeviceDto) {
    // Check if user exists
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if device token already exists for this user
    const existingDevice = await this.databaseService.notificationDevice.findUnique({
      where: { deviceToken: registerDeviceDto.deviceToken },
    });

    if (existingDevice) {
      // If device belongs to the same user, just update it
      if (existingDevice.userId === userId) {
        return await this.databaseService.notificationDevice.update({
          where: { id: existingDevice.id },
          data: {
            deviceType: registerDeviceDto.deviceType,
            appVersion: registerDeviceDto.appVersion,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
      } else {
        // Device belongs to a different user - transfer ownership
        // This handles the case where a user logs out and another user logs in on the same device
        // The device is now owned by the currently logged-in user
        return await this.databaseService.notificationDevice.update({
          where: { id: existingDevice.id },
          data: {
            userId, // Transfer to new user
            deviceType: registerDeviceDto.deviceType,
            appVersion: registerDeviceDto.appVersion,
            isActive: true,
            lastSeenAt: new Date(),
          },
        });
      }
    }

    // Create new device registration
    return await this.databaseService.notificationDevice.create({
      data: {
        userId,
        deviceToken: registerDeviceDto.deviceToken,
        deviceType: registerDeviceDto.deviceType,
        appVersion: registerDeviceDto.appVersion,
        isActive: true,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Get all device tokens for a user
   */
  async getUserTokens(userId: string) {
    const devices = await this.databaseService.notificationDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
      select: {
        id: true,
        deviceToken: true,
        deviceType: true,
        appVersion: true,
        isActive: true,
        lastSeenAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      userId,
      devices,
      count: devices.length,
    };
  }

  /**
   * Get all device tokens (for admin use)
   */
  async getAllTokens() {
    const devices = await this.databaseService.notificationDevice.findMany({
      where: {
        isActive: true,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    return {
      devices,
      count: devices.length,
    };
  }

  /**
   * Send a notification to a specific user
   */
  async sendMessage(sendMessageDto: SendMessageDto) {
    const { userId, notification } = sendMessageDto;

    // Get all active device tokens for the user
    const devices = await this.databaseService.notificationDevice.findMany({
      where: {
        userId,
        isActive: true,
      },
    });

    if (devices.length === 0) {
      throw new NotFoundException('No active devices found for this user');
    }

    const tokens = devices.map((device) => device.deviceToken);
    const results = await this.sendToTokens(tokens, notification);

    // Update lastSeenAt for devices that received the notification
    const successfulTokens = results
      .map((result, index) => (result.success ? tokens[index] : null))
      .filter((token) => token !== null);

    if (successfulTokens.length > 0) {
      await this.databaseService.notificationDevice.updateMany({
        where: {
          deviceToken: { in: successfulTokens },
        },
        data: {
          lastSeenAt: new Date(),
        },
      });
    }

    return {
      success: true,
      sent: successfulTokens.length,
      failed: results.length - successfulTokens.length,
      results,
    };
  }

  /**
   * Send a notification to multiple users
   */
  async sendBulkMessage(sendBulkMessageDto: SendBulkMessageDto) {
    const { userIds, notification } = sendBulkMessageDto;

    // Get all active device tokens for all users
    const devices = await this.databaseService.notificationDevice.findMany({
      where: {
        userId: { in: userIds },
        isActive: true,
      },
    });

    if (devices.length === 0) {
      throw new NotFoundException('No active devices found for the specified users');
    }

    const tokens = devices.map((device) => device.deviceToken);
    const results = await this.sendToTokens(tokens, notification);

    // Update lastSeenAt for devices that received the notification
    const successfulTokens = results
      .map((result, index) => (result.success ? tokens[index] : null))
      .filter((token) => token !== null);

    if (successfulTokens.length > 0) {
      await this.databaseService.notificationDevice.updateMany({
        where: {
          deviceToken: { in: successfulTokens },
        },
        data: {
          lastSeenAt: new Date(),
        },
      });
    }

    return {
      success: true,
      sent: successfulTokens.length,
      failed: results.length - successfulTokens.length,
      totalDevices: devices.length,
      results,
    };
  }

  /**
   * Send notification to specific device tokens
   */
  private async sendToTokens(
    tokens: string[],
    notification: SendMessageDto['notification'],
  ): Promise<Array<{ success: boolean; token: string; error?: string }>> {
    if (tokens.length === 0) {
      return [];
    }

    const messaging = this.firebaseAdmin.messaging();

    // Prepare the message payload
    const message: admin.messaging.MulticastMessage = {
      tokens,
      data: notification.data || {},
      notification: notification.notification
        ? {
            title: notification.notification.title,
            body: notification.notification.body,
            imageUrl: notification.notification.imageUrl,
          }
        : undefined,
      apns: {
        payload: {
          aps: {
            sound: 'default',
          },
        },
      },
      android: {
        priority: 'high',
        notification: {
          sound: 'default',
        },
      },
    };

    try {
      const response = await messaging.sendEachForMulticast(message);

      return tokens.map((token, index) => {
        const result = response.responses[index];
        return {
          success: result.success,
          token,
          error: result.error ? result.error.message : undefined,
        };
      });
    } catch (error) {
      // If batch send fails, try individual sends
      const results: Array<{ success: boolean; token: string; error?: string }> = [];

      for (const token of tokens) {
        try {
          const singleMessage: admin.messaging.Message = {
            token,
            data: notification.data || {},
            notification: notification.notification
              ? {
                  title: notification.notification.title,
                  body: notification.notification.body,
                  imageUrl: notification.notification.imageUrl,
                }
              : undefined,
            apns: {
              payload: {
                aps: {
                  sound: 'default',
                },
              },
            },
            android: {
              priority: 'high',
              notification: {
                sound: 'default',
              },
            },
          };

          await messaging.send(singleMessage);
          results.push({ success: true, token });
        } catch (err: any) {
          results.push({
            success: false,
            token,
            error: err.message || 'Failed to send notification',
          });
        }
      }

      return results;
    }
  }

  /**
   * Update a device registration
   */
  async updateDevice(deviceId: string, userId: string, updateDeviceDto: UpdateDeviceDto) {
    // Check if device exists and belongs to user
    const device = await this.databaseService.notificationDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new BadRequestException('Device does not belong to this user');
    }

    // If deviceToken is being updated, check if new token already exists
    if (updateDeviceDto.deviceToken && updateDeviceDto.deviceToken !== device.deviceToken) {
      const existingDevice = await this.databaseService.notificationDevice.findUnique({
        where: { deviceToken: updateDeviceDto.deviceToken },
      });

      if (existingDevice) {
        throw new BadRequestException('Device token is already registered');
      }
    }

    return await this.databaseService.notificationDevice.update({
      where: { id: deviceId },
      data: {
        ...updateDeviceDto,
        lastSeenAt: new Date(),
      },
    });
  }

  /**
   * Deactivate all push devices for a user (e.g. on logout).
   */
  async deactivateAllDevicesForUser(userId: string): Promise<{ deactivated: number }> {
    const result = await this.databaseService.notificationDevice.updateMany({
      where: { userId, isActive: true },
      data: { isActive: false },
    });
    return { deactivated: result.count };
  }

  /**
   * Deactivate a device (soft delete)
   */
  async deactivateDevice(deviceId: string, userId: string) {
    const device = await this.databaseService.notificationDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new BadRequestException('Device does not belong to this user');
    }

    return await this.databaseService.notificationDevice.update({
      where: { id: deviceId },
      data: {
        isActive: false,
      },
    });
  }

  /**
   * Remove a device (hard delete)
   */
  async removeDevice(deviceId: string, userId: string) {
    const device = await this.databaseService.notificationDevice.findUnique({
      where: { id: deviceId },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new BadRequestException('Device does not belong to this user');
    }

    return await this.databaseService.notificationDevice.delete({
      where: { id: deviceId },
    });
  }

  /**
   * Get device by ID
   */
  async getDevice(deviceId: string, userId: string) {
    const device = await this.databaseService.notificationDevice.findUnique({
      where: { id: deviceId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });

    if (!device) {
      throw new NotFoundException('Device not found');
    }

    if (device.userId !== userId) {
      throw new BadRequestException('Device does not belong to this user');
    }

    return device;
  }

  /**
   * Get all devices for a user
   */
  async getUserDevices(userId: string) {
    return await this.databaseService.notificationDevice.findMany({
      where: {
        userId,
      },
      orderBy: {
        lastSeenAt: 'desc',
      },
    });
  }

  /**
   * Get user notifications
   */
  async getUserNotifications(userId: string, limit: number = 20, offset: number = 0, unreadOnly: boolean = false) {
    // Get unread count
    const unreadCount = await this.databaseService.notification.count({
      where: {
        userId,
        read: false,
      },
    });

    // Build where clause
    const where: any = { userId };
    if (unreadOnly) {
      where.read = false;
    }

    // Get notifications
    const notifications = await this.databaseService.notification.findMany({
      where,
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
    });

    // Format response
    return {
      unread: unreadCount,
      notifications: notifications.map((notification) => ({
        id: notification.id,
        message: notification.message,
        title: notification.title,
        type: notification.type,
        data: notification.data,
        unread: !notification.read,
        createdAt: notification.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Check if user has push notifications enabled
   */
  async isPushNotificationEnabled(userId: string): Promise<boolean> {
    const settings = await this.databaseService.userSettings.findUnique({
      where: { userId },
      select: { pushNotifications: true },
    });

    // Default to true if settings don't exist
    return settings?.pushNotifications ?? true;
  }

  /**
   * Check if user has event reminders enabled
   */
  async isEventReminderEnabled(userId: string): Promise<boolean> {
    const settings = await this.databaseService.userSettings.findUnique({
      where: { userId },
      select: { eventReminders: true },
    });

    // Default to true if settings don't exist
    return settings?.eventReminders ?? true;
  }

  /**
   * Save notification to database
   */
  private async saveNotification(userId: string, notification: SendMessageDto['notification']): Promise<void> {
    try {
      const type = notification.data?.type || 'UNKNOWN';
      const title = notification.notification?.title || '';
      const message = notification.notification?.body || '';
      const data = notification.data || {};

      await this.databaseService.notification.create({
        data: {
          userId,
          type,
          title,
          message,
          data,
          read: false,
        },
      });
    } catch (error: any) {
      // Log error but don't fail the notification send
      console.error(`Failed to save notification to database: ${error.message}`);
    }
  }

  /**
   * Send notification to user if enabled (respects user preferences)
   */
  async sendNotificationIfEnabled(
    userId: string,
    notification: SendMessageDto['notification'],
    checkReminders: boolean = false,
  ) {
    // Check if push notifications are enabled
    const pushEnabled = await this.isPushNotificationEnabled(userId);
    if (!pushEnabled) {
      return { skipped: true, reason: 'Push notifications disabled' };
    }

    // If checking reminders, also verify event reminders are enabled
    if (checkReminders) {
      const remindersEnabled = await this.isEventReminderEnabled(userId);
      if (!remindersEnabled) {
        return { skipped: true, reason: 'Event reminders disabled' };
      }
    }

    // Save notification to database before sending push
    await this.saveNotification(userId, notification);

    // Send the notification
    try {
      return await this.sendMessage({ userId, notification });
    } catch (error: any) {
      return { skipped: false, error: error.message };
    }
  }

  /**
   * Mark a notification as read
   */
  async markNotificationAsRead(notificationId: string, userId: string) {
    // Verify notification exists and belongs to user
    const notification = await this.databaseService.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new NotFoundException('Notification not found');
    }

    if (notification.userId !== userId) {
      throw new BadRequestException('Notification does not belong to this user');
    }

    // Mark as read
    const updated = await this.databaseService.notification.update({
      where: { id: notificationId },
      data: { read: true },
    });

    return {
      id: updated.id,
      read: updated.read,
      message: 'Notification marked as read',
    };
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllNotificationsAsRead(userId: string) {
    const result = await this.databaseService.notification.updateMany({
      where: {
        userId,
        read: false,
      },
      data: {
        read: true,
      },
    });

    return {
      count: result.count,
      message: `${result.count} notification(s) marked as read`,
    };
  }

  /**
   * Delete all notifications for a user
   */
  async deleteAllNotifications(userId: string) {
    const result = await this.databaseService.notification.deleteMany({
      where: {
        userId,
      },
    });

    return {
      count: result.count,
      message: `${result.count} notification(s) deleted successfully`,
    };
  }
}
