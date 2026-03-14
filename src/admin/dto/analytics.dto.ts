import { IsOptional, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class TransactionAnalyticsDto {
  @ApiProperty({
    required: false,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Start date for analytics (ISO 8601 format). If not provided, returns all-time data.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2025-02-08T23:59:59.999Z',
    description: 'End date for analytics (ISO 8601 format). If not provided, uses current date.',
  })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO 8601 date string' })
  endDate?: string;
}
