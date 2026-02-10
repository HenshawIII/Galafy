import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, IsBoolean, IsInt } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// Get Wallet By ID
export class GetWalletByIdDto {
  @IsString({ message: 'Wallet ID must be a string' })
  @IsNotEmpty({ message: 'Wallet ID is required' })
  walletId: string;
}

// Get Organization Wallet Transactions
export class GetOrganizationTransactionsDto {
  @IsOptional()
  @IsNumber({}, { message: 'Page must be a number' })
  @Type(() => Number)
  @Min(1, { message: 'Page must be greater than 0' })
  page?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Page size must be a number' })
  @Type(() => Number)
  @Min(1, { message: 'Page size must be greater than 0' })
  pageSize?: number;
}

// Wallet to Wallet Requery
export class WalletToWalletRequeryDto {
  @IsString({ message: 'Transaction reference must be a string' })
  @IsNotEmpty({ message: 'Transaction reference is required' })
  transactionReference: string;
}

// Reverse Transaction
export class ReverseTransactionDto {
  @IsString({ message: 'Transaction reference must be a string' })
  @IsNotEmpty({ message: 'Transaction reference is required' })
  transactionReference: string;
}

// Close Wallet
export class CloseWalletDto {
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;

  @IsInt({ message: 'Account closure reason ID must be an integer' })
  @IsNotEmpty({ message: 'Account closure reason ID is required' })
  accountClosureReasonId: number;

  @IsInt({ message: 'Teller ID must be an integer' })
  @IsNotEmpty({ message: 'Teller ID is required' })
  tellerId: number;

  @IsBoolean({ message: 'Close or delete must be a boolean' })
  @IsNotEmpty({ message: 'Close or delete is required' })
  closeOrDelete: boolean;

  @IsBoolean({ message: 'Customer or account must be a boolean' })
  @IsNotEmpty({ message: 'Customer or account is required' })
  customerOrAccount: boolean;
}

// Restrict by Account ID
export class RestrictByAccountIdDto {
  @IsString({ message: 'Account ID must be a string' })
  @IsNotEmpty({ message: 'Account ID is required' })
  accountId: string;

  @IsString({ message: 'Restriction type must be a string' })
  @IsNotEmpty({ message: 'Restriction type is required' })
  restrictionType: string;
}

// ==================== PAYOUT DTOs ====================

// Bank Account Name Enquiry
export class BankAccountNameEnquiryDto {
  @ApiProperty({ example: '058', description: 'Bank code' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Account number' })
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;
}

// Inter Bank Transfer
export class InterBankTransferDto {
  @ApiProperty({ example: '058', description: 'Destination bank code' })
  @IsString({ message: 'Destination bank code must be a string' })
  @IsNotEmpty({ message: 'Destination bank code is required' })
  destinationBankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Destination account number' })
  @IsString({ message: 'Destination account number must be a string' })
  @IsNotEmpty({ message: 'Destination account number is required' })
  destinationAccountNumber: string;

  @ApiProperty({ example: 'John Doe', description: 'Destination account name' })
  @IsString({ message: 'Destination account name must be a string' })
  @IsNotEmpty({ message: 'Destination account name is required' })
  destinationAccountName: string;

  @ApiProperty({ example: '9710067201', description: 'Source account number (wallet virtual account)' })
  @IsString({ message: 'Source account number must be a string' })
  @IsNotEmpty({ message: 'Source account number is required' })
  sourceAccountNumber: string;

  @ApiProperty({ example: 'Jane Smith', description: 'Source account name' })
  @IsString({ message: 'Source account name must be a string' })
  @IsNotEmpty({ message: 'Source account name is required' })
  sourceAccountName: string;

  @ApiProperty({ example: 'Payment for services', description: 'Transaction remarks/description' })
  @IsString({ message: 'Remarks must be a string' })
  @IsNotEmpty({ message: 'Remarks is required' })
  remarks: string;

  @ApiProperty({ example: 1000.50, description: 'Transfer amount', minimum: 0.01 })
  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @ApiProperty({ example: 'fd5e474d-bb42-4db1-ab74-e8d2a01047e9', description: 'Currency ID (NGN UUID)' })
  @IsString({ message: 'Currency ID must be a string' })
  @IsNotEmpty({ message: 'Currency ID is required' })
  currencyId: string;

  @ApiPropertyOptional({ example: 'TXN-20250125-001', description: 'Unique transaction reference (auto-generated if not provided)' })
  @IsOptional()
  @IsString({ message: 'Customer transaction reference must be a string' })
  customerTransactionReference?: string;

  @ApiPropertyOptional({ example: 'https://your-app.com/webhooks/payout', description: 'Webhook URL for status updates' })
  @IsOptional()
  @IsString({ message: 'Webhook URL must be a string' })
  webhookUrl?: string;
}

// Transaction Status Re-Query
export class TransactionStatusRequeryDto {
  @IsString({ message: 'Transaction reference must be a string' })
  @IsNotEmpty({ message: 'Transaction reference is required' })
  transactionRef: string;
}

