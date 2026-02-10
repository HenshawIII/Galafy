import { IsString, IsNotEmpty, IsOptional, IsEnum, IsDateString, IsEmail, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { KycTier } from '../../users/dto/create-user-dto.js';

export class CreateCustomerDto {
  @ApiProperty({ example: 'user-uuid-here', description: 'User ID' })
  @IsString({ message: 'User ID must be a string' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @ApiProperty({ example: 'John', description: 'First name' })
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name' })
  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @ApiPropertyOptional({ example: 'Middle', description: 'Middle name' })
  @IsOptional()
  @IsString({ message: 'Middle name must be a string' })
  middleName?: string;

  @ApiPropertyOptional({ example: '1990-01-15', description: 'Date of birth (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date string' })
  dob?: string;

  @ApiPropertyOptional({ example: 'Lagos', description: 'City' })
  @IsOptional()
  @IsString({ message: 'City must be a string' })
  city?: string;

  @ApiPropertyOptional({ example: '123 Main Street', description: 'Address' })
  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @ApiPropertyOptional({ example: '08012345678', description: 'Mobile number' })
  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobileNumber?: string;

  @ApiPropertyOptional({ example: 'john.doe@example.com', description: 'Email address' })
  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  emailAddress?: string;

  @ApiPropertyOptional({ example: 'org-uuid-here', description: 'Organization ID' })
  @IsOptional()
  @IsString({ message: 'Organization ID must be a string' })
  organizationId?: string;

  @ApiPropertyOptional({ example: 'f671da57-e281-4b40-965f-a96f4205405e', description: 'Customer type ID' })
  @IsOptional()
  @IsString({ message: 'Customer type ID must be a string' })
  customerTypeId?: string;

  @ApiPropertyOptional({ example: 'c15ad9ae-c4d7-4342-b70f-de5508627e3b', description: 'Country ID' })
  @IsOptional()
  @IsString({ message: 'Country ID must be a string' })
  countryId?: string;

  @ApiPropertyOptional({ enum: KycTier, example: KycTier.Tier_0, description: 'KYC Tier', default: KycTier.Tier_0 })
  @IsOptional()
  @IsEnum(KycTier, {
    message: 'KYC Tier must be one of: Tier_0, Tier_1, Tier_2, Tier_3',
  })
  tier?: KycTier;
}

