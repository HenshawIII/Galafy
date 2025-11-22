import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsEnum, IsObject, ValidateNested, IsArray } from 'class-validator';
import { Type } from 'class-transformer';

export class RegisterDeviceDto {
  @IsString({ message: 'Device token must be a string' })
  @IsNotEmpty({ message: 'Device token is required' })
  deviceToken: string;

  @IsEnum(['web', 'android', 'ios'], {
    message: 'Device type must be one of: web, android, ios',
  })
  @IsNotEmpty({ message: 'Device type is required' })
  deviceType: 'web' | 'android' | 'ios';

  @IsOptional()
  @IsString({ message: 'App version must be a string' })
  appVersion?: string;
}

export class NotificationDataDto {
  @IsOptional()
  @IsObject({ message: 'Data must be an object' })
  data?: Record<string, string>;

  @IsOptional()
  @IsObject({ message: 'Notification must be an object' })
  notification?: {
    title: string;
    body: string;
    imageUrl?: string;
  };
}

export class SendMessageDto {
  @IsString({ message: 'User ID must be a string' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ValidateNested()
  @Type(() => NotificationDataDto)
  @IsNotEmpty({ message: 'Notification data is required' })
  notification: NotificationDataDto;
}

export class SendBulkMessageDto {
  @IsArray({ message: 'User IDs must be an array' })
  @IsString({ each: true, message: 'User IDs must be an array of strings' })
  @IsNotEmpty({ message: 'User IDs are required' })
  userIds: string[];

  @ValidateNested()
  @Type(() => NotificationDataDto)
  @IsNotEmpty({ message: 'Notification data is required' })
  notification: NotificationDataDto;
}

export class UpdateDeviceDto {
  @IsOptional()
  @IsString({ message: 'Device token must be a string' })
  deviceToken?: string;

  @IsOptional()
  @IsEnum(['web', 'android', 'ios'], {
    message: 'Device type must be one of: web, android, ios',
  })
  deviceType?: 'web' | 'android' | 'ios';

  @IsOptional()
  @IsString({ message: 'App version must be a string' })
  appVersion?: string;

  @IsOptional()
  @IsBoolean({ message: 'isActive must be a boolean' })
  isActive?: boolean;
}

