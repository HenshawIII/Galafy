import { IsString, IsNotEmpty, IsOptional, IsDecimal, MaxLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Step 1: same security model as payout (OTP email + confirm with PIN + securityInfo). */
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

  @ApiProperty({
    description: 'Client-generated encrypted securityInfo for provider debit authorization (same as payout)',
  })
  @IsString()
  @IsNotEmpty()
  securityInfo: string;

  @ApiPropertyOptional({ description: 'Optional transaction reference (max 36 chars)' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  transactionReference?: string;
}

/** @deprecated Use InitiateWalletToWalletTransferDto + confirm with OTP/PIN (provider-backed transfer). */
export class WalletToWalletTransferDto {
  @ApiProperty({ example: '9710013297', description: 'Source wallet account number' })
  @IsString({ message: 'From wallet account number must be a string' })
  @IsNotEmpty({ message: 'From wallet account number is required' })
  fromWalletId: string;

  @ApiProperty({ example: '9710013298', description: 'Destination wallet account number' })
  @IsString({ message: 'To wallet account number must be a string' })
  @IsNotEmpty({ message: 'To wallet account number is required' })
  toWalletId: string;

  @ApiProperty({
    example: '1000.50',
    description: 'Transfer amount (max 2 decimal places for kobo precision)',
    minimum: 0.01,
  })
  @IsString({ message: 'Amount must be a string' })
  @IsNotEmpty({ message: 'Amount is required' })
  @IsDecimal(
    { decimal_digits: '0,2' },
    {
      message: 'Amount must be a valid decimal with up to 2 decimal places (kobo precision)',
    },
  )
  @Transform(({ value }) => {
    // Normalize to string with 2 decimal places
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  })
  amount: string;

  @ApiPropertyOptional({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID' })
  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @ApiPropertyOptional({ example: 'Payment for event ticket', description: 'Transfer description' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional({ example: 'TXN-20250125-001', description: 'Transaction reference (max 36 characters)' })
  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  // @MaxLength(36, { message: 'Transaction reference must not be more than 36 characters' })
  reference?: string;
}

export class FastWalletTransferDto {
  @ApiProperty({ example: '9710013297', description: 'Source wallet account number' })
  @IsString({ message: 'From wallet account number must be a string' })
  @IsNotEmpty({ message: 'From wallet account number is required' })
  fromWalletId: string;

  @ApiProperty({ example: '1234567890', description: 'Destination bank account number' })
  @IsString({ message: 'To account number must be a string' })
  @IsNotEmpty({ message: 'To account number is required' })
  toAccountNumber: string;

  @ApiProperty({ example: '058', description: 'Destination bank code' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiProperty({
    example: '1000.50',
    description: 'Transfer amount (max 2 decimal places for kobo precision)',
    minimum: 0.01,
  })
  @IsString({ message: 'Amount must be a string' })
  @IsNotEmpty({ message: 'Amount is required' })
  @IsDecimal(
    { decimal_digits: '0,2' },
    {
      message: 'Amount must be a valid decimal with up to 2 decimal places (kobo precision)',
    },
  )
  @Transform(({ value }) => {
    // Normalize to string with 2 decimal places
    if (typeof value === 'number') {
      return value.toFixed(2);
    }
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  })
  amount: string;

  @ApiPropertyOptional({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID' })
  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @ApiPropertyOptional({ example: 'Payment for services', description: 'Transfer description' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional({ example: 'TXN-20250125-001', description: 'Transaction reference (max 36 characters)' })
  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  @MaxLength(36, { message: 'Transaction reference must not be more than 36 characters' })
  reference?: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Recipient name (will be fetched via name enquiry if not provided)',
  })
  @IsOptional()
  @IsString({ message: 'Recipient name must be a string' })
  recipientName?: string;
}
