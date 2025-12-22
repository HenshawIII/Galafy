import { IsString, IsOptional, IsInt, Min, Max, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { EventStatus, EventVisibility } from '../../../generated/prisma/enums.js';

export class SearchEventDto {
  @ApiProperty({ 
    example: 'concert', 
    description: 'Search query for event title (case-insensitive partial match)',
    required: false 
  })
  @IsOptional()
  @IsString({ message: 'Query must be a string' })
  query?: string;

  @ApiPropertyOptional({ 
    example: 'Lagos', 
    description: 'Filter by location (case-insensitive partial match)' 
  })
  @IsOptional()
  @IsString({ message: 'Location must be a string' })
  location?: string;

  @ApiPropertyOptional({ 
    enum: EventStatus,
    description: 'Filter by event status' 
  })
  @IsOptional()
  @IsEnum(EventStatus, { message: 'Status must be a valid EventStatus' })
  status?: EventStatus;

  @ApiPropertyOptional({ 
    enum: EventVisibility,
    description: 'Filter by event visibility' 
  })
  @IsOptional()
  @IsEnum(EventVisibility, { message: 'Visibility must be a valid EventVisibility' })
  visibility?: EventVisibility;

  @ApiPropertyOptional({ 
    example: '2024-12-25T00:00:00Z', 
    description: 'Filter events starting from this date/time (ISO 8601 format)' 
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiPropertyOptional({ 
    example: '2024-12-31T23:59:59Z', 
    description: 'Filter events starting before this date/time (ISO 8601 format)' 
  })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO 8601 date string' })
  endDate?: string;

  @ApiPropertyOptional({ 
    example: 1, 
    description: 'Page number (default: 1)',
    minimum: 1,
    default: 1 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page must be an integer' })
  @Min(1, { message: 'Page must be at least 1' })
  page?: number = 1;

  @ApiPropertyOptional({ 
    example: 20, 
    description: 'Number of items per page (default: 20, max: 100)',
    minimum: 1,
    maximum: 100,
    default: 20 
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'Page size must be an integer' })
  @Min(1, { message: 'Page size must be at least 1' })
  @Max(100, { message: 'Page size must not exceed 100' })
  pageSize?: number = 20;
}
