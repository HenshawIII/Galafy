import { IsString, IsNotEmpty, IsOptional, IsDateString, IsBoolean, IsInt, IsNumber } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// NIN Verification DTOs
export class CreateNinVerificationDto {
  @ApiProperty({ example: '12345678901', description: 'National Identification Number (NIN)' })
  @IsString({ message: 'NIN must be a string' })
  @IsNotEmpty({ message: 'NIN is required' })
  nin: string;
}

export class NinVerificationResponseDto {
  @IsOptional()
  @IsInt()
  providerCheckId?: number;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  ninCheckStatus?: string;

  @IsOptional()
  @IsBoolean()
  firstnameMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  lastnameMatch?: boolean;

  @IsString()
  @IsNotEmpty()
  nin: string;

  @IsOptional()
  @IsDateString()
  ninBirthdate?: string;

  @IsOptional()
  @IsString()
  ninGender?: string;

  @IsOptional()
  @IsString()
  ninPhone?: string;

  @IsOptional()
  @IsString()
  lgaOfResidence?: string;

  @IsOptional()
  @IsString()
  stateOfResidence?: string;

  @IsOptional()
  @IsString()
  vNin?: string;
}

// BVN Verification DTOs
export class CreateBvnVerificationDto {
  @ApiProperty({ example: '12345678901', description: 'Bank Verification Number (BVN)' })
  @IsString({ message: 'BVN must be a string' })
  @IsNotEmpty({ message: 'BVN is required' })
  bvn: string;
}

export class BvnVerificationResponseDto {
  @IsOptional()
  @IsBoolean()
  kycCompleted?: boolean;

  @IsOptional()
  @IsInt()
  providerCheckId?: number;

  @IsOptional()
  @IsString()
  state?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsString()
  bvnCheckStatus?: string;

  @IsOptional()
  @IsBoolean()
  firstnameMatch?: boolean;

  @IsOptional()
  @IsBoolean()
  lastnameMatch?: boolean;

  @IsString()
  @IsNotEmpty()
  bvn: string;

  @IsOptional()
  @IsDateString()
  birthdate?: string;

  @IsOptional()
  @IsString()
  gender?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsString()
  email?: string;

  @IsOptional()
  @IsString()
  firstname?: string;

  @IsOptional()
  @IsString()
  lastname?: string;

  @IsOptional()
  @IsString()
  middlename?: string;

  @IsOptional()
  @IsString()
  lgaOfResidence?: string;

  @IsOptional()
  @IsString()
  maritalStatus?: string;

  @IsOptional()
  @IsString()
  nationality?: string;

  @IsOptional()
  @IsString()
  residentialAddress?: string;

  @IsOptional()
  @IsString()
  stateOfResidence?: string;

  @IsOptional()
  @IsString()
  enrollmentBank?: string;

  @IsOptional()
  @IsString()
  watchListed?: string;
}

// Address Verification DTOs
export class CreateAddressVerificationDto {
  @ApiProperty({ example: '123 Main Street, Lagos', description: 'House address for verification' })
  @IsString({ message: 'House address must be a string' })
  @IsNotEmpty({ message: 'House address is required' })
  houseAddress: string;

  @ApiProperty({ example: '12345678901', description: 'Meter number' })
  @IsString({ message: 'Meter number must be a string' })
  @IsNotEmpty({ message: 'Meter number is required' })
  meterNumber: string;
}

export class AddressVerificationResponseDto {
  @IsBoolean()
  @IsNotEmpty()
  verified: boolean;

  @IsOptional()
  @IsString()
  houseAddress?: string;

  @IsOptional()
  @IsString()
  houseOwner?: string;

  @IsOptional()
  @IsInt()
  confidenceLevel?: number;

  @IsOptional()
  @IsString()
  discoCode?: string;

  @IsOptional()
  @IsString()
  providerStatus?: string;

  @IsOptional()
  @IsString()
  providerMessage?: string;

  @IsOptional()
  @IsDateString()
  providerTimestamp?: string;
}

