import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, IsBoolean, IsArray } from 'class-validator';
import { Type, Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { EventStatus } from '../../../generated/prisma/enums.js';

export class GetEventsDto {
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
    enum: EventStatus,
    description:
      'Filter by event status. UI values map as: "Upcoming" → SCHEDULED, "Live" → LIVE, "Completed" → ENDED, "All" → omit parameter',
  })
  @IsOptional()
  @IsEnum(EventStatus)
  status?: EventStatus;

  @ApiPropertyOptional({
    example: ['Birthday', 'Wedding'],
    description:
      'Filter by event categories (multi-select). Common values: Birthday, Wedding, Housewarming, Corporate. Accepts: categories=value1&categories=value2 or categories[]=value1&categories[]=value2',
    type: [String],
  })
  @IsOptional()
  @Transform(({ value }) => {
    // Handle both array format and single value
    if (Array.isArray(value)) {
      return value;
    }
    if (typeof value === 'string') {
      // If single string, convert to array
      return [value];
    }
    return value;
  })
  @IsArray()
  @IsString({ each: true })
  categories?: string[];

  @ApiPropertyOptional({ example: 'concert', description: 'Search by event title or host name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: 'user-uuid', description: 'Filter by host user ID' })
  @IsOptional()
  @IsString()
  hostUserId?: string;

  @ApiPropertyOptional({
    example: '2025-01-01T00:00:00.000Z',
    description:
      'Filter events starting from this date. Quick options (Today, This Week, This Month, Last 90 days) are calculated on frontend and sent as startDate/endDate',
  })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.999Z', description: 'Filter events starting before this date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class GetSprayActivityDto {
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

  @ApiPropertyOptional({ example: 'john', description: 'Search by sprayer name or email' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ example: '1000', description: 'Minimum spray amount' })
  @IsOptional()
  @IsString()
  minAmount?: string;

  @ApiPropertyOptional({ example: '100000', description: 'Maximum spray amount' })
  @IsOptional()
  @IsString()
  maxAmount?: string;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00.000Z', description: 'Filter sprays from this date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.999Z', description: 'Filter sprays before this date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}

export class GetTopSprayersDto {
  @ApiPropertyOptional({ example: 10, description: 'Number of top sprayers to return', default: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number;

  @ApiPropertyOptional({ example: true, description: 'Include anonymous sprayers', default: false })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  includeAnonymous?: boolean;
}
