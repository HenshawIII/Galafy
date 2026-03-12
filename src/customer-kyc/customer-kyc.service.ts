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
  NinAndUtilityBillDto,
} from './dto/kyc-utility.dto.js';
import { SubmitUtilityBillDto } from './dto/utility-bill.dto.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Tier1FaceStatus, UtilityBillStatus } from '../../generated/prisma/enums.js';

@Injectable()
export class CustomerKycService {
  private readonly logger = new Logger(CustomerKycService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
  ) {}

  /**
   * Safely parse a date string from provider responses
   * Returns null if the date is invalid or cannot be parsed
   * This prevents server crashes when provider returns invalid date strings
   */
  private safeParseDate(dateString: string | null | undefined): Date | null {
    if (!dateString || typeof dateString !== 'string' || dateString.trim() === '') {
      return null;
    }

    // Check for common invalid date strings from providers
    const lowerDateString = dateString.toLowerCase().trim();
    if (lowerDateString === 'invalid date' || lowerDateString === 'null' || lowerDateString === 'undefined') {
      this.logger.warn(`Invalid date string received from provider: "${dateString}"`);
      return null;
    }

    try {
      const date = new Date(dateString);
      
      // Check if the date is valid
      if (isNaN(date.getTime()) || date.toString() === 'Invalid Date') {
        this.logger.warn(`Failed to parse date string from provider: "${dateString}"`);
        return null;
      }

      return date;
    } catch (error) {
      this.logger.warn(`Error parsing date string from provider: "${dateString}"`, error);
      return null;
    }
  }

