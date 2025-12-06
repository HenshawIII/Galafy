import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
  HttpException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerDto, UpdateCustomerNameDto, UpdateCustomerContactsDto } from './dto/update-customer.dto.js';
import { GetCustomerByIdDto, GetCustomerKycStatusDto, GetAllCustomersQueryDto } from './dto/customer-query.dto.js';
import {
  CreateNinVerificationDto,
  CreateBvnVerificationDto,
  CreateAddressVerificationDto,
} from './dto/kyc-verification.dto.js';
import {
  CreateCustomerWithBvnDto,
  UpgradeWithNinAndAddressDto,
} from './dto/kyc-utility.dto.js';
import { KycTier } from '../users/dto/create-user-dto.js';

@Injectable()
export class CustomerKycService {
  private readonly logger = new Logger(CustomerKycService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
  ) {}

  /**
   * Create a new customer (Tier 0) - both in our DB and with provider
   */
  async createCustomer(userId: string, createCustomerDto: CreateCustomerDto) {
    // Verify user exists
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if customer already exists for this user
    const existingCustomer = await this.databaseService.customer.findUnique({
      where: { userId },
    });

    if (existingCustomer) {
      throw new ConflictException('Customer already exists for this user');
    }

    // Create customer with provider first
    const providerRequest = {
      firstName: createCustomerDto.firstName,
      lastName: createCustomerDto.lastName,
      middleName: createCustomerDto.middleName,
      emailAddress: createCustomerDto.emailAddress || user.email,
      mobileNumber: createCustomerDto.mobileNumber || user.phone || undefined,
      dob: createCustomerDto.dob,
      city: createCustomerDto.city,
      address: createCustomerDto.address,
      customerTypeId: createCustomerDto.customerTypeId || "f671da57-e281-4b40-965f-a96f4205405e",
      countryId: createCustomerDto.countryId || "c15ad9ae-c4d7-4342-b70f-de5508627e3b",
    };

    let providerCustomerId: string | null = null;
    try {
      const providerResponse = await this.providerService.createCustomer(providerRequest);
      providerCustomerId = providerResponse.customerId;
    } catch (error) {
      this.logger.error(`Failed to create customer with provider: ${error.message}`);
      // Pass through the actual error message from provider
      if (error instanceof HttpException) {
        throw new BadRequestException(error.message || 'Failed to create customer with provider service');
      }
      throw new BadRequestException(error.message || 'Failed to create customer with provider service');
    }

    // Create customer in our database
    const customer = await this.databaseService.customer.create({
      data: {
        userId,
        providerCustomerId,
        organizationId: createCustomerDto.organizationId,
        customerTypeId: createCustomerDto.customerTypeId || "f671da57-e281-4b40-965f-a96f4205405e",
        countryId: createCustomerDto.countryId || "c15ad9ae-c4d7-4342-b70f-de5508627e3b",
        firstName: createCustomerDto.firstName,
        lastName: createCustomerDto.lastName,
        middleName: createCustomerDto.middleName,
        dob: createCustomerDto.dob ? new Date(createCustomerDto.dob) : null,
        city: createCustomerDto.city,
        address: createCustomerDto.address,
        mobileNumber: createCustomerDto.mobileNumber || user.phone,
        emailAddress: createCustomerDto.emailAddress || user.email,
        tier: createCustomerDto.tier || KycTier.Tier_0,
        providerTierCode: 0,
      },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
      },
    });

