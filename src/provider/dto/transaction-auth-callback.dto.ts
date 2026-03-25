import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Authentication callback request payload (bank -> client)
 *
 * Docs (curl sample):
 * {
 *   "transactionReference": "...",
 *   "securityInfo": "..."
 * }
 */
export class TransactionAuthCallbackRequestDto {
  @ApiProperty({ example: 'TXN-123', description: 'Custom transaction reference provided by client' })
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @ApiProperty({ example: 'encrypted-security-info', description: 'Encrypted signature to authorize payout' })
  @IsString()
  @IsNotEmpty()
  securityInfo: string;
}

/**
 * Authentication callback response payload (client -> bank)
 */
export class TransactionAuthCallbackResponseDto {
  @ApiProperty({ example: 'TXN-123', description: 'Custom transaction reference provided by client' })
  @IsString()
  @IsNotEmpty()
  transactionReference: string;

  @ApiProperty({ example: true, description: 'Whether we authorize this transaction' })
  @IsBoolean()
  authorized: boolean;
}

