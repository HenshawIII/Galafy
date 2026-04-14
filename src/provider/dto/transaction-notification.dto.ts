import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsNotEmpty, IsNumber, IsObject, IsOptional, IsString } from 'class-validator';

export class TransactionNotificationDto {
  @ApiProperty({ example: '0000000000', description: 'Account number to receive the notification for' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ example: 'Credit', description: 'Transaction type from provider: Credit or Debit' })
  @IsString()
  @IsNotEmpty()
  transactionType: string;

  @ApiProperty({ example: 10000, description: 'Amount' })
  @Type(() => Number)
  @IsNumber()
  amount: number;

  @ApiPropertyOptional({ example: 'Custom narration', description: 'Transaction narration' })
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiPropertyOptional({ example: '2026-03-25T12:12:13.213Z', description: 'Transaction date/time' })
  @IsOptional()
  @IsString()
  transactionDate?: string;

  // Some providers include extra metadata; we don't require it.
  @ApiPropertyOptional({ example: {}, description: 'Extra provider fields (ignored)' })
  @IsOptional()
  @IsObject()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extra?: Record<string, any>;
}

