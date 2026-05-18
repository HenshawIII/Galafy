import { KycTier, Tier3UpgradeStatus } from '../../../generated/prisma/enums.js';
import { hasTier3Benefits, isTier2OrTier3WithBenefits } from './kyc-tier.util.js';

describe('kyc-tier.util', () => {
  it('hasTier3Benefits only when tier is Tier_3 and status COMPLETED', () => {
    expect(hasTier3Benefits({ tier: KycTier.Tier_3, tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED })).toBe(
      true,
    );
    expect(hasTier3Benefits({ tier: KycTier.Tier_3, tier3UpgradeStatus: Tier3UpgradeStatus.PENDING })).toBe(
      false,
    );
    expect(hasTier3Benefits({ tier: KycTier.Tier_2, tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED })).toBe(
      false,
    );
  });

  it('isTier2OrTier3WithBenefits includes Tier_2 and approved Tier_3 only', () => {
    expect(isTier2OrTier3WithBenefits({ tier: KycTier.Tier_2 })).toBe(true);
    expect(
      isTier2OrTier3WithBenefits({
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      }),
    ).toBe(true);
    expect(
      isTier2OrTier3WithBenefits({
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: Tier3UpgradeStatus.PENDING,
      }),
    ).toBe(false);
  });
});
