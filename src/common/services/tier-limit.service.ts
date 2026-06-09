import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { DatabaseService } from '../../database/database.service.js';
import { CacheService } from '../../cache/cache.service.js';
import { AccountRestrictionNotifyService } from '../account-restriction/account-restriction-notify.service.js';
import { getCurrentWATAsUTC } from '../utils/timezone.util.js';
import { formatLimitAmount, getTierLimits, isUnlimitedTier } from '../utils/tier-transaction-limits.util.js';
import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';

export type AccountLimitsSnapshot = {
  tier: KycTier;
  tier3UpgradeStatus: Tier3UpgradeStatus | null;
  maxCumulativeBalance: string | null;
  currentBalance: string;
  cumulativeBalanceRemaining: string | null;
  isBalanceRestricted: boolean;
  balanceRestrictionReason: string | null;
  dailySpendLimit: string | null;
  dailySpendUsed: string;
  dailySpendRemaining: string | null;
  singleInflowLimit: string | null;
};

type CustomerLimitRow = {
  id: string;
  tier: KycTier;
  tier3UpgradeStatus: Tier3UpgradeStatus | null;
  isBalanceRestricted: boolean;
  balanceRestrictionReason: string | null;
  isAmlRestricted: boolean;
};

@Injectable()
export class TierLimitService {
  private readonly logger = new Logger(TierLimitService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly cacheService: CacheService,
    private readonly accountRestrictionNotify: AccountRestrictionNotifyService,
  ) {}

