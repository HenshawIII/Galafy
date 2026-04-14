import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerNameDto, UpdateCustomerContactsDto } from './dto/update-customer.dto.js';
import { GetAllCustomersQueryDto } from './dto/customer-query.dto.js';
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
   * Legacy face callback handler (endpoint currently disabled).
   * Tier 1 face completion is now driven by account-creation callback status.
   * This method is retained for backward compatibility and non-breaking reuse if needed.
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
        data: { tier1FaceStatus: Tier1FaceStatus.FAILED, tier1PendingBvn: null, tier1CompletedAt: null },
      });
      this.logger.log(`Face callback: face failed for customer ${customer.id}`);
      return { received: true };
    }

    // Provider Tier1 is called in `startTier1` now. This callback only updates face status.
    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1CompletedAt: new Date(),
      },
    });
    this.logger.log(`Face callback: Tier 1 face completed for customer ${customer.id}, c_id=${body.c_id}`);

    return { received: true };
  }

  /**
   * Register and call Tier 1 provider immediately (BVN + account-creation callback flow).
   * The frontend provides `correlationId` up-front so we can return provider feedback immediately.
   */
  async startTier1(
    userId: string,
    dto: { phoneNumber: string; email: string; bvn: string; correlationId: string },
  ): Promise<{
    success: true;
    correlationId: string;
    trackingId?: string | null;
    accountGenerationStatus?: string | null;
    providerTierCode?: number;
  }> {
    const user = await this.databaseService.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let customer = await this.databaseService.customer.findUnique({ where: { userId } });
    const phone = dto.phoneNumber?.trim() ?? '';
    const email = dto.email?.trim().toLowerCase() ?? '';
    const bvn = dto.bvn?.trim() ?? '';
    const correlationId = dto.correlationId?.trim() ?? '';

    const excludeCurrent = customer ? { id: { not: customer.id } } : {};
    const existingByPhone = await this.databaseService.customer.findFirst({
      where: { mobileNumber: phone, ...excludeCurrent },
    });
    if (existingByPhone) {
      throw new ConflictException('Phone number is already registered with another account');
    }
    const existingByEmail = await this.databaseService.customer.findFirst({
      where: { emailAddress: { equals: email, mode: 'insensitive' }, ...excludeCurrent },
    });
    if (existingByEmail) {
      throw new ConflictException('Email address is already registered with another account');
    }
    const existingByBvn = await this.databaseService.customer.findFirst({
      where: { tier1PendingBvn: bvn, ...excludeCurrent },
    });
    if (existingByBvn) {
      throw new ConflictException('BVN is already being used by another account');
    }

    if (!customer) {
      await this.createCustomer(userId, {
        userId,
        firstName: user.firstName ?? undefined,
        lastName: user.lastName ?? undefined,
        emailAddress: email || user.email,
        mobileNumber: phone,
      });
      customer = await this.databaseService.customer.findUnique({ where: { userId } });
      if (!customer) throw new BadRequestException('Failed to create customer');
    }

    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier1PendingBvn: bvn,
        mobileNumber: phone,
        emailAddress: email,
        tier1FaceStatus: Tier1FaceStatus.PENDING,
        tier1CompletedAt: null,
        tier1AccountStatus: 'PENDING',
        tier1AccountCompletedAt: null,
        tier1Nuban: null,
        tier1NubanName: null,
      },
    });

    try {
      const res = await this.providerService.tier1BvnWithoutOtpV2({
        phoneNumber: phone,
        email,
        bvn,
        correlationId,
      });

      const trackingId = res.data?.trackingId ?? null;
      const accountGenerationStatus = res.data?.accountGenerationStatus ?? null;

      // trackingId is not globally unique from the provider (e.g. sandbox); keep it in tier1TrackingId only.
      // Do not copy into providerCustomerId (@unique) — legacy /api/v1/customer flows are not used for ALAT Tier 1.
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: {
          tier1CorrelationId: correlationId,
          tier1TrackingId: trackingId,
          tier1FaceStatus: Tier1FaceStatus.PENDING,
          tier1CompletedAt: null,
          tier: KycTier.Tier_1,
          providerTierCode: 1,
          tier1PendingBvn: bvn,
          // Wallet/account provisioning is async; callback will update to COMPLETED/FAILED.
          tier1AccountStatus: 'PENDING',
          tier1AccountCompletedAt: null,
        },
      });

      await this.databaseService.bvnVerification.upsert({
        where: { customerId: customer.id },
        create: { customerId: customer.id },
        update: {},
      });

      this.logger.log(
        `Tier 1 started via startTier1 for customer ${customer.id}, correlationId=${correlationId}, trackingId=${trackingId}`,
      );

      return {
        success: true,
        correlationId,
        trackingId,
        accountGenerationStatus,
        providerTierCode: 1,
      };
    } catch (err) {
      this.logger.warn(`Tier 1 provider call failed for customer ${customer.id}: ${err}`);
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: {
          tier: KycTier.Tier_0,
          providerTierCode: 0,
          tier1FaceStatus: Tier1FaceStatus.FAILED,
          tier1PendingBvn: null,
          tier1CompletedAt: null,
          tier1AccountStatus: 'FAILED',
          tier1AccountCompletedAt: null,
          tier1Nuban: null,
          tier1NubanName: null,
        },
      });
      throw err;
    }
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

    // Tier 2 BVN is derived from Tier 1 session (tier1PendingBvn is cleared only when Tier 1 face fails).
    const tier1Bvn = customer.tier1PendingBvn;
    if (!tier1Bvn) {
      throw new BadRequestException('BVN is missing for Tier 2 submission');
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
      bvn: tier1Bvn,
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
  async getAccountDetails(
    userId: string,
    phoneNumber?: string,
  ): Promise<{
    accountNumber?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    phoneNumber?: string;
  } | null> {
    const phone =
      phoneNumber ??
      (await this.databaseService.user.findUnique({ where: { id: userId } }))?.phone ??
      (await this.databaseService.customer.findFirst({ where: { userId } }))?.mobileNumber;
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

    // Create customer in our DB only (Tier 0). ALAT Tier 1 stores session id in tier1TrackingId; providerCustomerId stays null.
    const customer = await this.databaseService.customer.create({
      data: {
        userId,
        providerCustomerId: null,
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
   * Get customer KYC status (local + optional ALAT account details)
   */
  async getCustomerKycStatus(customerId: string) {
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
      tier1AccountStatus: customer.tier1AccountStatus,
      tier1Nuban: customer.tier1Nuban,
      tier1NubanName: customer.tier1NubanName,
      tier2TrackingId: customer.tier2TrackingId,
      tier2AddressVerificationStatus: customer.tier2AddressVerificationStatus,
      hasNin: !!customer.ninVerification,
      hasBvn: !!customer.bvnVerification,
      hasAddressVerification: !!customer.addressVerification,
    };

    const phone = customer.mobileNumber || customer.user?.phone;
    if (!phone) {
      return base;
    }

    try {
      const accountDetails = await this.providerService.getPartnershipAccountDetails(phone);
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
      this.logger.debug(`Could not fetch partnership account details: ${(error as Error).message}`);
      return base;
    }
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
}
