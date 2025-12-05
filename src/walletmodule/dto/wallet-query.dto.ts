import { IsString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

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
}

