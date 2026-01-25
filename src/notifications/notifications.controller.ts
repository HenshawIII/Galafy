import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ValidationPipe,
  UseGuards,
  Request,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiUnauthorizedResponse, ApiExcludeEndpoint, ApiBody, ApiParam, ApiQuery } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service.js';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import {
  RegisterDeviceDto,
  SendMessageDto,
  SendBulkMessageDto,
  UpdateDeviceDto,
} from './dto/notification.dto.js';

@ApiTags('notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class NotificationsController {
  constructor(private readonly notificationsService: NotificationsService) {}

  /**
   * Register a device token for push notifications
   * User ID is extracted from the JWT token
   */
  @Post('devices/register')
  @ApiOperation({
    summary: 'Register a device for push notifications',
    description: 'Registers a device token (FCM token) for receiving push notifications. User ID is automatically extracted from the authentication token. If the device token already exists, it will be updated.',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        deviceToken: {
          type: 'string',
          example: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
          description: 'FCM device token',
        },
        deviceType: {
          type: 'string',
          enum: ['web', 'android', 'ios'],
          example: 'ios',
          description: 'Device type',
        },
        appVersion: {
          type: 'string',
          example: '1.0.0',
          description: 'App version (optional)',
        },
      },
      required: ['deviceToken', 'deviceType'],
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Device registered successfully',
    schema: {
      example: {
        id: 'device-uuid',
        userId: 'user-uuid-123',
        deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
        deviceType: 'ios',
        appVersion: '1.0.0',
        isActive: true,
        lastSeenAt: '2025-01-25T10:00:00.000Z',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request - Invalid device token or device already registered to another user' })
  @ApiResponse({ status: 404, description: 'User not found' })
  async registerDevice(
    @Request() req: any,
    @Body(ValidationPipe) registerDeviceDto: RegisterDeviceDto,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }
    return this.notificationsService.registerDevice(userId, registerDeviceDto);
  }

  /**
   * Get all device tokens for a user
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/user/:userId')
  @ApiOperation({
    summary: 'Get all active device tokens for a user',
    description: 'Retrieves all active device tokens registered for a specific user.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: 'user-uuid-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Device tokens retrieved successfully',
    schema: {
      example: {
        userId: 'user-uuid-123',
        count: 2,
        devices: [
          {
            id: 'device-uuid-1',
            deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
            deviceType: 'ios',
            appVersion: '1.0.0',
            isActive: true,
            lastSeenAt: '2025-01-25T10:00:00.000Z',
            createdAt: '2025-01-25T10:00:00.000Z',
            updatedAt: '2025-01-25T10:00:00.000Z',
          },
        ],
      },
    },
  })
  @ApiResponse({ status: 404, description: 'User not found' })
  async getUserTokens(@Param('userId') userId: string) {
    return this.notificationsService.getUserTokens(userId);
  }

  /**
   * Get all devices for a user (with full details)
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/user/:userId/all')
  @ApiOperation({
    summary: 'Get all devices for a user (including inactive)',
    description: 'Retrieves all devices (both active and inactive) registered for a specific user, ordered by last seen date.',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: 'user-uuid-123',
  })
  @ApiResponse({
    status: 200,
    description: 'Devices retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          userId: { type: 'string' },
          deviceToken: { type: 'string' },
          deviceType: { type: 'string' },
          appVersion: { type: 'string' },
          isActive: { type: 'boolean' },
          lastSeenAt: { type: 'string', format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
          updatedAt: { type: 'string', format: 'date-time' },
        },
      },
    },
  })
  async getUserDevices(@Param('userId') userId: string) {
    return this.notificationsService.getUserDevices(userId);
  }

  /**
   * Get a specific device by ID
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/:deviceId')
  @ApiOperation({
    summary: 'Get a specific device by ID',
    description: 'Retrieves details of a specific device including user information.',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    example: 'device-uuid-123',
  })
  @ApiQuery({
    name: 'userId',
    description: 'User ID (for ownership verification)',
    example: 'user-uuid-123',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Device retrieved successfully',
    schema: {
      example: {
        id: 'device-uuid-123',
        userId: 'user-uuid-123',
        deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
        deviceType: 'ios',
        appVersion: '1.0.0',
        isActive: true,
        lastSeenAt: '2025-01-25T10:00:00.000Z',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
        user: {
          id: 'user-uuid-123',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 400, description: 'Device does not belong to this user' })
  async getDevice(
    @Param('deviceId') deviceId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.getDevice(deviceId, userId);
  }

  /**
   * Get all device tokens (admin only)
   * Note: Add admin guard in production
   */
  @Get('devices')
  @ApiExcludeEndpoint()
  async getAllTokens() {
    return this.notificationsService.getAllTokens();
  }

  /**
   * Send a notification to a specific user
   * Note: Add admin/authorized guard in production
   */
  @Post('send')
  @ApiExcludeEndpoint()
  async sendMessage(@Body(ValidationPipe) sendMessageDto: SendMessageDto) {
    return this.notificationsService.sendMessage(sendMessageDto);
  }

  /**
   * Send a notification to multiple users
   * Note: Add admin guard in production
   */
  @Post('send/bulk')
  @ApiExcludeEndpoint()
  async sendBulkMessage(
    @Body(ValidationPipe) sendBulkMessageDto: SendBulkMessageDto,
  ) {
    return this.notificationsService.sendBulkMessage(sendBulkMessageDto);
  }

  /**
   * Update a device registration
   * Note: In production, userId should be extracted from JWT token
   */
  @Patch('devices/:deviceId')
  @ApiOperation({
    summary: 'Update a device registration',
    description: 'Updates device information such as device token, device type, app version, or active status.',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    example: 'device-uuid-123',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          example: 'user-uuid-123',
          description: 'User ID (in production, this should be extracted from JWT token)',
        },
        deviceToken: {
          type: 'string',
          example: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
          description: 'Updated device token (optional)',
        },
        deviceType: {
          type: 'string',
          enum: ['web', 'android', 'ios'],
          example: 'ios',
          description: 'Updated device type (optional)',
        },
        appVersion: {
          type: 'string',
          example: '1.0.1',
          description: 'Updated app version (optional)',
        },
        isActive: {
          type: 'boolean',
          example: true,
          description: 'Device active status (optional)',
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Device updated successfully',
    schema: {
      example: {
        id: 'device-uuid-123',
        userId: 'user-uuid-123',
        deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
        deviceType: 'ios',
        appVersion: '1.0.1',
        isActive: true,
        lastSeenAt: '2025-01-25T10:00:00.000Z',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:05:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 400, description: 'Device does not belong to this user or device token already registered' })
  async updateDevice(
    @Param('deviceId') deviceId: string,
    @Body(ValidationPipe) body: UpdateDeviceDto & { userId: string },
  ) {
    const { userId, ...updateDeviceDto } = body;
    return this.notificationsService.updateDevice(
      deviceId,
      userId,
      updateDeviceDto,
    );
  }

  /**
   * Deactivate a device (soft delete)
   * Note: In production, userId should be extracted from JWT token
   */
  @Patch('devices/:deviceId/deactivate')
  @ApiOperation({
    summary: 'Deactivate a device (soft delete)',
    description: 'Deactivates a device by setting isActive to false. The device record is preserved but will not receive notifications.',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    example: 'device-uuid-123',
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        userId: {
          type: 'string',
          example: 'user-uuid-123',
          description: 'User ID (in production, this should be extracted from JWT token)',
        },
      },
      required: ['userId'],
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Device deactivated successfully',
    schema: {
      example: {
        id: 'device-uuid-123',
        userId: 'user-uuid-123',
        deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
        deviceType: 'ios',
        appVersion: '1.0.0',
        isActive: false,
        lastSeenAt: '2025-01-25T10:00:00.000Z',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:05:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 400, description: 'Device does not belong to this user' })
  async deactivateDevice(
    @Param('deviceId') deviceId: string,
    @Body('userId') userId: string,
  ) {
    return this.notificationsService.deactivateDevice(deviceId, userId);
  }

  /**
   * Remove a device (hard delete)
   * Note: In production, userId should be extracted from JWT token
   */
  @Delete('devices/:deviceId')
  @ApiOperation({
    summary: 'Remove a device (hard delete)',
    description: 'Permanently deletes a device registration from the database.',
  })
  @ApiParam({
    name: 'deviceId',
    description: 'Device ID',
    example: 'device-uuid-123',
  })
  @ApiQuery({
    name: 'userId',
    description: 'User ID (for ownership verification)',
    example: 'user-uuid-123',
    required: true,
  })
  @ApiResponse({
    status: 200,
    description: 'Device removed successfully',
    schema: {
      example: {
        id: 'device-uuid-123',
        userId: 'user-uuid-123',
        deviceToken: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
        deviceType: 'ios',
        appVersion: '1.0.0',
        isActive: true,
        lastSeenAt: '2025-01-25T10:00:00.000Z',
        createdAt: '2025-01-25T10:00:00.000Z',
        updatedAt: '2025-01-25T10:00:00.000Z',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Device not found' })
  @ApiResponse({ status: 400, description: 'Device does not belong to this user' })
  async removeDevice(
    @Param('deviceId') deviceId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.removeDevice(deviceId, userId);
  }

  /**
   * Get user's notifications
   */
  @Get()
  @ApiOperation({
    summary: 'Get user notifications',
    description: 'Retrieves notifications for the authenticated user. Returns unread count and list of notifications sorted by creation date (newest first).',
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Maximum number of notifications to return (default: 20)',
    example: 20,
  })
  @ApiQuery({
    name: 'offset',
    required: false,
    type: Number,
    description: 'Number of notifications to skip (default: 0)',
    example: 0,
  })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'If true, only return unread notifications',
    example: false,
  })
  @ApiResponse({
    status: 200,
    description: 'Notifications retrieved successfully',
    schema: {
      example: {
        unread: 5,
        notifications: [
          {
            id: 'notification-uuid',
            message: 'Event Starting Soon!',
            title: 'Event Starting Soon!',
            type: 'EVENT_REMINDER_10MIN',
            data: {
              type: 'EVENT_REMINDER_10MIN',
              eventId: 'event-uuid',
              eventCode: 'ABC123',
              eventTitle: 'Birthday Celebration',
            },
            unread: true,
            createdAt: '2025-01-25T10:00:00.000Z',
          },
        ],
      },
    },
  })
  async getNotifications(
    @Request() req: any,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
    @Query('unreadOnly') unreadOnly?: boolean,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    return this.notificationsService.getUserNotifications(
      userId,
      limit || 20,
      offset || 0,
      unreadOnly === true,
    );
  }

  /**
   * Mark a notification as read
   */
  @Patch(':id/read')
  @ApiOperation({
    summary: 'Mark a notification as read',
    description: 'Marks a specific notification as read for the authenticated user.',
  })
  @ApiParam({
    name: 'id',
    description: 'Notification ID',
    example: 'notification-uuid',
  })
  @ApiResponse({
    status: 200,
    description: 'Notification marked as read successfully',
    schema: {
      example: {
        id: 'notification-uuid',
        read: true,
        message: 'Notification marked as read',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @ApiResponse({ status: 403, description: 'Notification does not belong to this user' })
  async markNotificationAsRead(
    @Request() req: any,
    @Param('id') notificationId: string,
  ) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    return this.notificationsService.markNotificationAsRead(notificationId, userId);
  }

  /**
   * Mark all notifications as read
   */
  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all notifications as read',
    description: 'Marks all unread notifications for the authenticated user as read.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications marked as read successfully',
    schema: {
      example: {
        count: 5,
        message: '5 notification(s) marked as read',
      },
    },
  })
  async markAllNotificationsAsRead(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    return this.notificationsService.markAllNotificationsAsRead(userId);
  }

  /**
   * Delete all notifications for a user
   */
  @Delete()
  @ApiOperation({
    summary: 'Delete all notifications',
    description: 'Deletes all notifications (both read and unread) for the authenticated user.',
  })
  @ApiResponse({
    status: 200,
    description: 'All notifications deleted successfully',
    schema: {
      example: {
        count: 10,
        message: '10 notification(s) deleted successfully',
      },
    },
  })
  async deleteAllNotifications(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    return this.notificationsService.deleteAllNotifications(userId);
  }
}
