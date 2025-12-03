import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WalletToWalletTransferDto {
  @ApiProperty({ example: '9710013297', description: 'Source wallet account number' })
  @IsString({ message: 'From wallet account number must be a string' })
  @IsNotEmpty({ message: 'From wallet account number is required' })
  fromWalletId: string;

  @ApiProperty({ example: '9710013298', description: 'Destination wallet account number' })
  @IsString({ message: 'To wallet account number must be a string' })
  @IsNotEmpty({ message: 'To wallet account number is required' })
  toWalletId: string;

  @ApiProperty({ example: 1000.50, description: 'Transfer amount', minimum: 0.01 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID' })
  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @ApiPropertyOptional({ example: 'Payment for event ticket', description: 'Transfer description' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional({ example: 'TXN-20250125-001', description: 'Transaction reference' })
  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  reference?: string;
}

export class FastWalletTransferDto {
  @ApiProperty({ example: 'wallet-uuid-here', description: 'Source wallet ID' })
  @IsString({ message: 'From wallet ID must be a string' })
  @IsNotEmpty({ message: 'From wallet ID is required' })
  fromWalletId: string;

  @ApiProperty({ example: '1234567890', description: 'Destination bank account number' })
  @IsString({ message: 'To account number must be a string' })
  @IsNotEmpty({ message: 'To account number is required' })
  toAccountNumber: string;

  @ApiProperty({ example: '058', description: 'Destination bank code' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiProperty({ example: 1000.50, description: 'Transfer amount', minimum: 0.01 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiPropertyOptional({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID' })
  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @ApiPropertyOptional({ example: 'Payment for services', description: 'Transfer description' })
  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @ApiPropertyOptional({ example: 'TXN-20250125-001', description: 'Transaction reference' })
  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  reference?: string;

  @ApiPropertyOptional({ example: 'John Doe', description: 'Recipient name (will be fetched via name enquiry if not provided)' })
  @IsOptional()
  @IsString({ message: 'Recipient name must be a string' })
  recipientName?: string;
}

