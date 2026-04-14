import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsObject, IsOptional, IsString, ValidateNested } from 'class-validator';

export class TransactionCallbackDataDto {
  @ApiProperty({ example: 'SUCCESSFUL', description: 'Transaction status: PENDING, SUCCESSFUL or FAILED' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiPropertyOptional({ example: 'string', description: 'Provider status message' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ example: 'Custom narration', description: 'Transaction narration' })
  @IsOptional()
  @IsString()
  narration?: string;

  @ApiProperty({ example: 'TXN-CLIENT-REF', description: 'Client transaction reference' })
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @ApiPropertyOptional({ example: 'TXN-PLATFORM-REF', description: 'Provider platform reference' })
  @IsOptional()
  @IsString()
  platformTransactionReference?: string;

  @ApiPropertyOptional({ example: '123456789', description: 'Provider transaction STAN' })
  @IsOptional()
  @IsString()
  transactionStan?: string;

  @ApiPropertyOptional({
    example: '2024-08-20T12:05:13.624Z',
    description: 'Original transaction date as string',
  })
  @IsOptional()
  @IsString()
  orinalTxnTransactionDate?: string;
}

export class TransactionCallbackDto {
  @ApiPropertyOptional({ example: 'string', description: 'Callback title' })
  @IsOptional()
  @IsString()
  title?: string;

  @ApiPropertyOptional({ example: 'string', description: 'Callback message' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiProperty({ description: 'Callback data payload' })
  @IsObject()
  @ValidateNested()
  @Type(() => TransactionCallbackDataDto)
  data: TransactionCallbackDataDto;

  @ApiProperty({ example: 3, description: 'request identifier (provider-defined)' })
  @Type(() => Number)
  @IsInt()
  request: number;

  @ApiProperty({ example: 3, description: 'requestType identifier (provider-defined)' })
  @Type(() => Number)
  @IsInt()
  requestType: number;
}

