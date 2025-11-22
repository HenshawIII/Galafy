import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { FIREBASE_ADMIN } from './firesbase-admin.provider.js';
import * as admin from 'firebase-admin';
import {
  RegisterDeviceDto,
  SendMessageDto,
  SendBulkMessageDto,
  UpdateDeviceDto,
} from './dto/notification.dto.js';

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
      // Update existing device if it belongs to the same user, otherwise it's a conflict
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
        throw new BadRequestException('Device token is already registered to another user');
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
            username: true,
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
            username: true,
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
}
