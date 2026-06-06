import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';

type CustomerTierFields = {
  tier: KycTier;
  tier3UpgradeStatus?: Tier3UpgradeStatus | null;
};

/** Tier 3 benefits (withdrawal limits, events, etc.) require admin-approved COMPLETED status. */
export function hasTier3Benefits(customer: CustomerTierFields): boolean {
  return customer.tier === KycTier.Tier_3 && customer.tier3UpgradeStatus === Tier3UpgradeStatus.COMPLETED;
}

/** Tier 2 users, or Tier 3 users with completed address verification. */
export function isTier2OrTier3WithBenefits(customer: CustomerTierFields): boolean {
  return customer.tier === KycTier.Tier_2 || hasTier3Benefits(customer);
}

/** Only approved Tier 3 users can host (create) events. */
export function canHostEvents(customer: CustomerTierFields): boolean {
  return hasTier3Benefits(customer);
}
