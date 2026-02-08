import { IsOptional, IsString, IsEnum, IsInt, Min, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetAlertsDto {
  @ApiProperty({ required: false, example: 1, description: 'Page number' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, example: 20, description: 'Items per page' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 20;

  @ApiProperty({
    required: false,
    enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    description: 'Filter by severity level',
  })
  @IsOptional()
  @IsEnum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'])
  severity?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  @ApiProperty({
    required: false,
    enum: ['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'],
    description: 'Filter by alert status',
  })
  @IsOptional()
  @IsEnum(['PENDING', 'REVIEWED', 'RESOLVED', 'DISMISSED'])
  status?: 'PENDING' | 'REVIEWED' | 'RESOLVED' | 'DISMISSED';

  @ApiProperty({
    required: false,
    example: 'TRANSACTION_BLOCKED',
    description: 'Filter by event type (e.g., TRANSACTION_BLOCKED, ANOMALY_DETECTED)',
  })
  @IsOptional()
  @IsString()
  eventType?: string;

  @ApiProperty({ required: false, example: 'wallet-uuid', description: 'Filter by wallet ID' })
  @IsOptional()
  @IsString()
  walletId?: string;

  @ApiProperty({ required: false, example: 'customer-uuid', description: 'Filter by customer ID' })
  @IsOptional()
  @IsString()
  customerId?: string;

  @ApiProperty({
    required: false,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Start date for filtering alerts (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2025-02-08T23:59:59.999Z',
    description: 'End date for filtering alerts (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO 8601 date string' })
  endDate?: string;
}

export class UpdateAlertStatusDto {
  @ApiProperty({
    enum: ['REVIEWED', 'RESOLVED', 'DISMISSED'],
    description: 'New status for the alert',
    example: 'REVIEWED',
  })
  @IsEnum(['REVIEWED', 'RESOLVED', 'DISMISSED'])
  status: 'REVIEWED' | 'RESOLVED' | 'DISMISSED';

  @ApiProperty({
    required: false,
    example: 'Alert reviewed and determined to be false positive',
    description: 'Optional notes when resolving or dismissing the alert',
  })
  @IsOptional()
  @IsString()
  resolutionNotes?: string;
}

