import { Injectable, Logger } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { ProviderService } from '../../provider/provider.service.js';
import type { ProviderAccountDetailsResult } from '../../provider/dto/provider-account-maintenance.dto.js';
import { CacheService } from '../../cache/cache.service.js';
import {
  computeBalanceDiscrepancy,
  formatBalanceAmount,
  isBalanceInSync,
  parseProviderBalanceString,
} from '../utils/provider-balance.util.js';

export type ProviderBalanceSnapshot = {
  walletNumber: string;
  availableBalance: string | null;
  accountType: string | null;
  fetchedAt: string;
  internalAvailableBalance: string;
  internalLedgerBalance: string;
  discrepancy: string | null;
  inSync: boolean | null;
  providerFetchError?: string;
};

type WalletSnapshotInput = {
  id: string;
  availableBalance: Decimal;
  ledgerBalance: Decimal;
  virtualAccountNumber: string | null;
};

const PROVIDER_ACCOUNT_CACHE_TTL_SEC = 120;

@Injectable()
export class WalletReconciliationService {
  private readonly logger = new Logger(WalletReconciliationService.name);

  constructor(
    private readonly providerService: ProviderService,
    private readonly cacheService: CacheService,
  ) {}

  async buildProviderBalanceSnapshot(wallet: WalletSnapshotInput): Promise<ProviderBalanceSnapshot | null> {
    if (!wallet.virtualAccountNumber?.trim()) {
      return null;
    }

    const accountNumber = wallet.virtualAccountNumber.trim();
    const internalAvailable = normalizeInternal(wallet.availableBalance);
    const internalLedger = normalizeInternal(wallet.ledgerBalance);
    const fetchedAt = new Date().toISOString();

    let providerDetails: ProviderAccountDetailsResult | null = null;
    let providerFetchError: string | undefined;

    try {
      providerDetails = await this.fetchProviderAccountDetailsCached(accountNumber);
    } catch (error: unknown) {
      providerFetchError =
        error instanceof Error ? error.message : 'Failed to fetch provider wallet details';
      this.logger.warn(
        `Provider balance snapshot failed: walletId=${wallet.id} account=${accountNumber} error=${providerFetchError}`,
      );
    }

    if (!providerDetails) {
      return {
        walletNumber: accountNumber,
        availableBalance: null,
        accountType: null,
        fetchedAt,
        internalAvailableBalance: formatBalanceAmount(internalAvailable),
        internalLedgerBalance: formatBalanceAmount(internalLedger),
        discrepancy: null,
        inSync: null,
        providerFetchError,
      };
    }

    const providerBalance = parseProviderBalanceString(providerDetails.availableBalance);
    if (!providerBalance) {
      return {
        walletNumber: providerDetails.walletNumber || accountNumber,
        availableBalance: null,
        accountType: providerDetails.accountType ?? null,
        fetchedAt,
        internalAvailableBalance: formatBalanceAmount(internalAvailable),
        internalLedgerBalance: formatBalanceAmount(internalLedger),
        discrepancy: null,
        inSync: null,
        providerFetchError: 'Provider returned an invalid availableBalance',
      };
    }

    const discrepancy = computeBalanceDiscrepancy(internalAvailable, providerBalance);
    const inSync = isBalanceInSync(discrepancy);

    if (!inSync) {
      this.logger.warn(
        `Wallet balance discrepancy: walletId=${wallet.id} account=${accountNumber} internal=${formatBalanceAmount(internalAvailable)} provider=${formatBalanceAmount(providerBalance)} delta=${formatBalanceAmount(discrepancy)}`,
      );
    }

    return {
      walletNumber: providerDetails.walletNumber || accountNumber,
      availableBalance: formatBalanceAmount(providerBalance),
      accountType: providerDetails.accountType ?? null,
      fetchedAt,
      internalAvailableBalance: formatBalanceAmount(internalAvailable),
      internalLedgerBalance: formatBalanceAmount(internalLedger),
      discrepancy: formatBalanceAmount(discrepancy),
      inSync,
    };
  }

  async fetchProviderAccountDetailsFresh(accountNumber: string): Promise<ProviderAccountDetailsResult> {
    const details = await this.providerService.getProviderAccountDetails(accountNumber);
    await this.cacheService.set(this.providerAccountCacheKey(accountNumber), details, PROVIDER_ACCOUNT_CACHE_TTL_SEC);
    return details;
  }

  private async fetchProviderAccountDetailsCached(
    accountNumber: string,
  ): Promise<ProviderAccountDetailsResult> {
    const cacheKey = this.providerAccountCacheKey(accountNumber);
    const cached = await this.cacheService.get<ProviderAccountDetailsResult>(cacheKey);
    if (cached) {
      return cached;
    }
    return this.fetchProviderAccountDetailsFresh(accountNumber);
  }

  private providerAccountCacheKey(accountNumber: string): string {
    return `provider:acct:${accountNumber}`;
  }
}

function normalizeInternal(amount: Decimal): Decimal {
  return new Decimal(amount.toFixed(2));
}