  async getCustomerForLimits(customerId: string): Promise<CustomerLimitRow> {
    const customer = await this.databaseService.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        tier: true,
        tier3UpgradeStatus: true,
        isBalanceRestricted: true,
        balanceRestrictionReason: true,
        isAmlRestricted: true,
      },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }
    return customer;
  }

  async getPrimaryWalletBalance(customerId: string): Promise<Decimal> {
    const wallet = await this.databaseService.wallet.findFirst({
      where: { customerId, isDefault: true },
      select: { availableBalance: true },
    });
    if (wallet) {
      return wallet.availableBalance;
    }
    const anyWallet = await this.databaseService.wallet.findFirst({
      where: { customerId },
      orderBy: { createdAt: 'asc' },
      select: { availableBalance: true },
    });
    return anyWallet?.availableBalance ?? new Decimal(0);
  }

  private async getOrCreateDailySpendTracker(customerId: string) {
    let limit = await this.databaseService.withdrawalLimit.findUnique({
      where: { customerId },
    });
    if (!limit) {
      limit = await this.databaseService.withdrawalLimit.create({
        data: {
          customerId,
          dailyLimit: new Decimal(0),
          dailyWithdrawn: new Decimal(0),
          lastResetDate: new Date(),
          isLimitIncreased: false,
        },
      });
    }
    return limit;
  }

  private async resetDailySpendIfNeeded(customerId: string): Promise<void> {
    const limit = await this.getOrCreateDailySpendTracker(customerId);
    const now = getCurrentWATAsUTC();
    const lastReset = new Date(limit.lastResetDate);
    const isNewDay =
      now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCDate() !== lastReset.getUTCDate();

    if (isNewDay) {
      await this.databaseService.withdrawalLimit.update({
        where: { customerId },
        data: {
          dailyWithdrawn: new Decimal(0),
          lastResetDate: now,
        },
      });
    }
  }

  assertInternalOutboundAllowed(customer: CustomerLimitRow): void {
    if (customer.isAmlRestricted) {
      throw new ForbiddenException(
        'Your account is restricted due to compliance review. Outbound transfers are not available.',
      );
    }
    if (customer.isBalanceRestricted) {
      throw new ForbiddenException(
        customer.balanceRestrictionReason ??
          'Your account exceeds the maximum balance allowed for your KYC tier. Outbound transfers are blocked until your balance is within limits. Contact support.',
      );
    }
  }

  async assertDailySpendAllowed(customerId: string, amount: Decimal): Promise<void> {
    const customer = await this.getCustomerForLimits(customerId);
    if (isUnlimitedTier(customer)) {
      return;
    }

    const profile = getTierLimits(customer);
    if (!profile.dailySpendLimit) {
      return;
    }

    await this.resetDailySpendIfNeeded(customerId);
    const tracker = await this.getOrCreateDailySpendTracker(customerId);
    const used = tracker.dailyWithdrawn;
    const remaining = profile.dailySpendLimit.minus(used);

    if (amount.gt(remaining)) {
      throw new BadRequestException({
        message:
          'This transaction exceeds your remaining daily spend limit for your KYC tier. Reduce the amount or try again after your limit resets.',
        dailySpend: {
          limit: profile.dailySpendLimit.toFixed(2),
          used: used.toFixed(2),
          remaining: Decimal.max(remaining, new Decimal(0)).toFixed(2),
        },
      });
    }
  }

  async recordDailySpend(customerId: string, amount: Decimal): Promise<void> {
    const customer = await this.getCustomerForLimits(customerId);
    if (isUnlimitedTier(customer)) {
      return;
    }

    await this.resetDailySpendIfNeeded(customerId);
    const tracker = await this.getOrCreateDailySpendTracker(customerId);
    await this.databaseService.withdrawalLimit.update({
      where: { customerId },
      data: {
        dailyWithdrawn: tracker.dailyWithdrawn.plus(amount),
      },
    });
  }

  async evaluateBalanceAfterInflow(customerId: string): Promise<boolean> {
    const customer = await this.getCustomerForLimits(customerId);
    const profile = getTierLimits(customer);
    if (!profile.maxCumulativeBalance) {
      return false;
    }

    const balance = await this.getPrimaryWalletBalance(customerId);
    if (balance.lte(profile.maxCumulativeBalance)) {
      return false;
    }

    if (customer.isBalanceRestricted) {
      return false;
    }

    const reason = `Wallet balance (${balance.toFixed(2)} NGN) exceeds the maximum allowed (${profile.maxCumulativeBalance.toFixed(2)} NGN) for ${customer.tier}. Outbound transfers are restricted.`;
    const updated = await this.databaseService.customer.update({
      where: { id: customerId },
      data: {
        isBalanceRestricted: true,
        balanceRestrictedAt: new Date(),
        balanceRestrictionReason: reason,
      },
      select: { userId: true },
    });
    this.logger.warn(`Balance restriction applied: customerId=${customerId} ${reason}`);
    if (updated.userId) {
      await this.cacheService.invalidateUserCache(updated.userId);
      await this.accountRestrictionNotify.notifyUserById(updated.userId, 'balance', reason);
    }
    return true;
  }

  warnIfSingleInflowExceedsLimit(customer: CustomerLimitRow, grossAmount: Decimal): void {
    const profile = getTierLimits(customer);
    if (profile.singleInflowLimit && grossAmount.gt(profile.singleInflowLimit)) {
      this.logger.warn(
        `Single inflow exceeds tier limit (processed anyway): customerId=${customer.id} tier=${customer.tier} amount=${grossAmount.toFixed(2)} limit=${profile.singleInflowLimit.toFixed(2)}`,
      );
    }
  }

  async getLimitSnapshot(customerId: string): Promise<AccountLimitsSnapshot> {
    const customer = await this.getCustomerForLimits(customerId);
    const profile = getTierLimits(customer);
    const currentBalance = await this.getPrimaryWalletBalance(customerId);

    await this.resetDailySpendIfNeeded(customerId);
    const tracker = await this.getOrCreateDailySpendTracker(customerId);
    const dailyUsed = tracker.dailyWithdrawn;

    const cumulativeRemaining =
      profile.maxCumulativeBalance !== null
        ? Decimal.max(profile.maxCumulativeBalance.minus(currentBalance), new Decimal(0))
        : null;

    const dailyRemaining =
      profile.dailySpendLimit !== null
        ? Decimal.max(profile.dailySpendLimit.minus(dailyUsed), new Decimal(0))
        : null;

    return {
      tier: customer.tier,
      tier3UpgradeStatus: customer.tier3UpgradeStatus,
      maxCumulativeBalance: formatLimitAmount(profile.maxCumulativeBalance),
      currentBalance: currentBalance.toFixed(2),
      cumulativeBalanceRemaining: formatLimitAmount(cumulativeRemaining),
      isBalanceRestricted: customer.isBalanceRestricted,
      balanceRestrictionReason: customer.balanceRestrictionReason,
      dailySpendLimit: formatLimitAmount(profile.dailySpendLimit),
      dailySpendUsed: dailyUsed.toFixed(2),
      dailySpendRemaining: formatLimitAmount(dailyRemaining),
      singleInflowLimit: formatLimitAmount(profile.singleInflowLimit),
    };
  }
}
