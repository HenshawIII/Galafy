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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
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
   * Note: In production, userId should be extracted from JWT token
   */
  @Post('devices/register')
  async registerDevice(
    @Body(ValidationPipe) body: RegisterDeviceDto & { userId: string },
  ) {
    const { userId, ...registerDeviceDto } = body;
    return this.notificationsService.registerDevice(userId, registerDeviceDto);
  }

  /**
   * Get all device tokens for a user
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/user/:userId')
  async getUserTokens(@Param('userId') userId: string) {
    return this.notificationsService.getUserTokens(userId);
  }

  /**
   * Get all devices for a user (with full details)
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/user/:userId/all')
  async getUserDevices(@Param('userId') userId: string) {
    return this.notificationsService.getUserDevices(userId);
  }

  /**
   * Get a specific device by ID
   * Note: In production, userId should be extracted from JWT token
   */
  @Get('devices/:deviceId')
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
  async getAllTokens() {
    return this.notificationsService.getAllTokens();
  }

  /**
   * Send a notification to a specific user
   * Note: Add admin/authorized guard in production
   */
  @Post('send')
  async sendMessage(@Body(ValidationPipe) sendMessageDto: SendMessageDto) {
    return this.notificationsService.sendMessage(sendMessageDto);
  }

  /**
   * Send a notification to multiple users
   * Note: Add admin guard in production
   */
  @Post('send/bulk')
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
  async removeDevice(
    @Param('deviceId') deviceId: string,
    @Query('userId') userId: string,
  ) {
    return this.notificationsService.removeDevice(deviceId, userId);
  }
}