    return customer;
  }

  /**
   * Get customer by ID
   */
  async getCustomerById(customerId: string) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
        wallets: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    return customer;
  }

  /**
   * Get customer by user ID
   */
  async getCustomerByUserId(userId: string) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
        wallets: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this user');
    }

    return customer;
  }

  /**
   * Helper method to get customer by userId and return customerId
   * Throws NotFoundException if customer doesn't exist
   */
  private async getCustomerIdByUserId(userId: string): Promise<string> {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      select: { id: true },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this user. Please create a customer profile first.');
    }

    return customer.id;
  }

  /**
   * Get all customers with optional filters
   */
  async getAllCustomers(query: GetAllCustomersQueryDto) {
    const where: any = {};
    if (query.tier) {
      where.tier = query.tier;
    }
    if (query.organizationId) {
      where.organizationId = query.organizationId;
    }

    const customers = await this.databaseService.customer.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
          },
        },
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return customers;
  }

  /**
   * Update customer name
   */
  async updateCustomerName(customerId: string, updateDto: UpdateCustomerNameDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Update with provider
    try {
      await this.providerService.updateCustomerName(customer.providerCustomerId, {
        customerId: customer.providerCustomerId,
        firstName: updateDto.firstName || customer.firstName,
        lastName: updateDto.lastName || customer.lastName,
        middleName: updateDto.middleName,
      });
    } catch (error) {
      this.logger.error(`Failed to update customer name with provider: ${error.message}`);
      // Pass through the actual error message from provider
      if (error instanceof HttpException) {
        throw new BadRequestException(error.message || 'Failed to update customer name with provider service');
      }
      throw new BadRequestException(error.message || 'Failed to update customer name with provider service');
    }

    // Update in our database
    const updatedCustomer = await this.databaseService.customer.update({
      where: { id: customerId },
      data: {
        firstName: updateDto.firstName,
        lastName: updateDto.lastName,
        middleName: updateDto.middleName,
      },
    });

    return updatedCustomer;
  }

  /**
   * Update customer contacts
   */
  async updateCustomerContacts(customerId: string, updateDto: UpdateCustomerContactsDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Update with provider
    try {
      await this.providerService.updateCustomerContacts(customer.providerCustomerId, {
        customerId: customer.providerCustomerId,
        mobileNumber: updateDto.mobileNumber,
        emailAddress: updateDto.emailAddress,
      });
    } catch (error) {
      this.logger.error(`Failed to update customer contacts with provider: ${error.message}`);
      // Pass through the actual error message from provider
      if (error instanceof HttpException) {
        throw new BadRequestException(error.message || 'Failed to update customer contacts with provider service');
      }
      throw new BadRequestException(error.message || 'Failed to update customer contacts with provider service');
    }

    // Update in our database
    const updatedCustomer = await this.databaseService.customer.update({
      where: { id: customerId },
      data: {
        mobileNumber: updateDto.mobileNumber,
        emailAddress: updateDto.emailAddress,
      },
    });

    return updatedCustomer;
  }

  /**
   * Get customer KYC status by userId
   */
  async getCustomerKycStatusByUserId(userId: string) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.getCustomerKycStatus(customerId);
  }

  /**
   * Get customer KYC status
   */
  async getCustomerKycStatus(customerId: string) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: {
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Get status from provider
    let providerStatus;
    try {
      providerStatus = await this.providerService.getCustomerKycStatus(customer.providerCustomerId);
    } catch (error) {
      this.logger.error(`Failed to get customer KYC status from provider: ${error.message}`);
      // Return local status if provider call fails
      return {
        customerId: customer.id,
        tier: customer.tier,
        providerTierCode: customer.providerTierCode,
        hasNin: !!customer.ninVerification,
        hasBvn: !!customer.bvnVerification,
        hasAddressVerification: !!customer.addressVerification,
      };
    }

    return {
      customerId: customer.id,
      tier: customer.tier,
      providerTierCode: providerStatus.customerTierCode || customer.providerTierCode  ,
      hasNin: providerStatus.hasNin || !!customer.ninVerification,
      hasBvn: providerStatus.hasBvn || !!customer.bvnVerification,
      hasAddressVerification: providerStatus.hasAddressVerification || !!customer.addressVerification,
      bvnValue: providerStatus.bvnValue,
      ninValue: providerStatus.ninValue,
    };
  }

  /**
   * Upgrade customer KYC with NIN
   * - If customer already has BVN verification → Tier_2
   * - Otherwise → Tier_1
   */
  /**
   * Upgrade customer with NIN by userId
   */
  async upgradeWithNinByUserId(userId: string, ninDto: CreateNinVerificationDto) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.upgradeWithNin(customerId, ninDto);
  }

  async upgradeWithNin(customerId: string, ninDto: CreateNinVerificationDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Call provider API
    const providerResponse = await this.providerService.upgradeCustomerWithNin({
      customerId: customer.providerCustomerId,
      nin: ninDto.nin,
      firstname: customer.firstName,
      lastname: customer.lastName,
      dob: customer.dob ? customer.dob.toISOString().split('T')[0] : '',
      verify: 1, // Default to 1 as per API requirements
    });

    if (!providerResponse.data) {
      throw new BadRequestException('NIN verification failed');
    }

    const ninData = providerResponse.data.nin;
    const summary = providerResponse.data.summary?.nin_check;

    // Store verification in database
    const ninVerification = await this.databaseService.ninVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        providerCheckId: providerResponse.data.id,
        state: providerResponse.data.status?.state,
        status: providerResponse.data.status?.status,
        ninCheckStatus: summary?.status,
        firstnameMatch: summary?.fieldMatches?.firstname,
        lastnameMatch: summary?.fieldMatches?.lastname,
        
        ninBirthdate: ninData?.birthdate ? new Date(ninData.birthdate) : null,
        ninGender: ninData?.gender,
        ninPhone: ninData?.phone,
        lgaOfResidence: ninData?.lga_of_residence,
        stateOfResidence: ninData?.state_of_residence,
        vNin: ninData?.vNin,
      },
      update: {
        providerCheckId: providerResponse.data.id,
        state: providerResponse.data.status?.state,
        status: providerResponse.data.status?.status,
        ninCheckStatus: summary?.status,
        firstnameMatch: summary?.fieldMatches?.firstname,
        lastnameMatch: summary?.fieldMatches?.lastname,
        
        ninBirthdate: ninData?.birthdate ? new Date(ninData.birthdate) : null,
        ninGender: ninData?.gender,
        ninPhone: ninData?.phone,
        lgaOfResidence: ninData?.lga_of_residence,
        stateOfResidence: ninData?.state_of_residence,
        vNin: ninData?.vNin,
      },
    });

    // Update customer tier if verification successful
    if (providerResponse.data.status?.status === 'verified') {
      // Check if customer already has BVN verification
      const existingBvnVerification = await this.databaseService.bvnVerification.findUnique({
        where: { customerId },
      });

      // If both NIN and BVN are verified, upgrade to Tier_2, otherwise Tier_1
      const newTier = existingBvnVerification ? KycTier.Tier_2 : KycTier.Tier_1;
      const newProviderTierCode = existingBvnVerification ? 2 : 1;

      await this.databaseService.customer.update({
        where: { id: customerId },
        data: {
          tier: newTier,
          providerTierCode: newProviderTierCode,
        },
      });
    }

    return ninVerification;
  }

  /**
   * Upgrade customer KYC with BVN
   * - If customer already has NIN verification → Tier_2
   * - Otherwise → Tier_1
   */
  /**
   * Upgrade customer with BVN by userId
   */
  async upgradeWithBvnByUserId(userId: string, bvnDto: CreateBvnVerificationDto) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.upgradeWithBvn(customerId, bvnDto);
  }

  async upgradeWithBvn(customerId: string, bvnDto: CreateBvnVerificationDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    // Call provider API
    const providerResponse = await this.providerService.upgradeCustomerWithBvn({
      customerId: customer.providerCustomerId,
      bvn: bvnDto.bvn,
    });

    if (!providerResponse.data?.response) {
      throw new BadRequestException('BVN verification failed');
    }

    const responseData = providerResponse.data.response;
    const bvnData = responseData.bvn;
    const summary = responseData.summary?.bvn_check;

    // Store verification in database
    const bvnVerification = await this.databaseService.bvnVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        kycCompleted: providerResponse.data.kycCompleted,
        providerCheckId: responseData.id,
        state: responseData.status?.state,
        status: responseData.status?.status,
        bvnCheckStatus: summary?.status,
        firstnameMatch: summary?.fieldMatches?.firstname,
        lastnameMatch: summary?.fieldMatches?.lastname,
       
        birthdate: bvnData?.birthdate ? new Date(bvnData.birthdate) : null,
        gender: bvnData?.gender,
        phone: bvnData?.phone,
        email: bvnData?.email,
        firstname: bvnData?.firstname,
        lastname: bvnData?.lastname,
        middlename: bvnData?.middlename,
        lgaOfResidence: bvnData?.lga_of_residence,
        maritalStatus: bvnData?.marital_status,
        nationality: bvnData?.nationality,
        residentialAddress: bvnData?.residential_address,
        stateOfResidence: bvnData?.state_of_residence,
        enrollmentBank: bvnData?.enrollment_bank,
        watchListed: bvnData?.watch_listed,
      },
      update: {
        kycCompleted: providerResponse.data.kycCompleted,
        providerCheckId: responseData.id,
        state: responseData.status?.state,
        status: responseData.status?.status,
        bvnCheckStatus: summary?.status,
        firstnameMatch: summary?.fieldMatches?.firstname,
        lastnameMatch: summary?.fieldMatches?.lastname,
        
        birthdate: bvnData?.birthdate ? new Date(bvnData.birthdate) : null,
        gender: bvnData?.gender,
        phone: bvnData?.phone,
        email: bvnData?.email,
        firstname: bvnData?.firstname,
        lastname: bvnData?.lastname,
        middlename: bvnData?.middlename,
        lgaOfResidence: bvnData?.lga_of_residence,
        maritalStatus: bvnData?.marital_status,
        nationality: bvnData?.nationality,
        residentialAddress: bvnData?.residential_address,
        stateOfResidence: bvnData?.state_of_residence,
        enrollmentBank: bvnData?.enrollment_bank,
        watchListed: bvnData?.watch_listed,
      },
    });

    // Update customer tier if verification successful
    if (responseData.status?.status === 'verified') {
      // Check if customer already has NIN verification
      const existingNinVerification = await this.databaseService.ninVerification.findUnique({
        where: { customerId },
      });

      // If both NIN and BVN are verified, upgrade to Tier_2, otherwise Tier_1
      const newTier = existingNinVerification ? KycTier.Tier_2 : KycTier.Tier_1;
      const newProviderTierCode = existingNinVerification ? 2 : 1;

      await this.databaseService.customer.update({
        where: { id: customerId },
        data: {
          tier: newTier,
          providerTierCode: newProviderTierCode,
        },
      });
    }

    return bvnVerification;
  }

  /**
   * Verify customer address (Tier 3)
   */
  /**
   * Verify customer address by userId
   */
  async verifyAddressByUserId(userId: string, addressDto: CreateAddressVerificationDto) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.verifyAddress(customerId, addressDto);
  }

  async verifyAddress(customerId: string, addressDto: CreateAddressVerificationDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    if (customer.tier !== KycTier.Tier_2) {
      throw new BadRequestException('Customer must be at least Tier 2 to verify address');
    }

    // Call provider API
    const providerResponse = await this.providerService.verifyCustomerAddress({
      customerId: customer.providerCustomerId,
      houseAddress: addressDto.houseAddress,
      meterNumber: addressDto.meterNumber,
    });

    if (!providerResponse.data?.data) {
      throw new BadRequestException('Address verification failed');
    }

    const verificationData = providerResponse.data.data;

    // Store verification in database
    const addressVerification = await this.databaseService.addressVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        verified: verificationData.verified || false,
        houseAddress: verificationData.houseAddress,
        houseOwner: verificationData.houseOwner,
        confidenceLevel: verificationData.confidenceLevel,
        discoCode: verificationData.discoCode,
        providerStatus: providerResponse.data.status,
        providerMessage: providerResponse.data.message,
        providerTimestamp: providerResponse.data.timestamp
          ? new Date(providerResponse.data.timestamp)
          : null,
      },
      update: {
        verified: verificationData.verified || false,
        houseAddress: verificationData.houseAddress,
        houseOwner: verificationData.houseOwner,
        confidenceLevel: verificationData.confidenceLevel,
        discoCode: verificationData.discoCode,
        providerStatus: providerResponse.data.status,
        providerMessage: providerResponse.data.message,
        providerTimestamp: providerResponse.data.timestamp
          ? new Date(providerResponse.data.timestamp)
          : null,
      },
    });

    // Update customer tier if verification successful
    if (verificationData.verified) {
      await this.databaseService.customer.update({
        where: { id: customerId },
        data: {
          tier: KycTier.Tier_3,
          providerTierCode: 3,
        },
      });
    }

    return addressVerification;
  }

  /**
   * Utility method: Create customer and upgrade with BVN in one request
   * Includes duplicate checks to avoid creating duplicate customers or BVN verifications
   */
  async createCustomerWithBvn(userId: string, dto: CreateCustomerWithBvnDto) {
    // Check if customer already exists for this user
    let customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        bvnVerification: true,
      },
    });

    // If customer doesn't exist, create it
    if (!customer) {
      const createCustomerDto: CreateCustomerDto = {
        userId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        middleName: dto.middleName,
        dob: dto.dob,
        city: dto.city,
        address: dto.address,
        mobileNumber: dto.mobileNumber,
        emailAddress: dto.emailAddress,
      };

      await this.createCustomer(userId, createCustomerDto);
      
      // Fetch the newly created customer with BVN verification relation
      customer = await this.databaseService.customer.findUnique({
        where: { userId },
        include: {
          bvnVerification: true,
        },
      });

      if (!customer) {
        throw new BadRequestException('Failed to create customer');
      }
    }

    // Check if BVN verification already exists
    if (customer.bvnVerification) {
      throw new ConflictException('BVN verification already exists for this customer');
    }

    // Upgrade with BVN
    const bvnDto: CreateBvnVerificationDto = {
      bvn: dto.bvn,
    };

    const bvnVerification = await this.upgradeWithBvn(customer.id, bvnDto);

    return {
      customer,
      bvnVerification,
      message: 'Customer created and BVN verification completed successfully',
    };
  }

  /**
   * Utility method: Upgrade customer with NIN and Address verification, plus bank account name enquiry
   * Includes duplicate checks - skips already verified steps and continues with remaining steps
   */
  /**
   * Upgrade customer with NIN and Address by userId
   */
  async upgradeWithNinAndAddressByUserId(userId: string, dto: UpgradeWithNinAndAddressDto) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.upgradeWithNinAndAddress(customerId, dto);
  }

  async upgradeWithNinAndAddress(customerId: string, dto: UpgradeWithNinAndAddressDto) {
    // Verify customer exists
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: {
        ninVerification: true,
        addressVerification: true,
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    if (!customer.providerCustomerId) {
      throw new BadRequestException('Customer does not have a provider customer ID');
    }

    const results: any = {
      ninVerification: null,
      addressVerification: null,
      bankNameEnquiry: null,
      message: '',
    };

    // Step 1: NIN Verification (skip if already verified)
    if (customer.ninVerification) {
      this.logger.log(`NIN verification already exists for customer ${customerId}, skipping NIN verification`);
      results.ninVerification = customer.ninVerification;
      results.message += 'NIN already verified. ';
    } else {
      // Check customer tier - must be at least Tier 1 (should have BVN already)
      if (customer.tier === KycTier.Tier_0) {
        throw new BadRequestException('Customer must complete BVN verification first before proceeding with NIN verification.');
      }

      try {
        const ninDto: CreateNinVerificationDto = {
          nin: dto.nin,
        };
        results.ninVerification = await this.upgradeWithNin(customerId, ninDto);
        results.message += 'NIN verification completed. ';
      } catch (error: any) {
        throw new BadRequestException(`NIN verification failed: ${error.message}`);
      }
    }

    // Refresh customer to get updated tier after NIN verification
    const updatedCustomer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
    });

    if (!updatedCustomer) {
      throw new NotFoundException('Customer not found after NIN verification');
    }

    // Step 2: Address Verification (skip if already verified)
    if (customer.addressVerification) {
      this.logger.log(`Address verification already exists for customer ${customerId}, skipping address verification`);
      results.addressVerification = customer.addressVerification;
      results.message += 'Address already verified. ';
    } else {
      // Check customer tier - must be Tier 2 for address verification
      if (updatedCustomer.tier !== KycTier.Tier_2) {
        throw new BadRequestException(`Customer must be Tier 2 before address verification. Current tier: ${updatedCustomer.tier}`);
      }

      try {
        const addressDto: CreateAddressVerificationDto = {
          houseAddress: dto.houseAddress,
          meterNumber: dto.meterNumber,
        };
        results.addressVerification = await this.verifyAddress(customerId, addressDto);
        results.message += 'Address verification completed. ';
      } catch (error: any) {
        throw new BadRequestException(`Address verification failed: ${error.message}`);
      }
    }

    // Step 3: Bank Account Name Enquiry (always perform)
    try {
      results.bankNameEnquiry = await this.providerService.bankAccountNameEnquiry(
        dto.bankCode,
        dto.accountNumber,
      );
      results.message += 'Bank account name enquiry completed.';
    } catch (error: any) {
      throw new BadRequestException(`Bank account name enquiry failed: ${error.message}`);
    }

    return results;
  }
}
