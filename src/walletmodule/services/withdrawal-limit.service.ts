import { Injectable } from '@nestjs/common';
import { Decimal } from '@prisma/client/runtime/library';
import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import { ProviderAccountStatusService } from '../../common/provider-account-status/provider-account-status.service.js';
import { TierLimitService } from '../../common/services/tier-limit.service.js';

/**
 * Delegates payout limit checks to TierLimitService (bank-aligned tier rules).
 */
@Injectable()
export class WithdrawalLimitService {
  constructor(
    private readonly tierLimitService: TierLimitService,
    private readonly providerAccountStatusService: ProviderAccountStatusService,
  ) {}

  async validatePayoutForTier(
    customer: { tier: KycTier; tier3UpgradeStatus?: Tier3UpgradeStatus | null },
    customerId: string,
    amount: Decimal,
  ): Promise<void> {
    await this.providerAccountStatusService.assertProviderAllowsOutbound(customerId);
    const row = await this.tierLimitService.getCustomerForLimits(customerId);
    this.tierLimitService.assertInternalOutboundAllowed(row);
    await this.tierLimitService.assertDailySpendAllowed(customerId, amount);
  }

  async recordWithdrawal(customerId: string, amount: Decimal): Promise<void> {
    await this.tierLimitService.recordDailySpend(customerId, amount);
  }

  async getWithdrawalLimitInfo(customerId: string) {
    const snapshot = await this.tierLimitService.getLimitSnapshot(customerId);
    return {
      tier: snapshot.tier,
      dailyLimit: snapshot.dailySpendLimit,
      currentLimit: snapshot.dailySpendLimit,
      dailyWithdrawn: snapshot.dailySpendUsed,
      remaining: snapshot.dailySpendRemaining,
      maxCumulativeBalance: snapshot.maxCumulativeBalance,
      currentBalance: snapshot.currentBalance,
      cumulativeBalanceRemaining: snapshot.cumulativeBalanceRemaining,
      isBalanceRestricted: snapshot.isBalanceRestricted,
      balanceRestrictionReason: snapshot.balanceRestrictionReason,
      singleInflowLimit: snapshot.singleInflowLimit,
    };
  }
}
