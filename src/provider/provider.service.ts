import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import {
  ProviderCreateCustomerRequestDto,
  ProviderUpdateCustomerNameRequestDto,
  ProviderUpdateCustomerContactsRequestDto,
  ProviderCustomerResponseDto,
  ProviderCustomerKycStatusResponseDto,
} from './dto/provider-customer.dto.js';
import {
  ProviderNinVerificationRequestDto,
  ProviderBvnVerificationRequestDto,
  ProviderAddressVerificationRequestDto,
  ProviderNinVerificationResponseDto,
  ProviderBvnVerificationResponseDto,
  ProviderAddressVerificationResponseDto,
} from './dto/provider-kyc.dto.js';
import type {
  AlatTier1Request,
  AlatTier1Response,
  AlatTier2Request,
  AlatTier2Response,
  AlatCountryModel,
  AlatCountryItem,
  AlatStateItem,
  AlatLgaItem,
  AlatCityItem,
  AlatGetDropDownListResponse,
  AlatPartnershipAccountDetails,
  AlatGetPartnershipAccountDetailsResponse,
} from './dto/provider-alat.dto.js';
import { config } from 'dotenv';
config();

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);
  private readonly baseUrl: string;
  private readonly payoutBaseUrl: string;
  private readonly apiKey: string;
  private readonly organizationId: string;
  private readonly kycBaseUrl: string;
  private readonly kycSubscriptionKey: string;
  /** Cache for Alat GetDropDownList (countryModel). TTL 1 hour. */
  private dropdownCache: { data: AlatCountryModel; expiresAt: number } | null = null;
  private static readonly DROPDOWN_CACHE_TTL_MS = 60 * 60 * 1000;

  constructor() {
    this.baseUrl = process.env.PROVIDER_BASE_URL || '';
    this.payoutBaseUrl = process.env.PROVIDER_PAYOUT_BASE_URL || '';
    this.apiKey = process.env.PROVIDER_API_KEY || '';
    this.organizationId = process.env.PROVIDER_ORGANIZATION_ID || '';
    this.kycBaseUrl = process.env.PROVIDER_KYC_BASE_URL || 'https://apiplayground.alat.ng/create-account-face/api';
    this.kycSubscriptionKey = process.env.PROVIDER_KYC_SUBSCRIPTION_KEY || '';

    if (!this.baseUrl || !this.apiKey || !this.organizationId) {
      this.logger.warn('Provider configuration is incomplete. Some features may not work.');
    }

    if (!this.payoutBaseUrl) {
      this.logger.warn(
        'Payout base URL is not configured. Payout-related features (banks, transfers, etc.) may not work.',
      );
    }

    if (!this.kycSubscriptionKey) {
      this.logger.warn('PROVIDER_KYC_SUBSCRIPTION_KEY is not set. ALAT KYC endpoints may not work.');
    }
  }

  /**
   * Generic method to make HTTP requests to the provider API
   */
  private async makeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET',
    body?: any,
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      this.logger.debug(`Making ${method} request to: ${url}`);
      if (body) {
        this.logger.debug(`Request body: ${JSON.stringify(body)}`);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Get response text first to check if it's empty
      const responseText = await response.text();

      // Check if response is empty
      if (!responseText || responseText.trim().length === 0) {
        this.logger.error(`Provider API returned empty response. Status: ${response.status}`);
        throw new HttpException(
          'Provider API returned empty response',
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Try to parse JSON
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.error(`Failed to parse JSON response.Response text: ${responseText.substring(0, 200)}`);
        throw new HttpException('Invalid JSON response from provider API', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!response.ok) {
        this.logger.error(`Provider API error (${response.status}): ${JSON.stringify(data)}`);
        throw new HttpException(
          data.message || data.error || 'Provider API request failed',
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Provider API request failed: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw new HttpException(
        `Failed to communicate with provider service: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * Generic method to make HTTP requests to the payout API
   */
  private async makePayoutRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PATCH' | 'PUT' = 'GET',
    body?: any,
  ): Promise<T> {
    const url = `${this.payoutBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      this.logger.debug(`Making ${method} request to payout API: ${url}`);
      if (body) {
        this.logger.debug(`Request body: ${JSON.stringify(body)}`);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      // Get response text first to check if it's empty
      const responseText = await response.text();

      // Check if response is empty
      if (!responseText || responseText.trim().length === 0) {
        this.logger.error(`Payout API returned empty response. Status: ${response.status}`);
        throw new HttpException(
          'Payout API returned empty response',
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Try to parse JSON
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.error(`Failed to parse JSON response. Response text: ${responseText.substring(0, 200)}`);
        throw new HttpException('Invalid JSON response from payout API', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!response.ok) {
        this.logger.error(`Payout API error (${response.status}): ${JSON.stringify(data)}`);
        throw new HttpException(
          data.message || data.error || 'Payout API request failed',
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Payout API request failed: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw new HttpException(
        `Failed to communicate with payout service: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /**
   * ALAT KYC API: HTTP request with Ocp-Apim-Subscription-Key
   * Normalizes status/code/errors and throws on failure (409 for duplicate).
   */
  private async makeKycRequest<T>(endpoint: string, method: 'GET' | 'POST' = 'GET', body?: any): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : `${this.kycBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': this.kycSubscriptionKey,
    };

    try {
      this.logger.debug(`Making ${method} request to KYC API: ${url}`);
      if (body) {
        this.logger.debug(`Request body: ${JSON.stringify(body).substring(0, 200)}...`);
      }

      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        this.logger.error(`KYC API returned empty response. Status: ${response.status}`);
        throw new HttpException('KYC API returned empty response', response.status || HttpStatus.INTERNAL_SERVER_ERROR);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.error(`Invalid JSON from KYC API: ${responseText.substring(0, 200)}`);
        throw new HttpException('Invalid JSON response from KYC API', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      const success =
        data.status === true ||
        data.statusCode === 100 ||
        data.statusCode === 200 ||
        (typeof data.countryModel !== 'undefined' && data.countryModel != null);
      if (!success) {
        const msg = data.message || data.errors?.[0] || 'KYC API request failed';
        const isDuplicate =
          typeof msg === 'string' &&
          (msg.toLowerCase().includes('already exist') || msg.toLowerCase().includes('already exists'));
        throw new HttpException(msg, isDuplicate ? HttpStatus.CONFLICT : response.status || HttpStatus.BAD_REQUEST);
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`KYC API request failed: ${error.message}`);
      throw new HttpException(
        `Failed to communicate with KYC service: ${error.message}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  // ==================== CUSTOMER OPERATIONS ====================

  /**
   * Create a new customer in the provider system
   * @deprecated Use ALAT flow: create customer locally (Tier 0), then startTier1 + face callback
   */
  async createCustomer(requestDto: ProviderCreateCustomerRequestDto): Promise<{ customerId: string }> {
    const body = {
      organizationId: this.organizationId,
      ...requestDto,
    };

    const response = await this.makeRequest<{
      statuscode?: string;
      statusCode?: string;
      code?: string;
      success?: boolean;
      message: string;
      data?: {
        id?: string;
        customerId?: string;
        [key: string]: any;
      };
      customerId?: string;
      errors?: any[];
    }>('/api/v1/customers/add', 'POST', body);

    // Check various possible status code formats
    const statusCode = response.statuscode || response.statusCode || response.code;
    const statusCodeStr = statusCode ? String(statusCode) : '';
    const isSuccess =
      statusCodeStr === '00' ||
      statusCodeStr === '200' ||
      (typeof statusCode === 'number' && statusCode === 200) ||
      response.success === true ||
      response.message?.toLowerCase().includes('success');

    // Extract customerId from various possible locations (id is the primary field)
    const customerId = response.data?.id || response.data?.customerId || response.customerId;

    if (!isSuccess || !customerId) {
      this.logger.error(`Failed to create customer. Response: ${JSON.stringify(response)}`);
      throw new HttpException(response.message || 'Failed to create customer', HttpStatus.BAD_REQUEST);
    }

    return { customerId };
  }

  /**
   * Get customer by ID from provider
   */
  async getCustomerById(customerId: string): Promise<ProviderCustomerResponseDto> {
    const response = await this.makeRequest<{ data: ProviderCustomerResponseDto }>(
      `/api/v1/customers/get/id/${customerId}`,
      'GET',
    );

    return response.data;
  }

  /**
   * Get all customers from provider
   */
  async getAllCustomers(): Promise<ProviderCustomerResponseDto[]> {
    const response = await this.makeRequest<{ data: ProviderCustomerResponseDto[] }>(
      '/api/v1/customers/get/all',
      'GET',
    );

    return response.data || [];
  }

  /**
   * Update customer name
   */
  async updateCustomerName(
    customerId: string,
    requestDto: ProviderUpdateCustomerNameRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    const body = {
      organizationId: this.organizationId,
      ...requestDto,
    };

    const response = await this.makeRequest<{
      statuscode?: string;
      code?: string;
      message: string;
      success?: boolean;
    }>(`/api/v1/customers/customer/${customerId}/updatename`, 'PATCH', body);

    return {
      success: response.statuscode === '00' || response.code === '00' || response.success === true,
      message: response.message,
    };
  }

  /**
   * Update customer contacts
   */
  async updateCustomerContacts(
    customerId: string,
    requestDto: ProviderUpdateCustomerContactsRequestDto,
  ): Promise<{ success: boolean; message: string }> {
    const body = {
      organizationId: this.organizationId,
      ...requestDto,
    };

    const response = await this.makeRequest<{
      statuscode?: string;
      code?: string;
      message: string;
      success?: boolean;
    }>(`/api/v1/customers/customer/${customerId}/updatecontact`, 'PATCH', body);

    return {
      success: response.statuscode === '00' || response.code === '00' || response.success === true,
      message: response.message,
    };
  }

  /**
   * Get customer KYC status
   */
  async getCustomerKycStatus(customerId: string): Promise<ProviderCustomerKycStatusResponseDto> {
    const response = await this.makeRequest<{
      data: ProviderCustomerKycStatusResponseDto;
      status: number;
      message: string;
    }>(`/api/v1/customers/customer-verification-properties/${customerId}`, 'GET');

    return response.data;
  }

  // ==================== KYC OPERATIONS ====================

  /**
   * Upgrade customer KYC with NIN (Tier 1)
   * @deprecated Use ALAT tier2PartnershipWithoutOtpV2 for Tier 2 (NIN + address + face)
   */
  async upgradeCustomerWithNin(
    requestDto: ProviderNinVerificationRequestDto,
  ): Promise<ProviderNinVerificationResponseDto> {
    // Build URL with query parameters
    const queryParams = new URLSearchParams();
    queryParams.append('nin', requestDto.nin);
    queryParams.append('customerId', requestDto.customerId);
    queryParams.append('verify', String(requestDto.verify ?? 1));

    const endpoint = `/api/v1/customers/kyc/customer/nin?${queryParams.toString()}`;

    // Body contains firstname, lastname, dob
    const body = {
      firstname: requestDto.firstname,
      lastname: requestDto.lastname,
      dob: requestDto.dob,
    };

    const response = await this.makeRequest<ProviderNinVerificationResponseDto>(endpoint, 'POST', body);

    return response;
  }

  /**
   * Upgrade customer KYC with BVN (Tier 2)
   * @deprecated Use ALAT tier1BvnWithoutOtpV2 + face callback for Tier 1
   */
  async upgradeCustomerWithBvn(
    requestDto: ProviderBvnVerificationRequestDto,
  ): Promise<ProviderBvnVerificationResponseDto> {
    const body = {
      customerId: requestDto.customerId,
      bvn: requestDto.bvn,
    };

    const response = await this.makeRequest<ProviderBvnVerificationResponseDto>(
      '/api/v1/customers/kyc/premium-kyc',
      'POST',
      body,
    );

    return response;
  }

  /**
   * Verify customer address (Tier 3)
   * @deprecated Use ALAT Tier 2 flow (residential address in tier2PartnershipWithoutOtpV2)
   */
  async verifyCustomerAddress(
    requestDto: ProviderAddressVerificationRequestDto,
  ): Promise<ProviderAddressVerificationResponseDto> {
    const body = {
      customerId: requestDto.customerId,
      houseAddress: requestDto.houseAddress,
      meterNumber: requestDto.meterNumber,
      discoCode: requestDto.discoCode,
    };

    const response = await this.makeRequest<ProviderAddressVerificationResponseDto>(
      '/api/v1/customers/kyc/address-verification',
      'POST',
      body,
    );

    return response;
  }

  // ==================== ALAT KYC (create-account-face) ====================

  /**
   * Tier 1: Generate customer with BVN (no OTP). Face verification completes via callback.
   */
  async tier1BvnWithoutOtpV2(body: AlatTier1Request): Promise<AlatTier1Response> {
    return this.makeKycRequest<AlatTier1Response>('/partnership/tier1-bvn-withoutOtp-v2', 'POST', body);
  }

  /**
   * Tier 2: Partnership account with NIN + address + live face image.
   */
  async tier2PartnershipWithoutOtpV2(body: AlatTier2Request): Promise<AlatTier2Response> {
    return this.makeKycRequest<AlatTier2Response>('/partnership/tier2-partnershipaccount-withoutOtp-v2', 'POST', body);
  }

  /**
   * Get dropdown reference data: countries, states, LGAs, LCDAs, cities, housing types.
   */
  async getDropDownList(): Promise<AlatCountryModel> {
    const res = await this.makeKycRequest<AlatGetDropDownListResponse>('/CustomerInfo/GetDropDownList', 'GET');
    if (!res.countryModel) {
      throw new HttpException('GetDropDownList returned no countryModel', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return res.countryModel;
  }

  /** Get cached country model (fetches and caches with 1h TTL). Used by KYC reference methods. */
  private async getCachedCountryModel(): Promise<AlatCountryModel> {
    const now = Date.now();
    if (this.dropdownCache && this.dropdownCache.expiresAt > now) {
      return this.dropdownCache.data;
    }
    const data = await this.getDropDownList();
    this.dropdownCache = { data, expiresAt: now + ProviderService.DROPDOWN_CACHE_TTL_MS };
    return data;
  }

  /**
   * Get countries from KYC dropdown (for Tier 2 address). Uses cached GetDropDownList.
   */
  async getKycCountries(): Promise<AlatCountryItem[]> {
    const model = await this.getCachedCountryModel();
    return model.countryList ?? [];
  }

  /**
   * Get states from KYC dropdown (mostly Nigeria). Uses cached GetDropDownList.
   */
  async getKycStates(): Promise<AlatStateItem[]> {
    const model = await this.getCachedCountryModel();
    return model.stateList ?? [];
  }

  /**
   * Get LGAs by state (stateId from stateList). Uses cached GetDropDownList.
   */
  async getKycLgaByState(stateId: number): Promise<AlatLgaItem[]> {
    const model = await this.getCachedCountryModel();
    const list = model.lgaList ?? [];
    return list.filter((l) => l.stateId === stateId);
  }

  /**
   * Get cities by state (stateId from stateList). Uses cached GetDropDownList.
   */
  async getKycCityByState(stateId: number): Promise<AlatCityItem[]> {
    const model = await this.getCachedCountryModel();
    const list = model.cityList ?? [];
    return list.filter((c) => c.stateId === stateId);
  }

  /**
   * Get partnership account details (optional phoneNumber query).
   * Throws on API error; returns data or null if response has no data.
   */
  async getPartnershipAccountDetails(phoneNumber?: string): Promise<AlatPartnershipAccountDetails | null> {
    const endpoint = phoneNumber
      ? `/CustomerAccount/GetPartnershipAccountDetails?phoneNumber=${encodeURIComponent(phoneNumber)}`
      : '/CustomerAccount/GetPartnershipAccountDetails';
    const res = await this.makeKycRequest<AlatGetPartnershipAccountDetailsResponse>(endpoint, 'GET');
    return res.data ?? null;
  }

  // ==================== PAYOUT OPERATIONS (legacy HTTP; banks list + name enquiry) ====================

  /**
   * Get banks available for payouts
   */
  async getBanks(): Promise<Array<{ bankcode: string; bankname: string }>> {
    const response = await this.makePayoutRequest<{
      data: Array<{ bankCode: string; bankName: string }>;
      statusCode: number;
      message: string;
      succeeded: boolean;
    }>('/api/Payout/banks', 'GET');

    // Map the response from camelCase (bankCode, bankName) to lowercase (bankcode, bankname)
    if (!response.data || !Array.isArray(response.data)) {
      return [];
    }

    return response.data.map((bank) => ({
      bankcode: bank.bankCode,
      bankname: bank.bankName,
    }));
  }

  /**
   * Bank account name enquiry
   */
  async bankAccountNameEnquiry(
    bankCode: string,
    accountNumber: string,
  ): Promise<{
    destinationBankCode: string;
    accountNumber: string;
    accountName: string;
  }> {
    const body = {
      bankCode,
      accountNumber,
    };

    const response = await this.makePayoutRequest<{
      data: {
        destinationBankCode: string;
        accountNumber: string;
        accountName: string;
      };
      statusCode: number;
      code: string | null;
      message: string;
      succeeded: boolean;
    }>('/api/Payout/name-enquiry', 'POST', body);

    if (!response.succeeded) {
      throw new HttpException(response.message || 'Name enquiry failed', HttpStatus.BAD_REQUEST);
    }

    return response.data;
  }

  // ====================
  // Debit-wallet transfer
  // ====================
  /**
   * ALAT Debit Wallet: ProcessClientTransfer (callback-based transfer initiation).
   *
   * Provider docs (testing) use:
   * POST https://apiplayground.alat.ng/debit-wallet/api/Shared/ProcessClientTransfer
   */
  async processClientTransfer(request: {
    securityInfo: string;
    amount: number;
    destinationBankCode: string;
    destinationBankName: string;
    destinationAccountNumber: string;
    destinationAccountName: string;
    sourceAccountNumber: string;
    narration: string;
    transactionReference: string;
    useCustomNarration: boolean;
  }): Promise<any> {
    const url =
      process.env.PROVIDER_DEBIT_WALLET_PROCESS_CLIENT_TRANSFER_URL ||
      'https://apiplayground.alat.ng/debit-wallet/api/Shared/ProcessClientTransfer';

    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
    };

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(request),
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        throw new HttpException('Provider API returned empty response', response.status || HttpStatus.INTERNAL_SERVER_ERROR);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        throw new HttpException('Invalid JSON response from provider API', HttpStatus.INTERNAL_SERVER_ERROR);
      }

      if (!response.ok) {
        throw new HttpException(
          data.message || data.error || 'Provider API request failed',
          response.status || HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      return data;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new HttpException(
        `Failed to communicate with provider debit-wallet service: ${(error as any)?.message ?? String(error)}`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }
}
