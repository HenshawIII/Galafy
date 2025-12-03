import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, IsDecimal, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateWalletDto {
  @ApiProperty({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID (defaults to NGN if not provided)' })
  @IsString({ message: 'Currency ID must be a string' })
  @IsOptional()
  currencyId?: string;

  @ApiPropertyOptional({ example: 'wallet-group-uuid', description: 'Wallet group ID' })
  @IsOptional()
  @IsString({ message: 'Wallet group ID must be a string' })
  walletGroupId?: string;

  @ApiPropertyOptional({ example: 'restriction-uuid', description: 'Wallet restriction ID' })
  @IsOptional()
  @IsString({ message: 'Wallet restriction ID must be a string' })
  walletRestrictionId?: string;

  @ApiPropertyOptional({ example: 'classification-uuid', description: 'Wallet classification ID' })
  @IsOptional()
  @IsString({ message: 'Wallet classification ID must be a string' })
  walletClassificationId?: string;

  @ApiPropertyOptional({ example: 0, description: 'Initial available balance', default: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Available balance must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Available balance must be greater than or equal to 0' })
  availableBalance?: number;

  @ApiPropertyOptional({ example: 0, description: 'Initial ledger balance', default: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Ledger balance must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Ledger balance must be greater than or equal to 0' })
  ledgerBalance?: number;

  @ApiPropertyOptional({ example: 0, description: 'Overdraft limit', default: 0 })
  @IsOptional()
  @IsNumber({}, { message: 'Overdraft must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Overdraft must be greater than or equal to 0' })
  overdraft?: number;

  @ApiPropertyOptional({ example: false, description: 'Is internal wallet', default: false })
  @IsOptional()
  @IsBoolean({ message: 'isInternal must be a boolean' })
  isInternal?: boolean;

  @ApiPropertyOptional({ example: true, description: 'Is default wallet', default: true })
  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Wallet name' })
  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @ApiPropertyOptional({ example: '08012345678', description: 'Mobile number' })
  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobNum?: string;
}

