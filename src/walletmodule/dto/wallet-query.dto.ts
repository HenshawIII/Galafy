import { IsString, IsNotEmpty, IsOptional, IsUUID, IsEnum, IsNumber, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

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

export enum TransactionStatusFilter {
  ALL = 'all',
  SUCCESSFUL = 'successful',
  PENDING = 'pending',
  FAILED = 'failed',
}

export enum TransactionTypeFilter {
  ALL = 'all',
  INFLOW = 'inflow',
  SPRAY = 'spray',
  PAYOUT = 'payout',
  REFUND = 'refund',
  ADJUSTMENT = 'adjustment',
}

export class GetWalletHistoryDto {
  @ApiProperty({
    description: 'Start date for the query period (YYYY-MM-DD)',
    example: '2025-01-01',
  })
  @IsString({ message: 'Start date must be a string' })
  @IsNotEmpty({ message: 'Start date is required' })
  startDate: string;

  @ApiProperty({
    description: 'End date for the query period (YYYY-MM-DD)',
    example: '2025-01-31',
  })
  @IsString({ message: 'End date must be a string' })
  @IsNotEmpty({ message: 'End date is required' })
  endDate: string;

  @ApiPropertyOptional({
    description: 'Page number to retrieve',
    example: '1',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Page must be a string' })
  page?: string;

  @ApiPropertyOptional({
    description: 'Number of items per page',
    example: '10',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Limit must be a string' })
  limit?: string;

  @ApiPropertyOptional({
    description: 'Search query to filter transactions by description',
    example: 'payment',
    type: String,
  })
  @IsOptional()
  @IsString({ message: 'Search query must be a string' })
  query?: string;

  @ApiPropertyOptional({
    description: 'Filter transactions by status',
    enum: TransactionStatusFilter,
    example: TransactionStatusFilter.ALL,
  })
  @IsOptional()
  @IsEnum(TransactionStatusFilter, { message: 'Status must be one of: all, successful, pending, failed' })
  status?: TransactionStatusFilter;

  @ApiPropertyOptional({
    description: 'Minimum amount for filtering transactions',
    example: 10,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Min amount must be a number' })
  @Min(0, { message: 'Min amount must be greater than or equal to 0' })
  minAmount?: number;

  @ApiPropertyOptional({
    description: 'Maximum amount for filtering transactions',
    example: 500,
    type: Number,
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber({}, { message: 'Max amount must be a number' })
  @Min(0, { message: 'Max amount must be greater than or equal to 0' })
  maxAmount?: number;

  @ApiPropertyOptional({
    description: 'Filter transactions by type',
    enum: TransactionTypeFilter,
    example: TransactionTypeFilter.ALL,
  })
  @IsOptional()
  @IsEnum(TransactionTypeFilter, { message: 'Type must be one of: all, inflow, spray, payout, refund, adjustment' })
  type?: TransactionTypeFilter;
}

