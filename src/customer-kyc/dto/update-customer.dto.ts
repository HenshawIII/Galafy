import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsOptional, IsDateString, IsEmail, IsEnum } from 'class-validator';
import { CreateCustomerDto } from './create-customer.dto.js';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class UpdateCustomerNameDto {
  @IsString({ message: 'First name must be a string' })
  @IsOptional()
  firstName?: string;

  @IsString({ message: 'Last name must be a string' })
  @IsOptional()
  lastName?: string;

  @IsString({ message: 'Middle name must be a string' })
  @IsOptional()
  middleName?: string;
}

export class UpdateCustomerContactsDto {
  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobileNumber?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  emailAddress?: string;
}

export class UpdateCustomerDto extends PartialType(CreateCustomerDto) {
  @IsOptional()
  @IsEnum(KycTier, {
    message: 'KYC Tier must be one of: Tier_0, Tier_1, Tier_2, Tier_3',
  })
  tier?: KycTier;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date string' })
  dob?: string;
}

