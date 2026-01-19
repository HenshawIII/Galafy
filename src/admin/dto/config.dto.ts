import { IsString, IsOptional, IsEnum, IsBoolean, IsNotEmpty } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ConfigType } from '../../../generated/prisma/enums.js';

export class GetConfigDto {
  @ApiPropertyOptional({ description: 'Filter by category', example: 'FEES' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Filter by active status', example: true })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}

export class UpdateConfigDto {
  @ApiProperty({ description: 'Configuration value', example: '0.05' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiPropertyOptional({ description: 'Optional description update', example: 'Updated payout fee' })
  @IsString()
  @IsOptional()
  description?: string;
}

export class CreateConfigDto {
  @ApiProperty({ description: 'Configuration key (must be unique)', example: 'ADMIN_PAYOUT_FEE' })
  @IsString()
  @IsNotEmpty()
  key: string;

  @ApiProperty({ description: 'Configuration category', example: 'FEES' })
  @IsString()
  @IsNotEmpty()
  category: string;

  @ApiProperty({ description: 'Configuration value', example: '0.05' })
  @IsString()
  @IsNotEmpty()
  value: string;

  @ApiProperty({ description: 'Configuration type', enum: ConfigType, example: ConfigType.DECIMAL })
  @IsEnum(ConfigType)
  @IsNotEmpty()
  type: ConfigType;

  @ApiPropertyOptional({ description: 'Human-readable description', example: 'Admin fee for payouts (5%)' })
  @IsString()
  @IsOptional()
  description?: string;
}

