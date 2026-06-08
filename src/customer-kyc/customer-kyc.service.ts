import { Injectable, NotFoundException, BadRequestException, ConflictException, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { ProviderService } from '../provider/provider.service.js';
import { CreateCustomerDto } from './dto/create-customer.dto.js';
import { UpdateCustomerNameDto, UpdateCustomerContactsDto } from './dto/update-customer.dto.js';
import { GetAllCustomersQueryDto } from './dto/customer-query.dto.js';
import { KycTier } from '../users/dto/create-user-dto.js';
import { Tier1FaceStatus, Tier3UpgradeStatus } from '../../generated/prisma/enums.js';
import { BvnCryptoService } from '../common/crypto/bvn-crypto.service.js';
import { resolvePartnershipAccountNumber } from '../common/utils/customer-account.util.js';
import { hasTier3Benefits } from '../common/utils/kyc-tier.util.js';
import type { AlatPartnerAccountKycStatusData } from '../provider/dto/provider-account-upgrade.dto.js';

@Injectable()
export class CustomerKycService {
  private readonly logger = new Logger(CustomerKycService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly providerService: ProviderService,
    private readonly bvnCrypto: BvnCryptoService,
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

    const bvnHash = this.bvnCrypto.hash(body.id);
    const customer = await this.databaseService.customer.findFirst({
      where: {
        OR: [{ tier1BvnHash: bvnHash }, { tier1PendingBvn: body.id }],
      },
    });

    if (!customer) {
      this.logger.debug(`Face callback: no customer for id (bvn)=${body.id}`);
      return { received: true };
    }

    if (!body.success) {
      await this.databaseService.customer.update({
        where: { id: customer.id },
        data: {
          tier1FaceStatus: Tier1FaceStatus.FAILED,
          tier1PendingBvn: null,
          tier1BvnHash: null,
          tier1CompletedAt: null,
        },
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
    const bvn = this.bvnCrypto.normalizeBvn(dto.bvn ?? '');
    const encryptedBvn = this.bvnCrypto.encrypt(bvn);
    const bvnHash = this.bvnCrypto.hash(bvn);
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
      where: {
        OR: [{ tier1BvnHash: bvnHash }, { tier1PendingBvn: bvn }],
        ...excludeCurrent,
      },
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
        tier1PendingBvn: encryptedBvn,
        tier1BvnHash: bvnHash,
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
          tier1PendingBvn: encryptedBvn,
          tier1BvnHash: bvnHash,
          // Wallet/account provisioning is async; callback sets COMPLETED/FAILED (BVN retained encrypted).
          tier1AccountStatus: 'PENDING',
          tier1AccountCompletedAt: null,
        },
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
          tier1BvnHash: null,
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

  private maskAccountNumber(accountNumber: string): string {
    const s = accountNumber.trim();
    if (s.length <= 4) return '****';
    return `${'*'.repeat(Math.max(0, s.length - 4))}${s.slice(-4)}`;
  }

  /**
   * Submit Tier 2 account upgrade (NIN + live face). Requires Tier 1 wallet account (COMPLETED).
   */
  async startTier2(userId: string, dto: { nin: string; bvn?: string; liveImageOfFace: string }) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: {
        user: true,
        wallets: { select: { virtualAccountNumber: true, isDefault: true } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    if (customer.tier !== KycTier.Tier_1) {
      throw new BadRequestException('Customer must complete Tier 1 before Tier 2');
    }

    if (customer.tier1AccountStatus !== 'COMPLETED') {
      throw new BadRequestException(
        'Complete Tier 1 account setup before upgrading to Tier 2. Wait for your wallet account to be confirmed.',
      );
    }

    let hasBvn = await this.databaseService.bvnVerification.findUnique({ where: { customerId: customer.id } });
    if (!hasBvn) {
      await this.databaseService.bvnVerification.upsert({
        where: { customerId: customer.id },
        create: { customerId: customer.id },
        update: {},
      });
      hasBvn = await this.databaseService.bvnVerification.findUnique({ where: { customerId: customer.id } });
    }
    if (!hasBvn) {
      throw new BadRequestException('BVN verification required before Tier 2');
    }

    const accountNumber = resolvePartnershipAccountNumber(customer);
    const maskedAcct = this.maskAccountNumber(accountNumber);

    let bvn: string | undefined;
    if (dto.bvn?.trim()) {
      bvn = this.bvnCrypto.normalizeBvn(dto.bvn);
    } else if (customer.tier1PendingBvn) {
      const decrypted = this.bvnCrypto.decrypt(customer.tier1PendingBvn);
      if (decrypted) bvn = decrypted;
    }

    this.logger.log(
      `Tier 2 upgrade start customerId=${customer.id} accountNumber=${maskedAcct} nin=present bvnIncluded=${!!bvn}`,
    );

    await this.providerService.partnerAccountUpgradeTier2({
      accountNumber,
      nin: dto.nin,
      liveImageOfFace: dto.liveImageOfFace,
      ...(bvn ? { bvn } : {}),
    });

    const tier2CustomerUpdate: {
      tier: KycTier;
      providerTierCode: number;
      tier1PendingBvn?: string;
      tier1BvnHash?: string;
    } = {
      tier: KycTier.Tier_2,
      providerTierCode: 2,
    };
    if (bvn && customer.tier1PendingBvn && this.bvnCrypto.isLegacyPlaintext(customer.tier1PendingBvn)) {
      tier2CustomerUpdate.tier1PendingBvn = this.bvnCrypto.encrypt(bvn);
      tier2CustomerUpdate.tier1BvnHash = this.bvnCrypto.hash(bvn);
    }

    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: tier2CustomerUpdate,
    });

    await this.databaseService.ninVerification.upsert({
      where: { customerId: customer.id },
      create: { customerId: customer.id },
      update: {},
    });

    let addressVerificationStatus: string | undefined;
    try {
      const kycStatus = await this.providerService.getPartnerAccountKycStatus(accountNumber);
      addressVerificationStatus = kycStatus.data?.addressVerificationStatus;
      if (addressVerificationStatus) {
        await this.databaseService.customer.update({
          where: { id: customer.id },
          data: { tier2AddressVerificationStatus: addressVerificationStatus },
        });
      }
    } catch (err) {
      this.logger.warn(
        `Tier 2 upgrade: could not fetch partner KYC status for ${maskedAcct}: ${(err as Error).message}`,
      );
    }

    this.logger.log(`Tier 2 upgrade authorized customerId=${customer.id} accountNumber=${maskedAcct}`);

    return {
      tier: KycTier.Tier_2,
      message: 'Tier 2 upgrade completed successfully.',
      addressVerificationStatus,
    };
  }

  /**
   * Submit Tier 3 account upgrade (address). Sets tier Tier_3 + tier3UpgradeStatus PENDING until admin approves.
   */
  async startTier3(
    userId: string,
    dto: { residentialAddress: Record<string, string | undefined> },
  ) {
    const customer = await this.databaseService.customer.findUnique({
      where: { userId },
      include: { wallets: { select: { virtualAccountNumber: true, isDefault: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    if (customer.tier !== KycTier.Tier_2) {
      throw new BadRequestException('Customer must be Tier 2 before applying for Tier 3');
    }
    if (customer.tier3UpgradeStatus === Tier3UpgradeStatus.PENDING) {
      throw new ConflictException('Tier 3 upgrade is already pending address verification.');
    }
    if (customer.tier3UpgradeStatus === Tier3UpgradeStatus.COMPLETED) {
      throw new ConflictException('Tier 3 upgrade is already completed.');
    }
    if (customer.tier1AccountStatus !== 'COMPLETED') {
      throw new BadRequestException('Complete Tier 1 account setup before upgrading to Tier 3.');
    }

    const accountNumber = resolvePartnershipAccountNumber(customer);
    const maskedAcct = this.maskAccountNumber(accountNumber);
    const residentialAddress = { ...dto.residentialAddress };

    await this.providerService.partnerAccountUpgradeTier3({
      accountNumber,
      residentialAddress,
    });

    let providerAddressStatus: string | undefined;
    try {
      const kycStatus = await this.providerService.getPartnerAccountKycStatus(accountNumber);
      providerAddressStatus = kycStatus.data?.addressVerificationStatus;
    } catch (err) {
      this.logger.warn(
        `Tier 3 upgrade: could not fetch partner KYC status for ${maskedAcct}: ${(err as Error).message}`,
      );
    }

    await this.databaseService.customer.update({
      where: { id: customer.id },
      data: {
        tier: KycTier.Tier_3,
        providerTierCode: 3,
        tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
        tier2AddressVerificationStatus: providerAddressStatus ?? 'PENDING',
      },
    });

    await this.databaseService.addressVerification.upsert({
      where: { customerId: customer.id },
      create: {
        customerId: customer.id,
        verified: false,
        residentialAddressJson: residentialAddress as object,
        providerStatus: providerAddressStatus ?? 'PENDING',
      },
      update: {
        verified: false,
        residentialAddressJson: residentialAddress as object,
        providerStatus: providerAddressStatus ?? 'PENDING',
      },
    });

    this.logger.log(
      `Tier 3 upgrade submitted userId=${userId} accountNumber=${maskedAcct} tier3UpgradeStatus=PENDING`,
    );

    return {
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
      message: 'Tier 3 upgrade submitted. Address verification is pending.',
    };
  }

  /**
   * Fetch partner account KYC status from ALAT account-upgrade API (masked logging).
   */
  async fetchPartnerAccountKycStatus(customerId: string): Promise<AlatPartnerAccountKycStatusData | null> {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: { wallets: { select: { virtualAccountNumber: true, isDefault: true } } },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    let accountNumber: string;
    try {
      accountNumber = resolvePartnershipAccountNumber(customer);
    } catch {
      return null;
    }

    const res = await this.providerService.getPartnerAccountKycStatus(accountNumber);
    return res.data ?? null;
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
  async getAccountDetails(userId: string): Promise<{
    accountNumber: string | null;
    accountName: string | null;
    accountTier: string | null;
    accountStatus: string | null;
    restrictionStatus: string | null;
  } | null> {
    const customerId = await this.getCustomerIdByUserId(userId);
    const data = await this.fetchPartnerAccountKycStatus(customerId);
    if (!data) {
      return null;
    }
    return {
      accountNumber: data.accountNumber?.trim() || null,
      accountName: data.accountName?.trim() || null,
      accountTier: data.accountTier?.trim() || null,
      accountStatus: data.accountStatus?.trim() || null,
      restrictionStatus: data.restrictionStatus?.trim() || null,
    };
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
  async getCustomerKycStatusByUserId(
    userId: string,
    options?: { includePartnerAccountStatus?: boolean },
  ) {
    const customerId = await this.getCustomerIdByUserId(userId);
    return this.getCustomerKycStatus(customerId, options);
  }

  /**
   * Get customer KYC status (local DB; optional partner account KYC from account-upgrade API).
   */
  async getCustomerKycStatus(
    customerId: string,
    options?: { includePartnerAccountStatus?: boolean },
  ) {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      include: {
        ninVerification: true,
        bvnVerification: true,
        addressVerification: true,
        user: { select: { phone: true } },
        wallets: { select: { virtualAccountNumber: true, isDefault: true } },
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
      tier3UpgradeStatus: customer.tier3UpgradeStatus,
      hasTier3Benefits: hasTier3Benefits(customer),
      hasNin: !!customer.ninVerification,
      hasBvn: !!customer.bvnVerification,
      hasAddressVerification: !!customer.addressVerification,
    };

    if (!options?.includePartnerAccountStatus) {
      return base;
    }

    try {
      const accountNumber = resolvePartnershipAccountNumber(customer);
      const res = await this.providerService.getPartnerAccountKycStatus(accountNumber);
      const data = res.data;
      if (!data) {
        return base;
      }
      return {
        ...base,
        partnerAccount: {
          accountNumber: data.accountNumber?.trim() || accountNumber,
          accountName: data.accountName?.trim() || null,
          accountTier: data.accountTier?.trim() || null,
          accountStatus: data.accountStatus?.trim() || null,
          restrictionStatus: data.restrictionStatus?.trim() || null,
        },
      };
    } catch (error) {
      this.logger.warn(`Could not fetch partner account KYC status: ${(error as Error).message}`);
      return base;
    }
  }
}
