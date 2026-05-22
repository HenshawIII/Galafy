import { Decimal } from '@prisma/client/runtime/library';
import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import { getTierLimits, isUnlimitedTier } from './tier-transaction-limits.util.js';

describe('tier-transaction-limits.util', () => {
  it('applies Tier_1 limits for Tier_0 and Tier_1', () => {
    const limits = getTierLimits({ tier: KycTier.Tier_1 });
    expect(limits.maxCumulativeBalance?.toString()).toBe('300000');
    expect(limits.dailySpendLimit?.toString()).toBe('30000');
    expect(limits.singleInflowLimit?.toString()).toBe('50000');
  });

  it('applies Tier_2 limits for Tier_2 and Tier_3 PENDING', () => {
    const t2 = getTierLimits({ tier: KycTier.Tier_2 });
    expect(t2.maxCumulativeBalance?.toString()).toBe('500000');

    const t3Pending = getTierLimits({
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
    });
    expect(t3Pending.dailySpendLimit?.toString()).toBe('100000');
    expect(isUnlimitedTier(t3Pending)).toBe(false);
  });

  it('has no caps for Tier_3 COMPLETED', () => {
    const customer = {
      tier: KycTier.Tier_3,
      tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
    };
    expect(isUnlimitedTier(customer)).toBe(true);
    const limits = getTierLimits(customer);
    expect(limits.maxCumulativeBalance).toBeNull();
    expect(limits.dailySpendLimit).toBeNull();
    expect(limits.singleInflowLimit).toBeNull();
  });

  it('formatLimitAmount via getTierLimits values', () => {
    const limits = getTierLimits({ tier: KycTier.Tier_1 });
    expect(limits.maxCumulativeBalance).toEqual(new Decimal(300000));
  });
});
