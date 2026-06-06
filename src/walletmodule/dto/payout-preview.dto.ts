import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsDecimal, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

export class PayoutFeePreviewQueryDto {
  @ApiProperty({ description: 'Gross payout amount (NGN)', example: '1000.00' })
  @IsString()
  @IsNotEmpty()
  @IsDecimal({ decimal_digits: '0,2' })
  @Transform(({ value }) => {
    if (typeof value === 'number') return value.toFixed(2);
    const num = parseFloat(value);
    if (isNaN(num)) return value;
    return num.toFixed(2);
  })
  amount: string;

  @ApiProperty({ description: 'Destination bank code', example: '058' })
  @IsString()
  @IsNotEmpty()
  bankCode: string;
}

export class NipChargeBandDto {
  @ApiProperty()
  chargeFeeName: string;

  @ApiProperty()
  charge: string;

  @ApiProperty()
  lower: string;

  @ApiProperty()
  upper: string;
}
