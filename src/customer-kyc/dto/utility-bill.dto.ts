import { IsString, IsNotEmpty, IsUrl } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SubmitUtilityBillDto {
  @ApiProperty({
    example: 'https://example.com/utility-bill.jpg',
    description: 'URL of the utility bill image',
  })
  @IsString({ message: 'Utility bill URL must be a string' })
  @IsNotEmpty({ message: 'Utility bill URL is required' })
  @IsUrl({}, { message: 'Utility bill URL must be a valid URL' })
  utilityBillUrl: string;
}

