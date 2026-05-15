import { IsString, IsNotEmpty, IsOptional, IsEmail, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** ALAT Tier 1 start: phone, email, BVN. Returns correlationId + face URL. */
export class StartTier1Dto {
  @ApiProperty({ example: '08012345678', description: 'Phone number' })
  @IsString()
  @IsNotEmpty()
  phoneNumber: string;

  @ApiProperty({ example: 'user@example.com', description: 'Email' })
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @ApiProperty({ example: '12345678901', description: 'BVN' })
  @IsString()
  @IsNotEmpty()
  bvn: string;

  @ApiProperty({ example: 'corr-id-123', description: 'Correlation ID (provided by frontend)' })
  @IsString()
  @IsNotEmpty()
  correlationId: string;
}

/** Residential address for ALAT Tier 2 (dropdown-driven: state, lga, city, etc.) */
export class ResidentialAddressDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  buildingNumber?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apartment?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  street?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  city?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  town?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  state?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lga?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  lcda?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  landmark?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  additionalInformation?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  fullAddress?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  postalCode?: string;
}

/** ALAT Tier 2 submit: NIN + address + live face image (base64). BVN is optional (not stored after Tier 1). */
export class StartTier2Dto {
  @ApiPropertyOptional({
    example: '12345678901',
    description: 'Optional. Omit if Tier 1 BVN was already submitted to the provider.',
  })
  @IsOptional()
  @IsString()
  bvn?: string;

  @ApiProperty({ example: '12345678901', description: 'NIN' })
  @IsString()
  @IsNotEmpty()
  nin: string;

  @ApiProperty({ description: 'Residential address (state, lga, city, etc.)' })
  @IsObject()
  residentialAddress: ResidentialAddressDto;

  @ApiProperty({ description: 'Base64-encoded live face image' })
  @IsString()
  @IsNotEmpty()
  liveImageOfFace: string;
}
