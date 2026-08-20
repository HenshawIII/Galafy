import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';
import type {
  AlatTier1Request,
  AlatTier1Response,
  AlatCountryModel,
  AlatCountryItem,
  AlatStateItem,
  AlatLgaItem,
  AlatCityItem,
  AlatGetDropDownListResponse,
  AlatPartnershipAccountDetails,
  AlatGetPartnershipAccountDetailsResponse,
} from './dto/provider-alat.dto.js';
import type {
  AlatPartnerAccountUpgradeTier2Request,
  AlatPartnerAccountUpgradeTier3Request,
  AlatPartnerAccountUpgradeResponse,
  AlatPartnerAccountKycStatusResponse,
} from './dto/provider-account-upgrade.dto.js';
import type {
  ProviderAccountDetailsResult,
  ProviderTransactionHistoryItem,
} from './dto/provider-account-maintenance.dto.js';
import { config } from 'dotenv';
config();

/** APIM host only (no path). KYC and debit-wallet paths are appended unless full URLs are set via env. */
const DEFAULT_APIM_GATEWAY = 'https://lagos-alat-blueapi.azure-api.net';

@Injectable()
export class ProviderService {
  private readonly logger = new Logger(ProviderService.name);
  private readonly apiKey: string;
  private readonly kycBaseUrl: string;
  private readonly debitWalletBaseUrl: string;
  private readonly accountUpgradeBaseUrl: string;
  private readonly accountMaintenanceBaseUrl: string;
  private readonly kycSubscriptionKey: string;
  /** Cache for Alat GetDropDownList (countryModel). TTL 1 hour. */
  private dropdownCache: { data: AlatCountryModel; expiresAt: number } | null = null;
  private static readonly DROPDOWN_CACHE_TTL_MS = 60 * 60 * 1000;

  /** Returned to API clients when the upstream partner returns 5xx or is unreachable (do not echo partner 500 as our 500). */
  static readonly CLIENT_PARTNER_UNAVAILABLE_MESSAGE =
    'Our partner service is temporarily unavailable. Please try again in a few minutes.';

  static readonly CLIENT_KYC_UNAVAILABLE_MESSAGE =
    "We couldn't complete your verification right now. Please try again shortly.";

  private static readonly KYC_FETCH_TIMEOUT_MS = 25_000;

  private truncateForLog(value: string, max = 500): string {
    if (!value) return '';
    return value.length > max ? `${value.substring(0, max)}...` : value;
  }

