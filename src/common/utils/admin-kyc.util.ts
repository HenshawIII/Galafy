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

/** Whether the customer's current tier has incomplete KYC (Tier_0 is never pending). */
export function isCustomerKycPending(customer: CustomerKycFields): boolean {
  if (customer.tier === KycTier.Tier_0) return false;

  switch (customer.tier) {
    case KycTier.Tier_1:
      return !isTier1Complete(customer);
    case KycTier.Tier_2:
      return !isTier2Complete(customer);
    case KycTier.Tier_3:
      return !isTier3Complete(customer);
    default:
      return false;
  }
}

export function isCustomerKycCompleted(customer: CustomerKycFields): boolean {
  return !isCustomerKycPending(customer) && customer.tier !== KycTier.Tier_0;
}

/** Prisma where clause for customers with pending KYC at their current tier (excludes Tier_0). */
export function buildPendingKycCustomerWhere(): Prisma.CustomerWhereInput {
  return {
    OR: [
      {
        tier: KycTier.Tier_1,
        OR: [
          { tier1FaceStatus: { not: Tier1FaceStatus.COMPLETED } },
          { tier1AccountStatus: { not: 'COMPLETED' } },
        ],
      },
      {
        tier: KycTier.Tier_2,
        tier2UpgradeStatus: { not: Tier2UpgradeStatus.COMPLETED },
      },
      {
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: { not: Tier3UpgradeStatus.COMPLETED },
      },
    ],
  };
}

/** Prisma where clause for customers who completed KYC at their current tier (excludes Tier_0). */
export function buildCompletedKycCustomerWhere(): Prisma.CustomerWhereInput {
  return {
    OR: [
      {
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'COMPLETED',
      },
      {
        tier: KycTier.Tier_2,
        tier2UpgradeStatus: Tier2UpgradeStatus.COMPLETED,
      },
      {
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      },
    ],
  };
}
