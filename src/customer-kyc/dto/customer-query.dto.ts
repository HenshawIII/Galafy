import { IsString, IsOptional, IsEnum, IsNotEmpty } from 'class-validator';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class GetCustomerByIdDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;
}

export class GetCustomerKycStatusDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;
}

export class GetAllCustomersQueryDto {
  @IsOptional()
  @IsEnum(KycTier, {
    message: 'KYC Tier must be one of: Tier_0, Tier_1, Tier_2, Tier_3',
  })
  tier?: KycTier;

  @IsOptional()
  @IsString({ message: 'Organization ID must be a string' })
  organizationId?: string;
}