  /**
   * Handle face biometric callback (cb_uri) from ALAT face webapp.
   * Look up customer by body.id (BVN) via tier1PendingBvn. On success call Tier 1 API with correlationId = body.c_id, then update and clear tier1PendingBvn.
   * Returns { received: true } always to avoid leaking existence.
   */
  async handleFaceCallback(body: { success: boolean; c_id: string; id: string; id_type: 'bvn' | 'nin' }) {
    if (body.id_type !== 'bvn') {
      this.logger.debug(`Face callback: id_type=${body.id_type} not handled`);
      return { received: true };
    }

    const customer = await this.databaseService.customer.findUnique({
      where: { tier1PendingBvn: body.id },
    });

    if (!customer) {
      this.logger.debug(`Face callback: no customer for id (bvn)=${body.id}`);
      return { received: true };
    }

    if (!body.success) {
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: { tier1FaceStatus: Tier1FaceStatus.FAILED, tier1PendingBvn: null },
      });
      this.logger.log(`Face callback: face failed for customer ${customer.id}`);
      return { received: true };
    }

    try {
      const res = await this.providerService.tier1BvnWithoutOtpV2({
        phoneNumber: customer.mobileNumber ?? '',
        email: customer.emailAddress ?? '',
        bvn: body.id,
        correlationId: body.c_id,
      });
      const trackingId = res.data?.trackingId ?? null;
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: {
          tier1CorrelationId: body.c_id,
          tier1TrackingId: trackingId,
          tier1FaceStatus: Tier1FaceStatus.COMPLETED,
          tier1CompletedAt: new Date(),
          tier: KycTier.Tier_1,
          providerTierCode: 1,
          providerCustomerId: trackingId ?? customer.providerCustomerId,
          tier1PendingBvn: null,
        },
      });
      await this.databaseService.bvnVerification.upsert({
        where: { customerId: customer.id },
        create: { customerId: customer.id },
        update: {},
      });
      this.logger.log(`Face callback: Tier 1 completed for customer ${customer.id}, c_id=${body.c_id}`);
    } catch (err) {
      this.logger.warn(`Face callback: Tier 1 API failed for customer ${customer.id}: ${err}`);
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: { tier1FaceStatus: Tier1FaceStatus.FAILED, tier1PendingBvn: null },
      });
    }

    return { received: true };
  }

  /**
   * Register for Tier 1 (BVN + face): save phone, email, bvn and set pending. Do NOT call Tier 1 API.
   * App opens face verification URL with static cb_uri; provider POSTs to our callback with c_id, then we call Tier 1 API.
   */
  async startTier1(
    userId: string,
    dto: { phoneNumber: string; email: string; bvn: string },
  ): Promise<{ success: true }> {
    const user = await this.databaseService.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let customer = await this.databaseService.customer.findUnique({ where: { userId } });
    if (!customer) {
      await this.createCustomer(userId, {
        userId,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        emailAddress: user.email,
        mobileNumber: dto.phoneNumber,
      });
      customer = await this.databaseService.customer.findUnique({ where: { userId } });
      if (!customer) throw new BadRequestException('Failed to create customer');
    }

    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier1PendingBvn: dto.bvn,
        mobileNumber: dto.phoneNumber,
        emailAddress: dto.email,
        tier1FaceStatus: Tier1FaceStatus.PENDING,
      },
    });

    return { success: true };
  }

  /**
   * Submit Tier 2 (NIN + address + live face). Uses existing bvn, phone, email from customer.
   */
  async startTier2(
    userId: string,
    dto: { nin: string; bvn?: string; residentialAddress: Record<string, string | undefined>; liveImageOfFace: string },
  ) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: { user: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.tier !== KycTier.Tier_1) {
      throw new BadRequestException('Customer must complete Tier 1 before Tier 2');
    }

    const phoneNumber = customer.mobileNumber || customer.user?.phone;
    const emailAddress = customer.emailAddress || customer.user?.email;
    if (!phoneNumber || !emailAddress) {
      throw new BadRequestException('Customer phone and email are required for Tier 2');
    }

    const hasBvn = await this.databaseService.bvnVerification.findUnique({ where: { customerId: customer.id } });
    if (!hasBvn) {
      throw new BadRequestException('BVN verification required before Tier 2');
    }
    if (!dto.bvn) {
      throw new BadRequestException('BVN is required for Tier 2 submission (not stored from Tier 1)');
    }
    const correlationId = customer.tier1CorrelationId;
    if (!correlationId) {
      throw new BadRequestException('Tier 1 correlationId is missing; complete Tier 1 face verification first.');
    }

    const residentialAddress: Record<string, string | undefined> = {
      buildingNumber: dto.residentialAddress.buildingNumber,
      apartment: dto.residentialAddress.apartment,
      street: dto.residentialAddress.street,
      city: dto.residentialAddress.city,
      town: dto.residentialAddress.town,
      state: dto.residentialAddress.state,
      lga: dto.residentialAddress.lga,
      lcda: dto.residentialAddress.lcda,
      landmark: dto.residentialAddress.landmark,
      additionalInformation: dto.residentialAddress.additionalInformation,
      country: dto.residentialAddress.country,
      fullAddress: dto.residentialAddress.fullAddress,
      postalCode: dto.residentialAddress.postalCode,
    };

    const res = await this.providerService.tier2PartnershipWithoutOtpV2({
      bvn: dto.bvn,
      nin: dto.nin,
      phoneNumber,
      emailAddress,
      residentialAddress,
      liveImageOfFace: dto.liveImageOfFace,
      correlationId,
    });

    const trackingId = res.data?.trackingId ?? null;
    const addressStatus = res.data?.addressVerificationStatus ?? null;
    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier: KycTier.Tier_2,
        providerTierCode: 2,
        tier2TrackingId: trackingId,
        tier2AddressVerificationStatus: addressStatus,
      },
    });

    await this.databaseService.addressVerification.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        verified: false,
        residentialAddressJson: residentialAddress as any,
      },
      update: {
        residentialAddressJson: residentialAddress as any,
      },
    });

    return {
      trackingId,
      addressVerificationStatus: addressStatus,
      tier: KycTier.Tier_2,
    };
  }

  /**
   * Get dropdown reference data (countries, states, LGAs, cities, etc.) for Tier 2 address.
   */
  async getDropdownReference() {
    return this.providerService.getDropDownList();
  }

  /** Get countries from KYC dropdown (cached). */
  async getReferenceCountries() {
    return this.providerService.getKycCountries();
  }

  /** Get states from KYC dropdown, mostly Nigeria (cached). */
  async getReferenceStates() {
    return this.providerService.getKycStates();
  }

  /** Get LGAs by state (stateId from stateList). */
  async getReferenceLgaByState(stateId: number) {
    return this.providerService.getKycLgaByState(stateId);
  }

  /** Get cities by state (stateId from stateList). */
  async getReferenceCityByState(stateId: number) {
    return this.providerService.getKycCityByState(stateId);
  }

  /**
   * Get partnership account details (optional phoneNumber; defaults to current user's phone).
   */
  async getAccountDetails(userId: string, phoneNumber?: string): Promise<{
    accountNumber?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  } | null> {
    const phone = phoneNumber ?? (await this.databaseService.user.findUnique({ where: { id: userId } }))?.phone
      ?? (await this.databaseService.customer.findFirst({ where: { userId } }))?.mobileNumber;
    return this.providerService.getPartnershipAccountDetails(phone ?? undefined);
  }

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

    // Create customer in our DB only (Tier 0). No provider call; providerCustomerId set when Tier 1 completes.
    const customer = await this.databaseService.customer.create({
      data: {
        userId,
        providerCustomerId: null,
        organizationId: createCustomerDto.organizationId,
        customerTypeId: createCustomerDto.customerTypeId || "f671da57-e281-4b40-965f-a96f4205405e",
        countryId: createCustomerDto.countryId || "c15ad9ae-c4d7-4342-b70f-de5508627e3b",
        firstName: createCustomerDto.firstName ?? null,
        lastName: createCustomerDto.lastName ?? null,
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
   * Update customer name by userId
   */
  async updateCustomerNameByUserId(userId: string, updateDto: UpdateCustomerNameDto) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.updateCustomerName(customerId, updateDto);
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
      const providerUpdateData: any = {
        customerId: customer.providerCustomerId,
        firstName: updateDto.firstName || customer.firstName,
        lastName: updateDto.lastName || customer.lastName,
      };
      
      if (updateDto.middleName !== undefined) {
        providerUpdateData.middleName = updateDto.middleName;
      }
      
      if (updateDto.dob !== undefined) {
        providerUpdateData.dob = updateDto.dob;
      }
      
      await this.providerService.updateCustomerName(customer.providerCustomerId, providerUpdateData);
    } catch (error) {
      this.logger.error(`Failed to update customer name with provider: ${error.message}`);
      // Pass through the actual error message from provider
      if (error instanceof HttpException) {
        throw new BadRequestException(error.message || 'Failed to update customer name with provider service');
      }
      throw new BadRequestException(error.message || 'Failed to update customer name with provider service');
    }

    // Update in our database
    const updateData: any = {};
    if (updateDto.firstName !== undefined) {
      updateData.firstName = updateDto.firstName;
    }
    if (updateDto.lastName !== undefined) {
      updateData.lastName = updateDto.lastName;
    }
    if (updateDto.middleName !== undefined) {
      updateData.middleName = updateDto.middleName;
    }
    if (updateDto.dob !== undefined) {
      updateData.dob = updateDto.dob ? new Date(updateDto.dob) : null;
    }

    const updatedCustomer = await this.databaseService.customer.update({
      where: { id: customerId },
      data: updateData,
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
    return this.getCustomerKycStatus(customerId, userId);
  }

  /**
   * Get customer KYC status (local + optional ALAT account details)
   */
  async getCustomerKycStatus(customerId: string, userId?: string) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: {
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
        user: { select: { phone: true } },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    const base = {
      customerId: customer.id,
      tier: customer.tier,
      providerTierCode: customer.providerTierCode,
      tier1FaceStatus: customer.tier1FaceStatus,
      tier2TrackingId: customer.tier2TrackingId,
      tier2AddressVerificationStatus: customer.tier2AddressVerificationStatus,
      hasNin: !!customer.ninVerification,
      hasBvn: !!customer.bvnVerification,
      hasAddressVerification: !!customer.addressVerification,
    };

    if (!customer.providerCustomerId) {
      return base;
    }

    try {
      const phone = customer.mobileNumber || customer.user?.phone;
      const accountDetails = await this.providerService.getPartnershipAccountDetails(phone ?? undefined);
      return {
        ...base,
        accountNumber: accountDetails?.accountNumber,
        partnershipAccount: accountDetails
          ? {
              accountNumber: accountDetails.accountNumber,
              firstName: accountDetails.firstName,
              lastName: accountDetails.lastName,
              email: accountDetails.email,
              phoneNumber: accountDetails.phoneNumber,
            }
          : undefined,
      };
    } catch (error) {
      this.logger.debug(`Could not fetch partnership account details: ${error.message}`);
      return base;
    }
  }

  /**
   * Upgrade customer with NIN by userId (old provider).
   * @deprecated Use startTier2 for ALAT Tier 2 (NIN + address + face)
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
      firstname: customer.firstName ?? '',
      lastname: customer.lastName ?? '',
      dob: customer.dob ? customer.dob.toISOString().split('T')[0] : '',
      verify: 1, // Default to 1 as per API requirements
    });

    if (!providerResponse.data) {
      throw new BadRequestException('NIN verification failed');
    }

    const ninData = providerResponse.data.nin;
    const summary = providerResponse.data.summary?.nin_check;

    // Store verification in database (slim schema: provider ref + timestamps only)
    const ninVerification = await this.databaseService.ninVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        providerCheckId: providerResponse.data.id,
      },
      update: {
        providerCheckId: providerResponse.data.id,
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
   * Upgrade customer with BVN by userId (old provider).
   * @deprecated Use startTier1 + face callback for ALAT Tier 1
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

    // Store verification in database (slim schema: provider ref + timestamps only)
    const bvnVerification = await this.databaseService.bvnVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        providerCheckId: responseData.id,
      },
      update: {
        providerCheckId: responseData.id,
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
   * Verify customer address by userId (old provider).
   * @deprecated Use startTier2 for ALAT (address in Tier 2 payload)
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
      discoCode: addressDto.discoCode,
    });

    if (!providerResponse.data?.data) {
      throw new BadRequestException('Address verification failed');
    }

    const verificationData = providerResponse.data.data;

    // Store verification in database (slim schema)
    const addressVerification = await this.databaseService.addressVerification.upsert({
      where: { customerId },
      create: {
        customerId,
        verified: verificationData.verified || false,
        providerStatus: providerResponse.data.status,
        providerMessage: providerResponse.data.message,
      },
      update: {
        verified: verificationData.verified || false,
        providerStatus: providerResponse.data.status,
        providerMessage: providerResponse.data.message,
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
   * Utility method: Create customer and upgrade with BVN in one request (old provider).
   * @deprecated Use startTier1 + face callback for ALAT Tier 1 flow
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
      bankAccount: null,
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
          discoCode: dto.discoCode,
        };
        results.addressVerification = await this.verifyAddress(customerId, addressDto);
        results.message += 'Address verification completed. ';
      } catch (error: any) {
        throw new BadRequestException(`Address verification failed: ${error.message}`);
      }
    }

    // Step 3: Save Bank Account to database
    try {
      // Check if bank account already exists for this customer with same account number
      const existingBankAccount = await this.databaseService.bankAccount.findFirst({
        where: {
          customerId,
          accountNumber: dto.accountNumber,
          bankCode: dto.bankCode,
        },
      });

      if (existingBankAccount) {
        this.logger.log(`Bank account already exists for customer ${customerId}, updating...`);
        results.bankAccount = await this.databaseService.bankAccount.update({
          where: { id: existingBankAccount.id },
          data: {
            accountName: dto.accountName,
            accountNumber: dto.accountNumber,
            bankCode: dto.bankCode,
          },
        });
        results.message += 'Bank account updated.';
      } else {
        // Check if customer has any bank accounts to determine if this should be default
        const existingAccounts = await this.databaseService.bankAccount.findMany({
          where: { customerId },
        });

        results.bankAccount = await this.databaseService.bankAccount.create({
          data: {
            customerId,
            accountName: dto.accountName,
            accountNumber: dto.accountNumber,
            bankCode: dto.bankCode,
            isDefault: existingAccounts.length === 0, // Set as default if this is the first account
          },
        });
        results.message += 'Bank account saved.';
      }
    } catch (error: any) {
      throw new BadRequestException(`Failed to save bank account: ${error.message}`);
    }

    return results;
  }

  /**
   * Submit utility bill for Tier 2 withdrawal limit increase
   */
  async submitUtilityBill(userId: string, dto: SubmitUtilityBillDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        utilityBillSubmissions: {
          where: {
            status: UtilityBillStatus.PENDING,
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Validate user is Tier 2
    if (customer.tier !== KycTier.Tier_2) {
      throw new BadRequestException('Utility bill submission is only available for Tier 2 users');
    }

    // Check if there's already a pending submission
    if (customer.utilityBillSubmissions.length > 0) {
      throw new ConflictException('You already have a pending utility bill submission. Please wait for review.');
    }

    // Create submission
    const submission = await this.databaseService.utilityBillSubmission.create({
      data: {
        customerId: customer.id,
        utilityBillUrl: dto.utilityBillUrl,
        status: UtilityBillStatus.PENDING,
      },
    });

    this.logger.log(`Utility bill submitted for customer ${customer.id} by user ${userId}`);
    return submission;
  }

  /**
   * Verify NIN and submit utility bill in one request
   * - First verifies NIN (skips if already verified)
   * - Then submits utility bill if customer is Tier 2 after NIN verification
   */
  async verifyNinAndSubmitUtilityBill(userId: string, dto: NinAndUtilityBillDto) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        ninVerification: true,
        bvnVerification: true,
        utilityBillSubmissions: {
          where: {
            status: UtilityBillStatus.PENDING,
          },
        },
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
      utilityBillSubmission: null,
      message: '',
    };

    // Step 1: NIN Verification (skip if already verified)
    if (customer.ninVerification) {
      this.logger.log(`NIN verification already exists for customer ${customer.id}, skipping NIN verification`);
      results.ninVerification = customer.ninVerification;
      results.message += 'NIN already verified. ';
    } else {
      try {
        // Verify NIN
        const ninDto: CreateNinVerificationDto = {
          nin: dto.nin,
        };
        results.ninVerification = await this.upgradeWithNin(customer.id, ninDto);
        results.message += 'NIN verification completed. ';
      } catch (error: any) {
        throw new BadRequestException(`NIN verification failed: ${error.message}`);
      }
    }

    // Refresh customer to get updated tier after NIN verification
    const updatedCustomer = await this.databaseService.customer.findUnique({
      where: { id: customer.id },
      include: {
        utilityBillSubmissions: {
          where: {
            status: UtilityBillStatus.PENDING,
          },
        },
      },
    });

    if (!updatedCustomer) {
      throw new NotFoundException('Customer not found after NIN verification');
    }

    // Step 2: Submit Utility Bill (only if customer is Tier 2)
    if (updatedCustomer.tier !== KycTier.Tier_2) {
      throw new BadRequestException(
        `Customer must be Tier 2 to submit utility bill. Current tier: ${updatedCustomer.tier}. Please complete BVN verification first.`
      );
    }

    // Check if there's already a pending submission
    if (updatedCustomer.utilityBillSubmissions.length > 0) {
      throw new ConflictException('You already have a pending utility bill submission. Please wait for review.');
    }

    // Create utility bill submission
    try {
      results.utilityBillSubmission = await this.databaseService.utilityBillSubmission.create({
        data: {
          customerId: updatedCustomer.id,
          utilityBillUrl: dto.utilityBillUrl,
          status: UtilityBillStatus.PENDING,
        },
      });
      results.message += 'Utility bill submitted successfully.';
      this.logger.log(`NIN verified and utility bill submitted for customer ${updatedCustomer.id} by user ${userId}`);
    } catch (error: any) {
      throw new BadRequestException(`Failed to submit utility bill: ${error.message}`);
    }

    return results;
  }
}
