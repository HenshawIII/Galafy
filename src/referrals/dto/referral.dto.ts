import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Length, Matches } from 'class-validator';
import { Transform } from 'class-transformer';
import { REFERRAL_CODE_LENGTH } from '../referral.constants.js';

export class ApplyReferralDto {
  @ApiProperty({
    example: 'A1B2C3D4',
    description: '8-character alphanumeric referral code',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Referral code is required' })
  @Length(REFERRAL_CODE_LENGTH, REFERRAL_CODE_LENGTH, {
    message: `Referral code must be ${REFERRAL_CODE_LENGTH} characters`,
  })
  @Matches(/^[A-Z0-9]+$/, { message: 'Referral code must be alphanumeric' })
  referralCode: string;
}

export class ValidateReferralQueryDto {
  @ApiProperty({
    example: 'A1B2C3D4',
    description: '8-character alphanumeric referral code',
  })
  @Transform(({ value }) => (typeof value === 'string' ? value.trim().toUpperCase() : value))
  @IsString()
  @IsNotEmpty({ message: 'Referral code is required' })
  code: string;
}

export class ReferralUserSummaryDto {
  @ApiProperty()
  id: string;

  @ApiPropertyOptional({ nullable: true })
  username: string | null;

  @ApiPropertyOptional({ nullable: true })
  firstName: string | null;

  @ApiPropertyOptional({ nullable: true })
  lastName: string | null;
}

export class ReferredUserDto extends ReferralUserSummaryDto {
  @ApiProperty({ description: 'When the referral was attributed' })
  createdAt: string;
}

export class ReferredByDto extends ReferralUserSummaryDto {
  @ApiProperty()
  attributedAt: string;
}
