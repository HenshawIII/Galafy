import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { KycTier, KycReminderCampaignStatus } from '../../../generated/prisma/enums.js';

const BULK_REMINDER_TIERS = [KycTier.Tier_0, KycTier.Tier_1, KycTier.Tier_2] as const;

export class KycReminderChannelsDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  email!: boolean;

  @ApiProperty({ example: true })
  @IsBoolean()
  inApp!: boolean;
}

export class SendBulkKycReminderDto {
  @ApiProperty({ enum: BULK_REMINDER_TIERS, example: KycTier.Tier_0 })
  @IsEnum(KycTier)
  @IsIn(BULK_REMINDER_TIERS)
  targetTier!: (typeof BULK_REMINDER_TIERS)[number];

  @ApiProperty({ type: KycReminderChannelsDto })
  @ValidateNested()
  @Type(() => KycReminderChannelsDto)
  channels!: KycReminderChannelsDto;
}

export class GetKycReminderHistoryDto {
  @ApiProperty({ required: false, example: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, example: 10 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  limit?: number = 10;

  @ApiProperty({ required: false, description: 'Search by message title or snippet' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiProperty({ required: false, enum: BULK_REMINDER_TIERS })
  @IsOptional()
  @IsEnum(KycTier)
  @IsIn(BULK_REMINDER_TIERS)
  targetTier?: (typeof BULK_REMINDER_TIERS)[number];

  @ApiProperty({ required: false, enum: ['email', 'inApp', 'both'] })
  @IsOptional()
  @IsIn(['email', 'inApp', 'both'])
  channel?: 'email' | 'inApp' | 'both';

  @ApiProperty({ required: false, enum: KycReminderCampaignStatus })
  @IsOptional()
  @IsEnum(KycReminderCampaignStatus)
  status?: KycReminderCampaignStatus;

  @ApiProperty({ required: false, example: '2026-10-01T00:00:00.000Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiProperty({ required: false, example: '2026-10-31T23:59:59.999Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;
}
