import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
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
  private readonly apiKey: string;
  private readonly organizationId: string;
  private readonly kycBaseUrl: string;
  private readonly kycSubscriptionKey: string;
  /** Cache for Alat GetDropDownList (countryModel). TTL 1 hour. */
  private dropdownCache: { data: AlatCountryModel; expiresAt: number } | null = null;
  private static readonly DROPDOWN_CACHE_TTL_MS = 60 * 60 * 1000;

  /** Returned to API clients when the upstream partner returns 5xx or is unreachable (do not echo partner 500 as our 500). */
  static readonly CLIENT_PARTNER_UNAVAILABLE_MESSAGE =
    'Our partner service is temporarily unavailable. Please try again in a few minutes.';

  constructor() {
    this.baseUrl = process.env.PROVIDER_BASE_URL || '';
    this.apiKey = process.env.PROVIDER_API_KEY || '';
    this.organizationId = process.env.PROVIDER_ORGANIZATION_ID || '';
    this.kycBaseUrl = process.env.PROVIDER_KYC_BASE_URL || 'https://apiplayground.alat.ng/create-account-face/api';
    this.kycSubscriptionKey = process.env.PROVIDER_KYC_SUBSCRIPTION_KEY || '';

    if (!this.baseUrl || !this.apiKey || !this.organizationId) {
      this.logger.warn('Provider configuration is incomplete. Some features may not work.');
    }

    const debitAccess = process.env.PROVIDER_DEBIT_WALLET_ACCESS_KEY || this.apiKey;
    const debitApim = process.env.PROVIDER_DEBIT_WALLET_APIM_KEY || this.kycSubscriptionKey;
    if (!debitAccess || !debitApim) {
      this.logger.warn(
        'Debit-wallet payout features need PROVIDER_DEBIT_WALLET_ACCESS_KEY (or PROVIDER_API_KEY) and PROVIDER_DEBIT_WALLET_APIM_KEY (or PROVIDER_KYC_SUBSCRIPTION_KEY).',
      );
    }

    if (!this.kycSubscriptionKey) {
      this.logger.warn('PROVIDER_KYC_SUBSCRIPTION_KEY is not set. ALAT KYC endpoints may not work.');
    }
  }

  /**
   * Map upstream HTTP errors for client responses: partner 5xx → 503 + safe message (details only in logs).
   */
  private throwForUpstreamHttpError(
    response: Response,
    parsedBody: unknown,
    logLabel: string,
  ): void {
    if (response.ok) {
      return;
    }
    const status = response.status;
    const detail =
      typeof parsedBody === 'object' && parsedBody !== null
        ? JSON.stringify(parsedBody)
        : String(parsedBody ?? '');
    if (status >= 500) {
      this.logger.error(`${logLabel}: upstream HTTP ${status} ${detail}`);
      throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }
    const body = parsedBody as { message?: string; error?: string } | null;
    const msg = body?.message || body?.error || `${logLabel} request failed`;
    throw new HttpException(msg, status || HttpStatus.BAD_REQUEST);
  }

  private buildDebitWalletUrl(path: string): string {
    const base = (
      process.env.PROVIDER_DEBIT_WALLET_BASE_URL || 'https://apiplayground.alat.ng/debit-wallet/api'
    ).replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private getDebitWalletAccessKey(): string {
    return process.env.PROVIDER_DEBIT_WALLET_ACCESS_KEY || this.apiKey;
  }

  private getDebitWalletApimKey(): string {
    return process.env.PROVIDER_DEBIT_WALLET_APIM_KEY || this.kycSubscriptionKey;
  }

  private debitWalletErrorMessage(parsed: unknown): string {
    if (typeof parsed !== 'object' || parsed === null) {
      return 'Debit-wallet request failed';
    }
    const o = parsed as { errorMessage?: string; errorMessages?: string[] };
    if (typeof o.errorMessage === 'string' && o.errorMessage.trim()) {
      return o.errorMessage;
    }
    const first = o.errorMessages?.find((m) => typeof m === 'string' && m.trim());
    return first || 'Debit-wallet request failed';
  }

  private isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
  }

  /**
   * ALAT debit-wallet API: `access` + `Ocp-Apim-Subscription-Key`, JSON envelope with `result` / `hasError`.
   */
  private async makeDebitWalletRequest<T>(
    pathOrOptions: string | { absoluteUrl: string },
    method: 'GET' | 'POST',
    options?: {
      body?: unknown;
      /** Defaults to application/json-patch+json for POST when omitted */
      contentType?: string;
      logLabel?: string;
    },
  ): Promise<T> {
    const url = typeof pathOrOptions === 'string' ? this.buildDebitWalletUrl(pathOrOptions) : pathOrOptions.absoluteUrl;
    const logLabel = options?.logLabel ?? 'Debit-wallet API';
    const access = this.getDebitWalletAccessKey();
    const apim = this.getDebitWalletApimKey();
    const headers: Record<string, string> = {
      access,
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': apim,
    };
    if (method === 'POST') {
      headers['Content-Type'] = options?.contentType ?? 'application/json-patch+json';
    }

    try {
      this.logger.debug(`Making ${method} ${logLabel}: ${url}`);
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' && options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        this.logger.error(`${logLabel} empty response. HTTP ${response.status}`);
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(`${logLabel} returned an empty response`, response.status || HttpStatus.BAD_REQUEST);
      }

      let data: unknown;
      try {
        data = JSON.parse(responseText) as unknown;
      } catch {
        this.logger.error(`${logLabel} invalid JSON: ${responseText.substring(0, 200)}`);
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid response from payment partner', HttpStatus.BAD_REQUEST);
      }

      if (!response.ok) {
        const detail = typeof data === 'string' ? data.substring(0, 500) : JSON.stringify(data);
        if (response.status >= 500) {
          this.logger.error(`${logLabel}: upstream HTTP ${response.status} ${detail}`);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        const msg =
          this.isRecord(data) && ('errorMessage' in data || 'errorMessages' in data)
            ? this.debitWalletErrorMessage(data)
            : this.isRecord(data) && typeof data.message === 'string'
              ? data.message
              : this.isRecord(data) && typeof data.error === 'string'
                ? data.error
                : `${logLabel} request failed`;
        throw new HttpException(msg, response.status || HttpStatus.BAD_REQUEST);
      }

      if (this.isRecord(data) && data.hasError === true) {
        const msg = this.debitWalletErrorMessage(data);
        this.logger.error(`${logLabel} hasError: ${JSON.stringify(data)}`);
        throw new BadRequestException(msg);
      }

      if (this.isRecord(data) && 'result' in data) {
        return data.result as T;
      }

      this.logger.warn(`${logLabel}: response missing result envelope, returning parsed body`);
      return data as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`${logLabel} failed: ${(error as Error)?.message ?? String(error)}`);
      throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
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
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(
          'Provider API returned empty response',
          response.status || HttpStatus.BAD_REQUEST,
        );
      }

      // Try to parse JSON
      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        this.logger.error(`Failed to parse JSON response.Response text: ${responseText.substring(0, 200)}`);
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid JSON response from provider API', HttpStatus.BAD_REQUEST);
      }

      this.throwForUpstreamHttpError(response, data, 'Provider API');

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) {
        throw error;
      }
      this.logger.error(`Provider API request failed: ${error.message}`);
      this.logger.error(`Stack trace: ${error.stack}`);
      throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
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
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('KYC API returned empty response', response.status || HttpStatus.BAD_REQUEST);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.error(`Invalid JSON from KYC API: ${responseText.substring(0, 200)}`);
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid JSON response from KYC API', HttpStatus.BAD_REQUEST);
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
        if (response.status >= 500) {
          this.logger.error(`KYC API HTTP ${response.status}: ${JSON.stringify(data)}`);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(msg, isDuplicate ? HttpStatus.CONFLICT : response.status || HttpStatus.BAD_REQUEST);
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`KYC API request failed: ${error.message}`);
      throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
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

  // ==================== DEBIT-WALLET (payouts: banks, enquiry, transfer) ====================

  /**
   * Get banks available for payouts (debit-wallet Shared API).
   */
  async getBanks(): Promise<Array<{ bankcode: string; bankname: string }>> {
    const rows = await this.makeDebitWalletRequest<Array<{ bankName: string; bankCode: string; bankLogo?: string }>>(
      '/Shared/GetAllBanks',
      'GET',
      { logLabel: 'Debit-wallet GetAllBanks' },
    );
    const list = Array.isArray(rows) ? rows : [];
    const seen = new Set<string>();
    const out: Array<{ bankcode: string; bankname: string }> = [];
    for (const bank of list) {
      const code = bank.bankCode?.trim();
      if (!code || seen.has(code)) {
        continue;
      }
      seen.add(code);
      out.push({ bankcode: code, bankname: bank.bankName || code });
    }
    return out;
  }

  /**
   * Destination account name enquiry (bank code + account number).
   */
  async bankAccountNameEnquiry(
    bankCode: string,
    accountNumber: string,
  ): Promise<{
    destinationBankCode: string;
    accountNumber: string;
    accountName: string;
  }> {
    const bc = encodeURIComponent(bankCode);
    const an = encodeURIComponent(accountNumber);
    const result = await this.makeDebitWalletRequest<{
      bankCode: string;
      accountName: string;
      accountNumber: string;
      currency?: string;
    }>(`/Shared/AccountNameEnquiry/${bc}/${an}`, 'GET', { logLabel: 'Debit-wallet AccountNameEnquiry' });

    return {
      destinationBankCode: result.bankCode,
      accountNumber: result.accountNumber,
      accountName: result.accountName,
    };
  }

  /**
   * Wallet (managed) account name enquiry — e.g. validate source wallet virtual account.
   */
  async walletAccountNameEnquiry(accountNumber: string): Promise<{
    bankCode: string;
    accountName: string;
    accountNumber: string;
    currency?: string;
  }> {
    const enc = encodeURIComponent(accountNumber);
    return this.makeDebitWalletRequest(`/Shared/AccountNameEnquiry/Wallet/${enc}`, 'GET', {
      logLabel: 'Debit-wallet AccountNameEnquiry Wallet',
    });
  }

  /**
   * NIP interbank charge bands + terms (for future fee UI).
   */
  async getNIPCharges(): Promise<{
    chargeFees: Array<{
      id: number;
      chargeFeeName: string;
      transactionType: number;
      charge: number;
      lower: number;
      upper: number;
    }>;
    termsAndConditions?: string;
    termsAndConditionsUrl?: string;
  }> {
    return this.makeDebitWalletRequest('/Shared/GetNIPCharges', 'GET', { logLabel: 'Debit-wallet GetNIPCharges' });
  }

  /**
   * Poll transfer status by client transaction reference (reconciliation / support).
   */
  async confirmClientTransferStatus(clientTransactionReference: string): Promise<{
    title?: string;
    message?: string;
    data?: {
      status?: string;
      message?: string;
      narration?: string;
      transactionReference?: string;
      platformTransactionReference?: string;
      transactionStan?: string;
      orinalTxnTransactionDate?: string;
    };
    request?: number;
  }> {
    const ref = encodeURIComponent(clientTransactionReference);
    return this.makeDebitWalletRequest(`/IntraBankTransfer/ConfirmClientTransferStatus/${ref}`, 'GET', {
      logLabel: 'Debit-wallet ConfirmClientTransferStatus',
    });
  }

  /**
   * Debits source wallet account and credits destination (intra or inter). Callbacks drive final settlement.
   * Returns `result` from the provider envelope (status, platformTransactionReference, etc.).
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
  }): Promise<{
    status?: string;
    message?: string;
    narration?: string;
    transactionReference?: string;
    platformTransactionReference?: string;
    transactionStan?: string;
    orinalTxnTransactionDate?: string;
  }> {
    const absoluteUrl =
      process.env.PROVIDER_DEBIT_WALLET_PROCESS_CLIENT_TRANSFER_URL ||
      this.buildDebitWalletUrl('/Shared/ProcessClientTransfer');

    return this.makeDebitWalletRequest({ absoluteUrl }, 'POST', {
      body: request,
      logLabel: 'Debit-wallet ProcessClientTransfer',
    });
  }
}
