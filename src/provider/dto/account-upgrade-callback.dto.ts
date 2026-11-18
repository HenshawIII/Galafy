import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

/**
 * Documentation-only DTO for ALAT account-upgrade / address-verification webhooks.
 * The HTTP handler accepts raw bodies (extra fields) like account-creation.
 */
export class AccountUpgradeCallbackDataDto {
  @ApiProperty({ example: 'user@alat.ng' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: '0011223344', description: 'Virtual account number (NUBAN)' })
  @IsString()
  @IsNotEmpty()
  nuban!: string;

  @ApiProperty({ example: 'JANE DOE' })
  @IsString()
  @IsNotEmpty()
  nubanName!: string;

  @ApiProperty({ example: 1 })
  @Type(() => Number)
  @IsInt()
  type!: number;

  @ApiProperty({ example: 'Active' })
  @IsString()
  @IsNotEmpty()
  nubanStatus!: string;

  @ApiProperty({ example: '07011223344' })
  @IsString()
  @IsNotEmpty()
  phoneNumber!: string;
}

export class AccountUpgradeCallbackDto {
  @ApiPropertyOptional({
    example: 'Account Upgraded Successfully',
    description: 'Inbound outcome signal (success vs failure)',
  })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({
    example: 'Address has been verified and account upgraded successfully for the account with details below',
  })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ type: AccountUpgradeCallbackDataDto })
  @IsObject()
  @ValidateNested()
  @Type(() => AccountUpgradeCallbackDataDto)
  data!: AccountUpgradeCallbackDataDto;

  @ApiProperty({ example: 2 })
  @Type(() => Number)
  @IsInt()
  requestType!: number;
}
