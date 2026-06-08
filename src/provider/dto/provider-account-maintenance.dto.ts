import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type ProviderAccountDetailsResult = {
  walletNumber: string;
  availableBalance: string;
  accountType: string;
};

export type ProviderTransactionHistoryItem = {
  title?: string;
  amount?: number;
  type?: string;
  date?: string;
  transactionDate?: string;
  narration?: string;
  status?: string;
  creditType?: string;
  sender?: string;
  senderAccountNumber?: string;
  destinationBank?: string;
  destinationAccountNumber?: string;
  recieverName?: string;
  referenceId?: string;
  isViewReceiptEnabled?: boolean;
  tranId?: string;
  rrn?: string;
  num?: number;
  balance?: string;
};

export class ProviderTransactionHistoryQueryDto {
  @IsString()
  @IsNotEmpty()
  from: string;

  @IsString()
  @IsNotEmpty()
  to: string;

  @IsOptional()
  @IsString()
  keyWord?: string;
}
