import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateBankAccountDto {
  @ApiProperty({ example: '1234567890', description: 'Bank account number' })
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;

  @ApiProperty({ example: '058', description: 'Bank code' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiPropertyOptional({
    example: 'John Doe',
    description: 'Bank account name (will be fetched via name enquiry if not provided)',
  })
  @IsOptional()
  @IsString({ message: 'Account name must be a string' })
  accountName?: string;

  @ApiPropertyOptional({ example: true, description: 'Set as default bank account' })
  @IsOptional()
  isDefault?: boolean;
}
