import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEnum,
  IsObject,
  ValidateNested,
  IsArray,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RegisterDeviceDto {
  @ApiProperty({
    description: 'Device token for push notifications (FCM token)',
    example: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
  })
  @IsString({ message: 'Device token must be a string' })
  @IsNotEmpty({ message: 'Device token is required' })
  deviceToken: string;

  @ApiProperty({
    description: 'Device type',
    enum: ['web', 'android', 'ios'],
    example: 'ios',
  })
  @IsEnum(['web', 'android', 'ios'], {
    message: 'Device type must be one of: web, android, ios',
  })
  @IsNotEmpty({ message: 'Device type is required' })
  deviceType: 'web' | 'android' | 'ios';

  @ApiPropertyOptional({
    description: 'App version (optional)',
    example: '1.0.0',
  })
  @IsOptional()
  @IsString({ message: 'App version must be a string' })
  appVersion?: string;
}

export class NotificationDataDto {
  @ApiPropertyOptional({
    description: 'Custom data payload (key-value pairs)',
    example: { type: 'EVENT_REMINDER', eventId: 'event-uuid' },
    additionalProperties: { type: 'string' },
  })
  @IsOptional()
  @IsObject({ message: 'Data must be an object' })
  data?: Record<string, string>;

  @ApiPropertyOptional({
    description: 'Notification content (title, body, image)',
    example: {
      title: 'Event Starting Soon',
      body: 'Your event starts in 10 minutes',
      imageUrl: 'https://example.com/image.jpg',
    },
  })
  @IsOptional()
  @IsObject({ message: 'Notification must be an object' })
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
}

export class SendMessageDto {
  @ApiProperty({
    description: 'User ID to send notification to',
    example: 'user-uuid-123',
  })
  @IsString({ message: 'User ID must be a string' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ApiProperty({
    description: 'Notification data and content',
    type: NotificationDataDto,
  })
  @ValidateNested()
  @Type(() => NotificationDataDto)
  @IsNotEmpty({ message: 'Notification data is required' })
  notification: NotificationDataDto;
}

export class SendBulkMessageDto {
  @ApiProperty({
    description: 'Array of user IDs to send notification to',
    example: ['user-uuid-1', 'user-uuid-2', 'user-uuid-3'],
    type: [String],
  })
  @IsArray({ message: 'User IDs must be an array' })
  @IsString({ each: true, message: 'User IDs must be an array of strings' })
  @IsNotEmpty({ message: 'User IDs are required' })
  userIds: string[];

  @ApiProperty({
    description: 'Notification data and content',
    type: NotificationDataDto,
  })
  @ValidateNested()
  @Type(() => NotificationDataDto)
  @IsNotEmpty({ message: 'Notification data is required' })
  notification: NotificationDataDto;
}

export class UpdateDeviceDto {
  @ApiPropertyOptional({
    description: 'Updated device token for push notifications',
    example: 'fGhJkLmNoPqRsTuVwXyZ1234567890',
  })
  @IsOptional()
  @IsString({ message: 'Device token must be a string' })
  deviceToken?: string;

  @ApiPropertyOptional({
    description: 'Updated device type',
    enum: ['web', 'android', 'ios'],
    example: 'ios',
  })
  @IsOptional()
  @IsEnum(['web', 'android', 'ios'], {
    message: 'Device type must be one of: web, android, ios',
  })
  deviceType?: 'web' | 'android' | 'ios';

  @ApiPropertyOptional({
    description: 'Updated app version',
    example: '1.0.1',
  })
  @IsOptional()
  @IsString({ message: 'App version must be a string' })
  appVersion?: string;

  @ApiPropertyOptional({
    description: 'Device active status',
    example: true,
  })
  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}
