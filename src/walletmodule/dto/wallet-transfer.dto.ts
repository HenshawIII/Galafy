import { IsString, IsNotEmpty, IsOptional, IsDecimal, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Body for POST transfer/wallet-to-wallet: Bearer auth only; server builds provider `securityInfo`. */
export class InitiateWalletToWalletTransferDto {
  @ApiProperty({ example: '9710013297', description: 'Source wallet virtual account number' })
  @IsString()
  @IsNotEmpty()
  fromWalletId: string;

  @ApiProperty({ example: '9710013298', description: 'Destination wallet virtual account number' })
  @IsString()
  @IsNotEmpty()
  toWalletId: string;

  @ApiProperty({ example: '1000.50', description: 'Amount (up to 2 decimal places)' })
  @IsString()
  @IsNotEmpty()
  @IsDecimal({ decimal_digits: '0,2' })
  @Transform(({ value }) => {
    if (typeof value === 'number') return value.toFixed(2);
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  })
  amount: string;

  @ApiPropertyOptional({ description: 'Transfer description' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Currency ID' })
  @IsOptional()
  @IsString()
  currencyId?: string;

  @ApiPropertyOptional({ description: 'Optional transaction reference (max 36 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  transactionReference?: string;
}
