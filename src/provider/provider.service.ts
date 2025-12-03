import { Injectable, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  ProviderCreateCustomerRequestDto,
  ProviderUpdateCustomerNameRequestDto,
  ProviderUpdateCustomerContactsRequestDto,
  ProviderCustomerResponseDto,
  ProviderCustomerKycStatusResponseDto,
} from './dto/provider-customer.dto.js';
import {
  ProviderCreateWalletRequestDto,
  ProviderWalletToWalletTransferRequestDto,
  ProviderWalletResponseDto,
  ProviderWalletHistoryResponseDto,
} from './dto/provider-wallet.dto.js';
import {
  ProviderNinVerificationRequestDto,
  ProviderBvnVerificationRequestDto,
  ProviderAddressVerificationRequestDto,
  ProviderNinVerificationResponseDto,
  ProviderBvnVerificationResponseDto,
  ProviderAddressVerificationResponseDto,
} from './dto/provider-kyc.dto.js';
import { config } from 'dotenv';
config();

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);
  private readonly baseUrl: string;
  private readonly payoutBaseUrl: string;
  private readonly apiKey: string;
  private readonly organizationId: string;

  constructor() {
    this.baseUrl = process.env.PROVIDER_BASE_URL || '';
    this.payoutBaseUrl = process.env.PROVIDER_PAYOUT_BASE_URL || '';
    this.apiKey = process.env.PROVIDER_API_KEY || '';
    this.organizationId = process.env.PROVIDER_ORGANIZATION_ID || '';

    if (!this.baseUrl || !this.apiKey || !this.organizationId) {
      this.logger.warn('Provider configuration is incomplete. Some features may not work.');
    }

    if (!this.payoutBaseUrl) {
      this.logger.warn('Payout base URL is not configured. Payout-related features (banks, transfers, etc.) may not work.');
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
        throw new HttpException(
          'Invalid JSON response from provider API',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
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
        throw new HttpException(
          'Invalid JSON response from payout API',
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
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

  // ==================== CUSTOMER OPERATIONS ====================

  /**
   * Create a new customer in the provider system
   */
  async createCustomer(
    requestDto: ProviderCreateCustomerRequestDto,
  ): Promise<{ customerId: string }> {
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
      throw new HttpException(
        response.message || 'Failed to create customer',
        HttpStatus.BAD_REQUEST,
      );
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

    const response = await this.makeRequest<ProviderNinVerificationResponseDto>(
      endpoint,
      'POST',
      body,
    );

    return response;
  }

  /**
   * Upgrade customer KYC with BVN (Tier 2)
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
   */
  async verifyCustomerAddress(
    requestDto: ProviderAddressVerificationRequestDto,
  ): Promise<ProviderAddressVerificationResponseDto> {
    const body = {
      customerId: requestDto.customerId,
      houseAddress: requestDto.houseAddress,
      meterNumber: requestDto.meterNumber,
    };

    const response = await this.makeRequest<ProviderAddressVerificationResponseDto>(
      '/api/v1/customers/kyc/address-verification',
      'POST',
      body,
    );

    return response;
  }

  // ==================== UTILITY OPERATIONS ====================

  /**
   * Get all countries
   */
  async getCountries(): Promise<Array<{ id: string; name: string; countryCodeTwo: string; countryCodeThree: string }>> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: Array<{ id: string; name: string; countryCodeTwo: string; countryCodeThree: string }>;
    }>('/api/v1/utilities/countries/get', 'GET');

    return response.data || [];
  }

  /**
   * Get all customer types
   */
  async getCustomerTypes(): Promise<Array<{ id: string; name: string }>> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: Array<{ id: string; name: string }>;
    }>('/api/v1/customers/types/all', 'GET');

    return response.data || [];
  }

  // ==================== WALLET OPERATIONS ====================

  /**
   * Create a new wallet
   */
  async createWallet(requestDto: ProviderCreateWalletRequestDto): Promise<ProviderWalletResponseDto> {
    const body = {
      ...requestDto,
      customerId: requestDto.customerId, // This should be the provider customer ID
    };

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: {
        id: string;
        walletGroupId: string | null;
        customerId: string;
        availableBalance: number;
        ledgerBalance: number;
        walletRestrictionId: string | null;
        walletClassificationId: string;
        currencyId: string;
        isInternal: boolean;
        isDefault: boolean;
        name: string;
        overdraft: number | null;
        virtualAccount: {
          accountNumber: string;
          bankCode: string;
          bankName: string;
        };
        mobNum: string | null;
        customerTypeId: string;
      };
    }>('/api/v1/wallets/add', 'POST', body);

    // console.log('Wallet creation response:', response);

    return {
      walletId: response.data.id,
      virtualAccount: response.data.virtualAccount,
      mobNum: response.data.mobNum || undefined,
      walletClassificationId: response.data.walletClassificationId,
    };
  }

  /**
   * Get wallet by account number
   */
  async getWalletByAccountNumber(accountNumber: string): Promise<{
    accountNumber: string;
    walletId: string;
    availableBalance: number;
    ledgerBalance: number;
    currency: string;
    status: string;
  }> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: {
        accountNumber: string;
        walletId: string;
        availableBalance: number;
        ledgerBalance: number;
        currency: string;
        status: string;
      };
    }>(`/api/v1/wallets/get/wallet/account/${accountNumber}`, 'GET');

    return response.data;
  }

  /**
   * Wallet to wallet transfer
   */
  async walletToWalletTransfer(
    requestDto: ProviderWalletToWalletTransferRequestDto,
  ): Promise<{ success: boolean; message: string; data?: any }> {
    const body = {
      fromAccount: requestDto.fromWalletId,
      toAccount: requestDto.toWalletId,
      amount: requestDto.amount,
      transactionReference: requestDto.reference || `TXN-${randomUUID()}`,
      remarks: requestDto.description || '',
      transactionTypeId: 1, // Default transaction type, adjust as needed
    };

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data?: any;
    }>('/api/v1/wallets/wallet/transaction/v2/wallet-to-wallet', 'PUT', body);

    // console.log('Wallet to wallet transfer response:', response);

    return {
      success: response.success || response.code === '200',
      message: response.message,
      data: response.data,
    };
  }

  /**
   * Get wallet transaction history
   */
  async getWalletHistory(walletId?: string, page?: number, pageSize?: number): Promise<ProviderWalletHistoryResponseDto> {
    const queryParams = new URLSearchParams();
    if (walletId) queryParams.append('walletId', walletId);
    if (page) queryParams.append('page', page.toString());
    if (pageSize) queryParams.append('pageSize', pageSize.toString());

    const queryString = queryParams.toString();
    const endpoint = `/api/v1/wallets/history${queryString ? `?${queryString}` : ''}`;

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: {
        walletHistories: Array<{
          id: string;
          walletId: string;
          productId: string;
          remarks: string;
          amount: number;
          debitCreditIndicator: string;
          balance: number;
          transactionReference: string;
          transactionId: string;
          isActive: boolean;
          dateCreated: string;
          mobileNumber: string;
          accountNumber: string;
          name: string | null;
        }>;
        totalCount: number;
        totalPages: number;
        currentPage: number;
        pageSize: number;
      };
    }>(endpoint, 'GET');

    return {
      transactions: response.data.walletHistories.map((tx) => ({
        id: tx.id,
        type: tx.debitCreditIndicator,
        amount: tx.amount,
        balance: tx.balance,
        description: tx.remarks,
        reference: tx.transactionReference,
        timestamp: tx.dateCreated,
      })),
      total: response.data.totalCount,
      page: response.data.currentPage,
      limit: response.data.pageSize,
    };
  }

  /**
   * Get wallet by ID
   */
  async getWalletById(walletId: string): Promise<{
    id: string;
    walletGroupId: string;
    customerId: string;
    availableBalance: number;
    ledgerBalance: number;
    walletRestrictionId: string | null;
    walletClassificationId: string;
    currencyId: string;
    isInternal: boolean;
    isDefault: boolean;
    name: string;
    overdraft: number | null;
    virtualAccount: {
      accountNumber: string;
      bankCode: string;
      bankName: string;
    };
    mobNum: string | null;
    customerTypeId: string;
  }> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: {
        id: string;
        walletGroupId: string;
        customerId: string;
        availableBalance: number;
        ledgerBalance: number;
        walletRestrictionId: string | null;
        walletClassificationId: string;
        currencyId: string;
        isInternal: boolean;
        isDefault: boolean;
        name: string;
        overdraft: number | null;
        virtualAccount: {
          accountNumber: string;
          bankCode: string;
          bankName: string;
        };
        mobNum: string | null;
        customerTypeId: string;
      };
    }>(`/api/v1/wallets/get/wallet/${walletId}`, 'GET');

    return response.data;
  }

  /**
   * Get organization wallet transactions
   */
  async getOrganizationWalletTransactions(page?: number, pageSize?: number): Promise<{
    walletHistories: Array<{
      id: string;
      walletId: string;
      productId: string;
      remarks: string;
      amount: number;
      debitCreditIndicator: string;
      balance: number;
      transactionReference: string;
      transactionId: string;
      isActive: boolean;
      dateCreated: string;
      mobileNumber: string;
      accountNumber: string;
      name: string;
    }>;
    totalCount: number;
    totalPages: number;
    currentPage: number;
    pageSize: number;
  }> {
    const queryParams = new URLSearchParams();
    if (page) queryParams.append('page', page.toString());
    if (pageSize) queryParams.append('pageSize', pageSize.toString());

    const queryString = queryParams.toString();
    const endpoint = `/api/v1/wallets/history/organization/transactions${queryString ? `?${queryString}` : ''}`;

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data: {
        walletHistories: Array<{
          id: string;
          walletId: string;
          productId: string;
          remarks: string;
          amount: number;
          debitCreditIndicator: string;
          balance: number;
          transactionReference: string;
          transactionId: string;
          isActive: boolean;
          dateCreated: string;
          mobileNumber: string;
          accountNumber: string;
          name: string;
        }>;
        totalCount: number;
        totalPages: number;
        currentPage: number;
        pageSize: number;
      };
    }>(endpoint, 'GET');

    return response.data;
  }

  /**
   * Wallet to wallet requery
   */
  async walletToWalletRequery(transactionReference: string): Promise<{
    code: string;
    success: boolean;
    message: string;
    data?: any;
  }> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data?: any;
    }>(`/api/v1/wallets/wallet/transaction/wallet-to-wallet/status/${transactionReference}`, 'GET');

    return response;
  }

  /**
   * Reverse transaction
   */
  async reverseTransaction(transactionReference: string): Promise<{
    code: string;
    success: boolean;
    message: string;
    data?: any;
  }> {
    const body = {
      transactionReference,
      organizationId: this.organizationId,
    };

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data?: any;
    }>('/api/v1/wallets/wallet/transaction/reverse', 'PUT', body);

    return response;
  }

  /**
   * Close wallet
   */
  async closeWallet(
    accountNumber: string,
    accountClosureReasonId: number,
    tellerId: number,
    closeOrDelete: boolean,
    customerOrAccount: boolean,
  ): Promise<{
    code: string;
    success: boolean;
    message: string;
    data?: any;
  }> {
    const body = {
      accountNumber,
      accountClosureReasonId,
      tellerId,
      closeOrDelete,
      customerOrAccount,
    };

    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data?: any;
    }>('/api/v1/wallets/close', 'POST', body);

    return response;
  }

  /**
   * Restrict wallet by account ID
   */
  async restrictByAccountId(accountId: string, restrictionType: string): Promise<{
    code: string;
    success: boolean;
    message: string;
    data?: any;
  }> {
    const response = await this.makeRequest<{
      code: string;
      success: boolean;
      message: string;
      data?: any;
    }>(`/api/v1/wallets/wallet/restrict/account/${accountId}/type/${restrictionType}`, 'PATCH');

    return response;
  }

  // ==================== PAYOUT OPERATIONS ====================

  /**
   * Get banks available for payouts
   */
  async getBanks(): Promise<Array<{ code: string; name: string }>> {
    const response = await this.makePayoutRequest<{
      data: Array<{ code: string; name: string }>;
      statusCode: number;
      message: string;
      succeeded: boolean;
    }>('/api/Payout/banks', 'GET');

    return response.data || [];
  }

  /**
   * Bank account name enquiry
   */
  async bankAccountNameEnquiry(bankCode: string, accountNumber: string): Promise<{
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
        status: string;
        data: {
          destinationBankCode: string;
          accountNumber: string;
          accountName: string;
        };
        code: string | null;
        message: string | null;
      };
      statusCode: number;
      message: string;
      succeeded: boolean;
    }>('/api/Payout/name-enquiry', 'POST', body);

    if (!response.succeeded || response.data.status !== 'success') {
      throw new HttpException(
        response.data.message || response.message || 'Name enquiry failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    return response.data.data;
  }

  /**
   * Inter bank transfer (payout)
   */
  async interBankTransfer(request: {
    destinationBankCode: string;
    destinationAccountNumber: string;
    destinationAccountName: string;
    sourceAccountNumber: string;
    sourceAccountName: string;
    remarks: string;
    amount: number;
    currencyId: string;
    customerTransactionReference: string;
    webhookUrl?: string;
  }): Promise<{
    transactionRef: string;
    message: string;
  }> {
    const response = await this.makePayoutRequest<{
      data: string; // transactionRef
      statusCode: number;
      message: string;
      succeeded: boolean;
    }>('/api/Payout/inter-bank-transfer', 'POST', request);

    if (!response.succeeded) {
      throw new HttpException(
        response.message || 'Inter bank transfer failed',
        HttpStatus.BAD_REQUEST,
      );
    }

    return {
      transactionRef: response.data,
      message: response.message,
    };
  }

  /**
   * Transaction status re-query
   */
  async transactionStatusRequery(transactionRef: string): Promise<{
    status: string;
    data?: any;
    message: string;
  }> {
    const response = await this.makePayoutRequest<{
      data: {
        status: string;
        data?: any;
      };
      statusCode: number;
      message: string;
      succeeded: boolean;
    }>(`/api/Payout/status/${transactionRef}`, 'GET');

    return {
      status: response.data?.status || 'unknown',
      data: response.data?.data,
      message: response.message,
    };
  }
}
