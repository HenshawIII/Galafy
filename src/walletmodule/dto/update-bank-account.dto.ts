import { IsString, IsNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateBankAccountDto {
  @ApiProperty({ example: '1234567890', description: 'Bank account number' })
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;

  @ApiProperty({ example: '058', description: 'Bank code' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiProperty({
    example: 'John Doe',
    description:
      'Bank account name from provider name enquiry. Must match the customer Tier 1 verified name.',
  })
  @IsString({ message: 'Account name must be a string' })
  @IsNotEmpty({ message: 'Account name is required' })
  accountName: string;
}
