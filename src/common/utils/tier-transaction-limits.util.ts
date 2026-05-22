import { Decimal } from '@prisma/client/runtime/library';
import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import { hasTier3Benefits } from './kyc-tier.util.js';

export type TierLimitProfile = {
  singleInflowLimit: Decimal | null;
  dailySpendLimit: Decimal | null;
  maxCumulativeBalance: Decimal | null;
};

type CustomerTierFields = {
  tier: KycTier;
  tier3UpgradeStatus?: Tier3UpgradeStatus | null;
};

const TIER_1_LIMITS: TierLimitProfile = {
  singleInflowLimit: new Decimal(50000),
  dailySpendLimit: new Decimal(30000),
  maxCumulativeBalance: new Decimal(300000),
};

const TIER_2_LIMITS: TierLimitProfile = {
  singleInflowLimit: new Decimal(100000),
  dailySpendLimit: new Decimal(100000),
  maxCumulativeBalance: new Decimal(500000),
};

const UNLIMITED: TierLimitProfile = {
  singleInflowLimit: null,
  dailySpendLimit: null,
  maxCumulativeBalance: null,
};

/** Approved Tier 3 (COMPLETED) has no bank-aligned caps. */
export function isUnlimitedTier(customer: CustomerTierFields): boolean {
  return hasTier3Benefits(customer);
}

export function getTierLimits(customer: CustomerTierFields): TierLimitProfile {
  if (isUnlimitedTier(customer)) {
    return UNLIMITED;
  }
  if (customer.tier === KycTier.Tier_2 || customer.tier === KycTier.Tier_3) {
    return TIER_2_LIMITS;
  }
  if (customer.tier === KycTier.Tier_1) {
    return TIER_1_LIMITS;
  }
  return TIER_1_LIMITS;
}

export function formatLimitAmount(value: Decimal | null): string | null {
  if (value === null) return null;
  return value.toFixed(2);
}
