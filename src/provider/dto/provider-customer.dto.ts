import { IsString, IsNotEmpty, IsOptional, IsInt, IsDateString, IsEmail, IsBoolean } from 'class-validator';

// Provider API Request DTOs for Customer Operations

export class ProviderCreateCustomerRequestDto {
  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsOptional()
  @IsString({ message: 'Middle name must be a string' })
  middleName?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date string' })
  dob?: string;

  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobileNumber?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  emailAddress?: string;

  @IsOptional()
  @IsString({ message: 'Organization ID must be a string' })
  organizationId?: string;

  @IsOptional()
  @IsString({ message: 'Customer type ID must be a string' })
  customerTypeId?: string;

  @IsOptional()
  @IsString({ message: 'Country ID must be a string' })
  countryId?: string;
}

export class ProviderUpgradeCustomerTierRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsInt({ message: 'Tier must be an integer (0, 1, 2, or 3)' })
  @IsNotEmpty({ message: 'Tier is required' })
  tier: number; // 0, 1, 2, or 3

  @IsOptional()
  @IsString({ message: 'NIN must be a string' })
  nin?: string;

  @IsOptional()
  @IsString({ message: 'BVN must be a string' })
  bvn?: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date string' })
  dob?: string;

  @IsOptional()
  @IsString({ message: 'Address must be a string' })
  address?: string;

  @IsOptional()
  @IsString({ message: 'City must be a string' })
  city?: string;
}

export class ProviderUpdateCustomerNameRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstName: string;

  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastName: string;

  @IsOptional()
  @IsString({ message: 'Middle name must be a string' })
  middleName?: string;
}

export class ProviderUpdateCustomerContactsRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsOptional()
  @IsString({ message: 'Mobile number must be a string' })
  mobileNumber?: string;

  @IsOptional()
  @IsEmail({}, { message: 'Invalid email format' })
  emailAddress?: string;
}

// Provider API Response DTOs
export class ProviderCustomerResponseDto {
  id?: string;
  firstName?: string;
  lastName?: string;
  middleName?: string;
  dob?: string;
  mobileNumber?: string;
  emailAddress?: string;
  organizationId?: string;
  customerTypeId?: string;
  countryId?: string;
  customerTierId?: number;
  isCorporateVerified?: boolean;
  dateCreated?: string;
}

export class ProviderCustomerKycStatusResponseDto {
  customerId?: string;
  tier?: number;
  kycStatus?: string;
  ninVerified?: boolean;
  bvnVerified?: boolean;
  addressVerified?: boolean;
}

