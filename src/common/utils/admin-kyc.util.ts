import { KycTier, Tier1FaceStatus, Tier2UpgradeStatus, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import type { Prisma } from '../../../generated/prisma/client.js';

type CustomerKycFields = {
  tier: KycTier;
  tier1FaceStatus?: Tier1FaceStatus | null;
  tier1AccountStatus?: string | null;
  tier2UpgradeStatus?: Tier2UpgradeStatus | null;
  tier3UpgradeStatus?: Tier3UpgradeStatus | null;
};

export function isTier1Complete(customer: CustomerKycFields): boolean {
  return (
    customer.tier1FaceStatus === Tier1FaceStatus.COMPLETED &&
    customer.tier1AccountStatus === 'COMPLETED'
  );
}

export function isTier2Complete(customer: CustomerKycFields): boolean {
  return customer.tier2UpgradeStatus === Tier2UpgradeStatus.COMPLETED;
}

export function isTier3Complete(customer: CustomerKycFields): boolean {
  return customer.tier3UpgradeStatus === Tier3UpgradeStatus.COMPLETED;
}

export function isCustomerKycPending(customer: CustomerKycFields): boolean {
  if (customer.tier === KycTier.Tier_0) return true;
  if (!isTier1Complete(customer)) return true;
  if (!isTier2Complete(customer)) return true;
  if (!isTier3Complete(customer)) return true;
  return false;
}

export function isCustomerKycCompleted(customer: CustomerKycFields): boolean {
  return !isCustomerKycPending(customer);
}

/** Prisma where clause for customers with any tier pending */
export function buildPendingKycCustomerWhere(): Prisma.CustomerWhereInput {
  return {
    OR: [
      { tier: { in: [KycTier.Tier_0, KycTier.Tier_1, KycTier.Tier_2] } },
      {
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: { not: Tier3UpgradeStatus.COMPLETED },
      },
    ],
  };
}

/** Prisma where clause for customers with all tiers completed */
export function buildCompletedKycCustomerWhere(): Prisma.CustomerWhereInput {
  return {
    tier: KycTier.Tier_3,
    tier1FaceStatus: Tier1FaceStatus.COMPLETED,
    tier1AccountStatus: 'COMPLETED',
    tier2UpgradeStatus: Tier2UpgradeStatus.COMPLETED,
    tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
  };
}
