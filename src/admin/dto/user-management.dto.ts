import { IsOptional, IsString, IsEnum, IsBoolean, IsInt, Min, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { KycTier } from '../../users/dto/create-user-dto.js';

export enum UserTierFilter {
  Tier_0 = 'Tier_0',
  Tier_1 = 'Tier_1',
  Tier_2 = 'Tier_2',
  Tier_3 = 'Tier_3',
  NoTier = 'NoTier',
}

export enum KycStatusFilter {
  pending = 'pending',
  completed = 'completed',
}

export class GetUsersDto {
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

  @ApiProperty({ required: false, example: 'john@example.com', description: 'Search by email or name' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({
    required: false,
    enum: UserTierFilter,
    description: 'Filter by KYC tier. Use "NoTier" to filter users without customer records (no KYC).',
  })
  @IsOptional()
  @IsEnum(UserTierFilter)
  tier?: UserTierFilter;

  @ApiProperty({
    required: false,
    enum: KycStatusFilter,
    description:
      'Filter by KYC status. pending = Tier 1/2/3 users with incomplete KYC at their current tier (admin action may be needed). Excludes Tier_0 and users without a customer profile.',
  })
  @IsOptional()
  @IsEnum(KycStatusFilter)
  kycStatus?: KycStatusFilter;

  @ApiProperty({ required: false, example: true, description: 'Filter by AML restriction status' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isAmlRestricted?: boolean;

  @ApiProperty({
    required: false,
    example: true,
    description:
      'Filter users by reconciliation mismatch using live provider balance snapshots (inSync=false).',
  })
  @IsOptional()
  @Transform(({ value }) => {
    if (value === true || value === 'true') return true;
    if (value === false || value === 'false') return false;
    return undefined;
  })
  @IsBoolean()
  hasMismatch?: boolean;

  @ApiProperty({
    required: false,
    example: '2026-01-01',
    description: 'Filter users created on or after this date (inclusive). ISO or YYYY-MM-DD.',
  })
  @IsOptional()
  @IsString()
  startDate?: string;

  @ApiProperty({
    required: false,
    example: '2026-01-31',
    description: 'Filter users created on or before this date (inclusive). ISO or YYYY-MM-DD.',
  })
  @IsOptional()
  @IsString()
  endDate?: string;
}

export class RestrictUserDto {
  @ApiProperty({ example: 'Suspicious transaction activity detected', description: 'Reason for restriction' })
  @IsString()
  reason: string;
}

export class SearchUsersDto {
  @ApiProperty({
    example: 'john@example.com',
    description:
      'Search query - can be email, phone, or username. Email and phone use exact match, username uses partial match.',
  })
  @IsString({ message: 'Search query must be a string' })
  @IsNotEmpty({ message: 'Search query is required' })
  q: string;
}

export class SendKycReminderDto {
  @ApiProperty({
    required: false,
    example: 'Custom reminder message (optional)',
    description: 'Optional custom message to include in the KYC reminder email',
  })
  @IsOptional()
  @IsString()
  customMessage?: string;
}

export enum ManualBalanceAdjustmentDirection {
  CREDIT = 'CREDIT',
  DEBIT = 'DEBIT',
}

export class ManualBalanceAdjustmentDto {
  @ApiProperty({ enum: ManualBalanceAdjustmentDirection, example: ManualBalanceAdjustmentDirection.CREDIT })
  @IsEnum(ManualBalanceAdjustmentDirection)
  direction: ManualBalanceAdjustmentDirection;

  @ApiProperty({
    example: '1500.00',
    description: 'Positive adjustment amount in major units with up to 2 decimal places',
  })
  @IsString()
  @IsNotEmpty()
  amount: string;

  @ApiProperty({
    example: 'REC-12345',
    description: 'Unique internal/external reference for traceability',
  })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({
    example: 'Provider mismatch correction after reconciliation review',
    description: 'Reason for manual internal balance adjustment',
  })
  @IsString()
  @IsNotEmpty()
  reason: string;
}
