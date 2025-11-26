import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class GetWalletByIdDto {
  @IsString({ message: 'Wallet ID must be a string' })
  @IsNotEmpty({ message: 'Wallet ID is required' })
  walletId: string;
}

export class GetWalletByAccountNumberDto {
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;
}

export class GetWalletHistoryDto {
  @IsString({ message: 'Wallet ID must be a string' })
  @IsNotEmpty({ message: 'Wallet ID is required' })
  walletId: string;

  @IsOptional()
  @IsString({ message: 'Start date must be a string' })
  startDate?: string;

  @IsOptional()
  @IsString({ message: 'End date must be a string' })
  endDate?: string;

  @IsOptional()
  @IsString({ message: 'Page must be a string' })
  page?: string;

  @IsOptional()
  @IsString({ message: 'Limit must be a string' })
  limit?: string;
}

