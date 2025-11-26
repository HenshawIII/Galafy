import { IsString, IsNotEmpty, IsOptional, IsDateString, IsInt } from 'class-validator';

// Provider API Request DTOs for KYC Operations

export class ProviderNinVerificationRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsString({ message: 'NIN must be a string' })
  @IsNotEmpty({ message: 'NIN is required' })
  nin: string;

  @IsString({ message: 'First name must be a string' })
  @IsNotEmpty({ message: 'First name is required' })
  firstname: string;

  @IsString({ message: 'Last name must be a string' })
  @IsNotEmpty({ message: 'Last name is required' })
  lastname: string;

  @IsString({ message: 'Date of birth must be a string' })
  @IsNotEmpty({ message: 'Date of birth is required' })
  dob: string;

  @IsOptional()
  @IsInt({ message: 'Verify must be an integer' })
  verify?: number; // Defaults to 1
}

export class ProviderBvnVerificationRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsString({ message: 'BVN must be a string' })
  @IsNotEmpty({ message: 'BVN is required' })
  bvn: string;

  @IsOptional()
  @IsDateString({}, { message: 'Date of birth must be a valid date string' })
  dob?: string;

  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  lastName?: string;
}

export class ProviderAddressVerificationRequestDto {
  @IsString({ message: 'Customer ID must be a string' })
  @IsNotEmpty({ message: 'Customer ID is required' })
  customerId: string;

  @IsString({ message: 'House address must be a string' })
  @IsNotEmpty({ message: 'House address is required' })
  houseAddress: string;

  @IsOptional()
  @IsString({ message: 'Meter number must be a string' })
  meterNumber?: string;
}

// Provider API Response DTOs (matching the schema comments)
export class ProviderNinVerificationResponseDto {
  data?: {
    id?: number;
    applicant?: {
      firstname?: string;
      lastname?: string;
      dob?: string;
    };
    summary?: {
      nin_check?: {
        status?: string;
        fieldMatches?: {
          firstname?: boolean;
          lastname?: boolean;
        };
      };
    };
    status?: {
      state?: string;
      status?: string;
    };
    nin?: {
      nin?: string;
      birthdate?: string;
      gender?: string;
      phone?: string;
      [key: string]: any;
    };
  };
}

export class ProviderBvnVerificationResponseDto {
  data?: {
    kycCompleted?: boolean;
    response?: {
      id?: number;
      summary?: {
        bvn_check?: {
          status?: string;
          fieldMatches?: {
            firstname?: boolean;
            lastname?: boolean;
          };
        };
      };
      status?: {
        state?: string;
        status?: string;
      };
      bvn?: {
        bvn?: string;
        firstname?: string;
        lastname?: string;
        [key: string]: any;
      };
    };
  };
}

export class ProviderAddressVerificationResponseDto {
  data?: {
    status?: string;
    message?: string;
    timestamp?: string;
    data?: {
      verified?: boolean;
      houseAddress?: string;
      houseOwner?: string;
      confidenceLevel?: number;
      discoCode?: string;
    };
  };
}

