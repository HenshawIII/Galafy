import { IsOptional, IsString, IsEnum, IsInt, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class GetKycRequestsDto {
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

  @ApiProperty({ required: false, enum: KycTier, description: 'Filter by KYC tier' })
  @IsOptional()
  @IsEnum(KycTier)
  tier?: KycTier;
}

export class ApproveKycDto {
  @ApiProperty({ required: false, example: 'All documents verified successfully', description: 'Approval notes' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectKycDto {
  @ApiProperty({ example: 'Documents are unclear or incomplete', description: 'Rejection reason' })
  @IsString()
  reason: string;
}
