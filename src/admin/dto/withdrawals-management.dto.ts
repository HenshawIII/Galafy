import { IsOptional, IsString, IsEnum, IsDateString, IsInt, Min, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { PayoutStatus } from '../../../generated/prisma/enums.js';

export class GetWithdrawalsDto {
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

  @ApiPropertyOptional({ enum: PayoutStatus, description: 'Filter by payout status' })
  @IsOptional()
  @IsEnum(PayoutStatus)
  status?: PayoutStatus;

  @ApiPropertyOptional({ example: 'user-uuid', description: 'Filter by user ID' })
  @IsOptional()
  @IsString()
  userId?: string;

  @ApiPropertyOptional({ example: '2025-01-01T00:00:00.000Z', description: 'Filter withdrawals from this date' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ example: '2025-12-31T23:59:59.999Z', description: 'Filter withdrawals before this date' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({ example: true, description: 'Filter by withdrawals that require admin approval' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  requiresApproval?: boolean;
}

export class RejectWithdrawalDto {
  @ApiProperty({ example: 'Insufficient funds or suspicious activity', description: 'Reason for rejection' })
  @IsString()
  @IsOptional()
  reason?: string;
}

