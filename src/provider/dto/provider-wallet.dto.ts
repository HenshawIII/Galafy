import { IsString, IsNotEmpty, IsOptional, IsBoolean, IsNumber, Min, IsUUID } from 'class-validator';
import { Type } from 'class-transformer';

// Provider API Request DTOs for Wallet Operations

export class ProviderCreateWalletRequestDto {
  @IsString({ message: 'ID must be a string (UUID)' })
  @IsNotEmpty({ message: 'ID is required' })
  id: string; // Wallet UUID

  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string; // Provider customer ID

  @IsString({ message: 'Currency ID must be a string' })
  @IsNotEmpty({ message: 'Currency ID is required' })
  currencyId: string;

  @IsOptional()
  @IsString({ message: 'Wallet group ID must be a string' })
  walletGroupId?: string;

  @IsOptional()
  @IsString({ message: 'Wallet restriction ID must be a string' })
  walletRestrictionId?: string;

  @IsOptional()
  @IsString({ message: 'Wallet classification ID must be a string' })
  walletClassificationId?: string;

  @IsOptional()
  @IsNumber({}, { message: 'Available balance must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Available balance must be greater than or equal to 0' })
  availableBalance?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Ledger balance must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Ledger balance must be greater than or equal to 0' })
  ledgerBalance?: number;

  @IsOptional()
  @IsNumber({}, { message: 'Overdraft must be a number' })
  @Type(() => Number)
  @Min(0, { message: 'Overdraft must be greater than or equal to 0' })
  overdraft?: number;

  @IsOptional()
  @IsBoolean({ message: 'isInternal must be a boolean' })
  isInternal?: boolean;

  @IsOptional()
  @IsBoolean({ message: 'isDefault must be a boolean' })
  isDefault?: boolean;

  @IsOptional()
  @IsString({ message: 'Name must be a string' })
  name?: string;

  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobNum?: string;
}

export class ProviderWalletToWalletTransferRequestDto {
  @IsString({ message: 'From wallet ID must be a string' })
  @IsNotEmpty({ message: 'From wallet ID is required' })
  fromWalletId: string;

  @IsString({ message: 'To wallet ID must be a string' })
  @IsNotEmpty({ message: 'To wallet ID is required' })
  toWalletId: string;

  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  reference?: string;
}

export class ProviderFastWalletTransferRequestDto {
  @IsString({ message: 'From wallet ID must be a string' })
  @IsNotEmpty({ message: 'From wallet ID is required' })
  fromWalletId: string;

  @IsString({ message: 'To account number must be a string' })
  @IsNotEmpty({ message: 'To account number is required' })
  accountNumber: string;

  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @IsNumber({}, { message: 'Amount must be a number' })
  @Type(() => Number)
  @Min(0.01, { message: 'Amount must be greater than 0' })
  amount: number;

  @IsOptional()
  @IsString({ message: 'Currency ID must be a string' })
  currencyId?: string;

  @IsOptional()
  @IsString({ message: 'Description must be a string' })
  description?: string;

  @IsOptional()
  @IsString({ message: 'Reference must be a string' })
  reference?: string;

  @IsOptional()
  @IsString({ message: 'Recipient name must be a string' })
  recipientName?: string;
}

// Provider API Response DTOs
export class ProviderWalletResponseDto {
  walletId?: string;
  virtualAccount?: {
    accountNumber: string;
    bankCode: string;
    bankName: string;
  };
  mobNum?: string;
  availableBalance?: number;
  ledgerBalance?: number;
  currencyId?: string;
  walletClassificationId?: string;
}

export class ProviderWalletHistoryResponseDto {
  transactions?: Array<{
    id: string;
    type: string;
    amount: number;
    balance: number;
    description?: string;
    reference?: string;
    timestamp: string;
  }>;
  total?: number;
  page?: number;
  limit?: number;
}

