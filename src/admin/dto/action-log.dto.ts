import { IsOptional, IsString, IsInt, Min, IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class GetActionLogsDto {
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

  @ApiProperty({ required: false, example: 'admin-uuid', description: 'Filter by admin ID' })
  @IsOptional()
  @IsString()
  adminId?: string;

  @ApiProperty({
    required: false,
    example: 'KYC_APPROVED',
    description: 'Filter by action type (e.g., KYC_APPROVED, KYC_REJECTED, USER_RESTRICTED, UTILITY_BILL_APPROVED)',
  })
  @IsOptional()
  @IsString()
  actionType?: string;

  @ApiProperty({
    required: false,
    example: 'CUSTOMER',
    description: 'Filter by target entity type (e.g., CUSTOMER, KYC_REQUEST, UTILITY_BILL, USER)',
  })
  @IsOptional()
  @IsString()
  targetType?: string;

  @ApiProperty({ required: false, example: 'customer-uuid', description: 'Filter by target entity ID' })
  @IsOptional()
  @IsString()
  targetId?: string;

  @ApiProperty({
    required: false,
    example: '2025-01-01T00:00:00.000Z',
    description: 'Start date for filtering logs (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'Start date must be a valid ISO 8601 date string' })
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2025-02-08T23:59:59.999Z',
    description: 'End date for filtering logs (ISO 8601 format)',
  })
  @IsOptional()
  @IsDateString({}, { message: 'End date must be a valid ISO 8601 date string' })
  endDate?: string;
}

