import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class AccountCreationCallbackDataDto {
  @ApiProperty({ example: 'user@alat.ng', description: 'User email used for account creation' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: '07011223344', description: 'User phone number used for account creation' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: '0011223344', description: 'Generated virtual account number (nuban)' })
  @IsString()
  @IsNotEmpty()
  nuban: string;

  @ApiProperty({ example: 'JANE DOE', description: 'Name associated with the generated virtual account number' })
  @IsString()
  @IsNotEmpty()
  nubanName: string;

  @ApiProperty({ example: 1, description: 'Wallet type indicator (provider-defined)' })
  @Type(() => Number)
  @IsInt()
  type: number;

  @ApiProperty({ example: 'Active', description: 'Virtual account status returned by provider' })
  @IsString()
  @IsNotEmpty()
  nubanStatus: string;
}

/**
 * Provider "Account Creation Callback" payload.
 * Docs indicate we should map by `phoneNumber + email`.
 */
export class AccountCreationCallbackDto {
  @ApiPropertyOptional({ example: 'string', description: 'Callback title (provider-defined)' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'string', description: 'Callback message (provider-defined)' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ description: 'Callback data payload' })
  @IsObject()
  @ValidateNested()
  @Type(() => AccountCreationCallbackDataDto)
  data: AccountCreationCallbackDataDto;

  @ApiProperty({ example: 2, description: 'Request type indicator (provider-defined)' })
  @Type(() => Number)
  @IsInt()
  requestType: number;
}

