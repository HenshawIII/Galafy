import { IsOptional, IsString, IsDateString, IsInt, Min, IsEnum } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum NotificationReadStatusFilter {
  read = 'read',
  unread = 'unread',
}

export class GetNotificationsDto {
  @ApiPropertyOptional({ example: 1, description: 'Page number', default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ example: 20, description: 'Items per page', default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({
    enum: NotificationReadStatusFilter,
    example: NotificationReadStatusFilter.unread,
    description: 'Filter by read status',
  })
  @IsOptional()
  @IsEnum(NotificationReadStatusFilter)
  readStatus?: NotificationReadStatusFilter;

  @ApiPropertyOptional({ example: 'EVENT_REMINDER', description: 'Filter by notification type' })
  @IsOptional()
  @IsString()
  type?: string;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00.000Z', description: 'Filter notifications from this date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.999Z', description: 'Filter notifications before this date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
