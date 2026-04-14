import { IsOptional, IsEnum } from 'class-validator';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class GetAllCustomersQueryDto {
  @IsOptional()
  @IsEnum(KycTier, {
    message: 'KYC Tier must be one of: Tier_0, Tier_1, Tier_2, Tier_3',
  })
  tier?: KycTier;
}
