import { IsString, IsNotEmpty, IsOptional, IsDateString, IsEmail } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating customer and upgrading with BVN in one request
 */
export class CreateCustomerWithBvnDto {
  // Customer fields
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

  // BVN verification field
  @ApiProperty({ example: '12345678901', description: 'Bank Verification Number (BVN)' })
  @IsString({ message: 'BVN must be a string' })
  @IsNotEmpty({ message: 'BVN is required' })
  bvn: string;
}

/**
 * DTO for upgrading customer with NIN and Address verification
 */
export class UpgradeWithNinAndAddressDto {
  // NIN verification field
  @ApiProperty({ example: '12345678901', description: 'National Identification Number (NIN)' })
  @IsString({ message: 'NIN must be a string' })
  @IsNotEmpty({ message: 'NIN is required' })
  nin: string;

  // Address verification fields
  @ApiProperty({ example: '123 Main Street, Lagos', description: 'House address for verification' })
  @IsString({ message: 'House address must be a string' })
  @IsNotEmpty({ message: 'House address is required' })
  houseAddress: string;

  @ApiProperty({ example: '12345678901', description: 'Meter number' })
  @IsString({ message: 'Meter number must be a string' })
  @IsNotEmpty({ message: 'Meter number is required' })
  meterNumber: string;

  // Bank account name enquiry fields
  @ApiProperty({ example: '058', description: 'Bank code for account name enquiry' })
  @IsString({ message: 'Bank code must be a string' })
  @IsNotEmpty({ message: 'Bank code is required' })
  bankCode: string;

  @ApiProperty({ example: '1234567890', description: 'Bank account number for name enquiry' })
  @IsString({ message: 'Account number must be a string' })
  @IsNotEmpty({ message: 'Account number is required' })
  accountNumber: string;
}