  private mask(value: unknown, visibleTail = 4): string {
    const str =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value).trim()
          : '';
    if (!str) return 'n/a';
    if (str.length <= visibleTail) return '*'.repeat(str.length);
    return `${'*'.repeat(str.length - visibleTail)}${str.slice(-visibleTail)}`;
  }

  private logUpstream5xx(label: string, response: Response, responseBody?: string): void {
    const body = responseBody?.trim() ? this.truncateForLog(responseBody) : '[empty body]';
    this.logger.error(
      `${label}: upstream HTTP ${response.status} ${response.statusText || ''}. Provider response: ${body}`.trim(),
    );
  }

  constructor() {
    this.apiKey = process.env.PROVIDER_API_KEY || '';
    const kycEnv = process.env.PROVIDER_KYC_BASE_URL?.replace(/\/$/, '');
    const kycPathSuffix = '/create-account-face/api';
    const hostOnly = (value: string): string => value.replace(/\/+$/, '');
    const normalizeKycBaseUrl = (value?: string): string => {
      if (!value) {
        return `${DEFAULT_APIM_GATEWAY}${kycPathSuffix}`;
      }
      const cleaned = hostOnly(value);
      return cleaned.toLowerCase().endsWith(kycPathSuffix) ? cleaned : `${cleaned}${kycPathSuffix}`;
    };
    const kycBaseUrl = normalizeKycBaseUrl(kycEnv);
    const gateway = kycBaseUrl.slice(0, -kycPathSuffix.length);

    this.kycBaseUrl = kycBaseUrl;
    this.debitWalletBaseUrl = `${gateway}/debit-wallet/api`;
    const accountUpgradePathSuffix = '/account-upgrade/api';
    const accountUpgradeEnv = process.env.PROVIDER_ACCOUNT_UPGRADE_BASE_URL?.replace(/\/$/, '');
    this.accountUpgradeBaseUrl = accountUpgradeEnv
      ? accountUpgradeEnv.toLowerCase().endsWith(accountUpgradePathSuffix)
        ? accountUpgradeEnv
        : `${hostOnly(accountUpgradeEnv)}${accountUpgradePathSuffix}`
      : `${gateway}${accountUpgradePathSuffix}`;

    const accountMaintenancePathSuffix = '/ws-acct-mgt/api';
    const accountMaintenanceEnv = process.env.PROVIDER_ACCOUNT_MAINTENANCE_BASE_URL?.replace(/\/$/, '');
    this.accountMaintenanceBaseUrl = accountMaintenanceEnv
      ? accountMaintenanceEnv.toLowerCase().endsWith(accountMaintenancePathSuffix)
        ? accountMaintenanceEnv
        : `${hostOnly(accountMaintenanceEnv)}${accountMaintenancePathSuffix}`
      : `${gateway}${accountMaintenancePathSuffix}`;

    this.kycSubscriptionKey = process.env.PROVIDER_KYC_SUBSCRIPTION_KEY || '';

    if (!this.apiKey) {
      this.logger.warn('PROVIDER_API_KEY is not set. ALAT KYC and webhook verification may not work.');
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

  private buildDebitWalletUrl(path: string): string {
    const base = this.debitWalletBaseUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private buildAccountUpgradeUrl(path: string): string {
    const base = this.accountUpgradeBaseUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private buildAccountMaintenanceUrl(path: string): string {
    const base = this.accountMaintenanceBaseUrl.replace(/\/$/, '');
    const p = path.startsWith('/') ? path : `/${path}`;
    return `${base}${p}`;
  }

  private accountMaintenanceErrorMessage(parsed: unknown): string {
    if (typeof parsed !== 'object' || parsed === null) {
      return 'Account maintenance request failed';
    }
    const o = parsed as { message?: string };
    if (typeof o.message === 'string' && o.message.trim()) {
      return o.message;
    }
    return 'Account maintenance request failed';
  }

  private accountUpgradeErrorMessage(parsed: unknown): string {
    if (typeof parsed !== 'object' || parsed === null) {
      return 'Account-upgrade request failed';
    }
    const o = parsed as { message?: string; errors?: string[] | null };
    if (typeof o.message === 'string' && o.message.trim()) {
      return o.message;
    }
    const first = o.errors?.find((m) => typeof m === 'string' && m.trim());
    return first || 'Account-upgrade request failed';
  }

  private getDebitWalletAccessKey(): string {
    return process.env.PROVIDER_DEBIT_WALLET_ACCESS_KEY || this.apiKey;
  }

  private getDebitWalletApimKey(): string {
    return process.env.PROVIDER_DEBIT_WALLET_APIM_KEY || this.kycSubscriptionKey;
  }

  /**
   * Debit-wallet sends partner access in the `access` header.
   */
  private assertDebitWalletCredentials(logLabel: string): void {
    const access = this.getDebitWalletAccessKey().trim();
    const apim = this.getDebitWalletApimKey().trim();
    const missing: string[] = [];
    if (!access) {
      missing.push('PROVIDER_DEBIT_WALLET_ACCESS_KEY or PROVIDER_API_KEY');
    }
    if (!apim) {
      missing.push('PROVIDER_DEBIT_WALLET_APIM_KEY or PROVIDER_KYC_SUBSCRIPTION_KEY');
    }
    if (missing.length > 0) {
      throw new HttpException(
        `${logLabel}: provider credentials are not configured (${missing.join('; ')}). Set these on the server and redeploy.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
  }

  /** ws-acct-mgt uses `x-api-key` + `Ocp-Apim-Subscription-Key` (same as KYC / account-upgrade). */
  private assertAccountMaintenanceCredentials(logLabel: string): void {
    const apiKey = this.apiKey.trim();
    const apim = this.kycSubscriptionKey.trim();
    const missing: string[] = [];
    if (!apiKey) {
      missing.push('PROVIDER_API_KEY');
    }
    if (!apim) {
      missing.push('PROVIDER_KYC_SUBSCRIPTION_KEY');
    }
    if (missing.length > 0) {
      throw new HttpException(
        `${logLabel}: provider credentials are not configured (${missing.join('; ')}). Set these on the server and redeploy.`,
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
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
    this.assertDebitWalletCredentials(logLabel);
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
        this.logger.error(`${logLabel} empty response. HTTP ${response.status} ${response.statusText || ''}`.trim());
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(`${logLabel} returned an empty response`, response.status || HttpStatus.BAD_REQUEST);
      }

      let data: unknown;
      try {
        data = JSON.parse(responseText) as unknown;
      } catch {
        this.logger.error(
          `${logLabel} invalid JSON. HTTP ${response.status} ${response.statusText || ''}. Body: ${this.truncateForLog(responseText)}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid response from payment partner', HttpStatus.BAD_REQUEST);
      }

      if (!response.ok) {
        const detail =
          typeof data === 'string'
            ? this.truncateForLog(data, 4000)
            : this.truncateForLog(JSON.stringify(data), 4000);
        this.logger.error(
          `${logLabel}: upstream HTTP ${response.status} ${response.statusText || ''}. Provider response body: ${detail}`.trim(),
        );
        if (response.status >= 500) {
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
   * ALAT ws-acct-mgt API: `x-api-key` + `Ocp-Apim-Subscription-Key`, envelope with `successful` / `result`.
   */
  private async makeAccountMaintenanceRequest<T>(
    pathOrOptions: string | { absoluteUrl: string },
    method: 'GET' | 'POST',
    options?: {
      body?: unknown;
      contentType?: string;
      logLabel?: string;
    },
  ): Promise<T> {
    const url =
      typeof pathOrOptions === 'string' ? this.buildAccountMaintenanceUrl(pathOrOptions) : pathOrOptions.absoluteUrl;
    const logLabel = options?.logLabel ?? 'Account-maintenance API';
    this.assertAccountMaintenanceCredentials(logLabel);
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': this.kycSubscriptionKey,
    };
    if (method === 'POST') {
      headers['Content-Type'] = options?.contentType ?? 'application/json';
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
        this.logger.error(`${logLabel} empty response. HTTP ${response.status} ${response.statusText || ''}`.trim());
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(`${logLabel} returned an empty response`, response.status || HttpStatus.BAD_REQUEST);
      }

      let data: unknown;
      try {
        data = JSON.parse(responseText) as unknown;
      } catch {
        this.logger.error(
          `${logLabel} invalid JSON. HTTP ${response.status} ${response.statusText || ''}. Body: ${this.truncateForLog(responseText)}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid response from payment partner', HttpStatus.BAD_REQUEST);
      }

      if (!response.ok) {
        const detail =
          typeof data === 'string'
            ? this.truncateForLog(data, 4000)
            : this.truncateForLog(JSON.stringify(data), 4000);
        this.logger.error(
          `${logLabel}: upstream HTTP ${response.status} ${response.statusText || ''}. Provider response body: ${detail}`.trim(),
        );
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_PARTNER_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(this.accountMaintenanceErrorMessage(data), response.status || HttpStatus.BAD_REQUEST);
      }

      if (this.isRecord(data) && data.successful === false) {
        const msg = this.accountMaintenanceErrorMessage(data);
        this.logger.error(`${logLabel} unsuccessful: ${JSON.stringify(data)}`);
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
        signal: AbortSignal.timeout(ProviderService.KYC_FETCH_TIMEOUT_MS),
      });

      const responseText = await response.text();
      if (!responseText || responseText.trim().length === 0) {
        this.logger.error(
          `KYC API returned empty response. Status: ${response.status} ${response.statusText || ''}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx('KYC API', response, responseText);
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('KYC API returned empty response', response.status || HttpStatus.BAD_REQUEST);
      }

      let data: any;
      try {
        data = JSON.parse(responseText);
      } catch {
        this.logger.error(
          `Invalid JSON from KYC API. HTTP ${response.status} ${response.statusText || ''}. Body: ${this.truncateForLog(responseText)}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx('KYC API', response, responseText);
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
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
          this.logger.error(
            `KYC API HTTP ${response.status} ${response.statusText || ''}. Provider error: ${this.truncateForLog(JSON.stringify(data))}`.trim(),
          );
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(msg, isDuplicate ? HttpStatus.CONFLICT : response.status || HttpStatus.BAD_REQUEST);
      }

      return data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`KYC API request failed: ${(error as Error).message}`);
      throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  /**
   * ALAT account-upgrade API (partnership tier 2/3 upgrade + KYC status).
   */
  private async makeAccountUpgradeRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST',
    options?: { body?: unknown; logLabel?: string; maskAccountNumber?: string },
  ): Promise<T> {
    const url = endpoint.startsWith('http') ? endpoint : this.buildAccountUpgradeUrl(endpoint);
    const logLabel = options?.logLabel ?? 'Account-upgrade API';
    const maskedAcct = options?.maskAccountNumber ? this.mask(options.maskAccountNumber) : 'n/a';
    const headers: Record<string, string> = {
      'x-api-key': this.apiKey,
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Ocp-Apim-Subscription-Key': this.kycSubscriptionKey,
    };

    try {
      this.logger.log(`Account-upgrade ${method} ${logLabel}: accountNumber=${maskedAcct}`);
      const response = await fetch(url, {
        method,
        headers,
        body: method === 'POST' && options?.body !== undefined ? JSON.stringify(options.body) : undefined,
        signal: AbortSignal.timeout(ProviderService.KYC_FETCH_TIMEOUT_MS),
      });

      const responseText = await response.text();
      if (!responseText?.trim()) {
        this.logger.error(
          `${logLabel}: empty response. HTTP ${response.status} ${response.statusText || ''} accountNumber=${maskedAcct}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException(`${logLabel} returned an empty response`, response.status || HttpStatus.BAD_REQUEST);
      }

      let data: unknown;
      try {
        data = JSON.parse(responseText) as unknown;
      } catch {
        this.logger.error(
          `${logLabel}: invalid JSON. HTTP ${response.status}. Body: ${this.truncateForLog(responseText)}`.trim(),
        );
        if (response.status >= 500) {
          this.logUpstream5xx(logLabel, response, responseText);
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        throw new HttpException('Invalid response from account-upgrade partner', HttpStatus.BAD_REQUEST);
      }

      const envelope = this.isRecord(data) ? data : {};
      const success =
        envelope.status === true || envelope.statusCode === 100 || envelope.statusCode === 200;

      if (!response.ok || !success) {
        const detail = this.truncateForLog(JSON.stringify(data), 4000);
        this.logger.error(
          `${logLabel}: failed HTTP ${response.status} accountNumber=${maskedAcct}. Provider response: ${detail}`.trim(),
        );
        if (response.status >= 500) {
          throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
        }
        const msg = this.accountUpgradeErrorMessage(data);
        const isDuplicate =
          typeof msg === 'string' &&
          (msg.toLowerCase().includes('already exist') || msg.toLowerCase().includes('already exists'));
        throw new HttpException(msg, isDuplicate ? HttpStatus.CONFLICT : response.status || HttpStatus.BAD_REQUEST);
      }

      const successDetail = this.truncateForLog(JSON.stringify(data), 4000);
      this.logger.log(
        `${logLabel}: success HTTP ${response.status} accountNumber=${maskedAcct}. Provider response: ${successDetail}`.trim(),
      );
      return data as T;
    } catch (error) {
      if (error instanceof HttpException) throw error;
      this.logger.error(`${logLabel}: request failed accountNumber=${maskedAcct}: ${(error as Error)?.message}`);
      throw new HttpException(ProviderService.CLIENT_KYC_UNAVAILABLE_MESSAGE, HttpStatus.SERVICE_UNAVAILABLE);
    }
  }

  async partnerAccountUpgradeTier2(
    body: AlatPartnerAccountUpgradeTier2Request,
  ): Promise<AlatPartnerAccountUpgradeResponse> {
    const payload: Record<string, string> = {
      accountNumber: body.accountNumber,
      nin: body.nin,
      liveImageOfFace: body.liveImageOfFace,
    };
    if (body.bvn?.trim()) {
      payload.bvn = body.bvn.trim();
    }
    return this.makeAccountUpgradeRequest<AlatPartnerAccountUpgradeResponse>(
      '/partnership/partner-account-upgrade-tier2',
      'POST',
      {
        body: payload,
        logLabel: 'partner-account-upgrade-tier2',
        maskAccountNumber: body.accountNumber,
      },
    );
  }

  async partnerAccountUpgradeTier3(
    body: AlatPartnerAccountUpgradeTier3Request,
  ): Promise<AlatPartnerAccountUpgradeResponse> {
    return this.makeAccountUpgradeRequest<AlatPartnerAccountUpgradeResponse>(
      '/partnership/partner-account-upgrade-tier3',
      'POST',
      {
        body,
        logLabel: 'partner-account-upgrade-tier3',
        maskAccountNumber: body.accountNumber,
      },
    );
  }

  async getPartnerAccountKycStatus(accountNumber: string): Promise<AlatPartnerAccountKycStatusResponse> {
    const ref = encodeURIComponent(accountNumber);
    return this.makeAccountUpgradeRequest<AlatPartnerAccountKycStatusResponse>(
      `/partnership/partner-account-kyc-status?accountNumber=${ref}`,
      'GET',
      {
        logLabel: 'partner-account-kyc-status',
        maskAccountNumber: accountNumber,
      },
    );
  }

  // ==================== ALAT KYC (create-account-face) ====================

  /**
   * Tier 1: Generate customer with BVN (no OTP). Face verification completes via callback.
   */
  async tier1BvnWithoutOtpV2(body: AlatTier1Request): Promise<AlatTier1Response> {
    return this.makeKycRequest<AlatTier1Response>('/partnership/tier1-bvn-withoutOtp-v2', 'POST', body);
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
    this.logger.log(
      `Provider debit-wallet account enquiry: destinationBankCode=${bankCode} destinationAccount=${this.mask(accountNumber)}`,
    );
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
    this.logger.log(`Provider debit-wallet wallet enquiry: account=${this.mask(accountNumber)}`);
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
    this.logger.log(`Provider debit-wallet transfer status check: txRef=${this.mask(clientTransactionReference)}`);
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
    this.logger.log(
      `Provider debit-wallet transfer request: txRef=${this.mask(request.transactionReference)} sourceAccount=${this.mask(request.sourceAccountNumber)} destinationAccount=${this.mask(request.destinationAccountNumber)} amount=${request.amount}`,
    );
    const absoluteUrl =
      process.env.PROVIDER_DEBIT_WALLET_PROCESS_CLIENT_TRANSFER_URL ||
      this.buildDebitWalletUrl('/Shared/ProcessClientTransfer');

    return this.makeDebitWalletRequest({ absoluteUrl }, 'POST', {
      body: request,
      logLabel: 'Debit-wallet ProcessClientTransfer',
    });
  }

  /**
   * Provider wallet account details (GetAccountV2) for admin reconciliation.
   */
  async getProviderAccountDetails(accountNumber: string): Promise<ProviderAccountDetailsResult> {
    this.logger.log(`Provider account maintenance wallet details: account=${this.mask(accountNumber)}`);
    const enc = encodeURIComponent(accountNumber);
    return this.makeAccountMaintenanceRequest<ProviderAccountDetailsResult>(
      `/AccountMaintenance/CustomerAccount/GetAccountV2/accountNumber/${enc}`,
      'GET',
      { logLabel: 'Account-maintenance GetAccountV2' },
    );
  }

  /**
   * Provider wallet transaction history (transhistoryV2) for admin reconciliation.
   */
  async getProviderTransactionHistory(params: {
    accountNumber: string;
    from: string;
    to: string;
    keyWord?: string;
  }): Promise<ProviderTransactionHistoryItem[]> {
    this.logger.log(
      `Provider account maintenance transaction history: account=${this.mask(params.accountNumber)} from=${params.from} to=${params.to}`,
    );
    const result = await this.makeAccountMaintenanceRequest<ProviderTransactionHistoryItem[]>(
      '/AccountMaintenance/CustomerAccount/transhistoryV2',
      'POST',
      {
        body: {
          accountNumber: params.accountNumber,
          from: params.from,
          to: params.to,
          keyWord: params.keyWord ?? '',
        },
        logLabel: 'Account-maintenance transhistoryV2',
      },
    );
    return Array.isArray(result) ? result : [];
  }
}
