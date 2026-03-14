import { IsString, IsNotEmpty, Length, Matches, IsDecimal, IsOptional, IsEmail } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SetPayoutPinDto {
  @ApiProperty({
    description: '4-digit PIN for payout verification (first time setup)',
    example: '1234',
    minLength: 4,
    maxLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
  pin: string;
}

export class ResetPayoutPinDto {
  @ApiProperty({
    description: 'User email address',
    example: 'user@example.com',
  })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email address is required' })
  emailAddress: string;
}

export class UpdatePayoutPinDto {
  @ApiProperty({
    description: 'OTP sent to user email for PIN reset',
    example: '123456',
    minLength: 6,
    maxLength: 6,
  })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d+$/, { message: 'OTP must contain only digits' })
  otp: string;

  @ApiProperty({
    description: 'New 4-digit PIN',
    example: '5678',
    minLength: 4,
    maxLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'New PIN must be exactly 4 digits' })
  @Matches(/^\d+$/, { message: 'New PIN must contain only digits' })
  newPin: string;
}

export class InitiatePayoutDto {
  @ApiProperty({ description: 'Source wallet account number', example: '9710013956' })
  @IsString()
  @IsNotEmpty()
  fromWalletId: string;

  @ApiProperty({ description: 'Destination bank code', example: '058' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;

  @ApiProperty({ description: 'Destination account number', example: '1234567890' })
  @IsString()
  @IsNotEmpty()
  toAccountNumber: string;

  @ApiProperty({
    description: 'Transfer amount (max 2 decimal places for kobo precision)',
    example: '1000.50',
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

  @ApiPropertyOptional({ description: 'Transfer description', example: 'Payment for services' })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({
    description: 'Recipient name (optional, will be fetched if not provided)',
    example: 'John Doe',
  })
  @IsString()
  @IsOptional()
  recipientName?: string;

  @ApiPropertyOptional({ description: 'Currency ID', example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9' })
  @IsString()
  @IsOptional()
  currencyId?: string;
}

export class ConfirmPayoutDto {
  @ApiProperty({ description: 'OTP sent to user email', example: '123456' })
  @IsString()
  @IsNotEmpty()
  @Length(6, 6, { message: 'OTP must be exactly 6 digits' })
  @Matches(/^\d+$/, { message: 'OTP must contain only digits' })
  otp: string;

  @ApiProperty({
    description: '4-digit PIN for payout verification',
    example: '1234',
    minLength: 4,
    maxLength: 4,
  })
  @IsString()
  @IsNotEmpty()
  @Length(4, 4, { message: 'PIN must be exactly 4 digits' })
  @Matches(/^\d+$/, { message: 'PIN must contain only digits' })
  pin: string;
}
