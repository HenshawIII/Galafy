import { IsString, IsNotEmpty, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// INFLOW Webhook DTO
export class InflowWebhookDataDto {
  @ApiProperty({ example: '9710128903', description: 'Account number that received the payment' })
  @IsString()
  @IsNotEmpty()
  accountNumber: string;

  @ApiProperty({ example: '000001250630150523063421028600', description: 'Provider transaction reference' })
  @IsString()
  @IsNotEmpty()
  reference: string;

  @ApiProperty({ example: 100.0, description: 'Transaction amount' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 0.0, description: 'Transaction fee' })
  @IsNumber()
  @IsNotEmpty()
  fee: number;

  @ApiProperty({ example: 'OGHENETEGA KELVIN ESEDERE', description: 'Sender name' })
  @IsString()
  @IsNotEmpty()
  senderName: string;

  @ApiPropertyOptional({ example: 'Sterling Bank', description: 'Sender bank name' })
  @IsOptional()
  @IsString()
  senderBank?: string;

  @ApiProperty({ example: '2025-06-30T14:07:14.4553594Z', description: 'Transaction date' })
  @IsDateString()
  @IsNotEmpty()
  dateOfTransaction: string;

  @ApiPropertyOptional({ example: 'TRF 9710128903 PAYREF: OneBank Transfer...', description: 'Transaction description' })
  @IsOptional()
  @IsString()
  description?: string;
}

export class InflowWebhookDto {
  @ApiProperty({ example: 'nip', description: 'Event type' })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiProperty({ type: InflowWebhookDataDto, description: 'Webhook data' })
  @IsNotEmpty()
  data: InflowWebhookDataDto;
}

// PAYOUT Webhook DTO
export class PayoutWebhookDataDto {
  @ApiPropertyOptional({ example: null, description: 'Session ID' })
  @IsOptional()
  sessionId?: string | null;

  @ApiProperty({ example: '0097411531', description: 'Debit account number' })
  @IsString()
  @IsNotEmpty()
  debitAccountNumber: string;

  @ApiProperty({ example: '0003433020', description: 'Credit account number' })
  @IsString()
  @IsNotEmpty()
  creditAccountNumber: string;

  @ApiProperty({ example: 'Olufunso Olunaike', description: 'Debit account name' })
  @IsString()
  @IsNotEmpty()
  debitAccountName: string;

  @ApiProperty({ example: 'OLUNAIKE OLUFUNSO ABRAHAM', description: 'Credit account name' })
  @IsString()
  @IsNotEmpty()
  creditAccountName: string;

  @ApiProperty({ example: 500.0, description: 'Transaction amount' })
  @IsNumber()
  @IsNotEmpty()
  amount: number;

  @ApiProperty({ example: 'NGN', description: 'Currency' })
  @IsString()
  @IsNotEmpty()
  currency: string;

  @ApiProperty({ example: 'Success', description: 'Transaction status' })
  @IsString()
  @IsNotEmpty()
  status: string;

  @ApiProperty({ example: '668931654633533785081478974241', description: 'Provider payment reference' })
  @IsString()
  @IsNotEmpty()
  paymentReference: string;

  @ApiPropertyOptional({ example: null, description: 'Delivery status message' })
  @IsOptional()
  deliveryStatusMessage?: string | null;

  @ApiPropertyOptional({ example: null, description: 'Delivery status code' })
  @IsOptional()
  deliveryStatusCode?: string | null;

  @ApiProperty({ example: '0001-01-01T00:00:00', description: 'Date of transaction' })
  @IsDateString()
  @IsNotEmpty()
  dateOfTransaction: string;
}

export class PayoutWebhookDto {
  @ApiProperty({ example: 'payout', description: 'Event type' })
  @IsString()
  @IsNotEmpty()
  event: string;

  @ApiProperty({ type: PayoutWebhookDataDto, description: 'Webhook data' })
  @IsNotEmpty()
  data: PayoutWebhookDataDto;
}

