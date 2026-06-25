import {
  KycTier,
  Tier1FaceStatus,
  Tier2UpgradeStatus,
  Tier3UpgradeStatus,
} from '../../../generated/prisma/enums.js';
import {
  buildCompletedKycCustomerWhere,
  buildPendingKycCustomerWhere,
  isCustomerKycCompleted,
  isCustomerKycPending,
} from './admin-kyc.util.js';

describe('admin-kyc.util', () => {
  it('isCustomerKycPending returns false for Tier_0', () => {
    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_0,
      }),
    ).toBe(false);
  });

  it('isCustomerKycPending checks only current tier fields', () => {
    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'COMPLETED',
      }),
    ).toBe(false);

    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'PENDING',
      }),
    ).toBe(true);

    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_2,
        tier2UpgradeStatus: Tier2UpgradeStatus.COMPLETED,
      }),
    ).toBe(false);

    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_2,
        tier2UpgradeStatus: Tier2UpgradeStatus.PENDING,
      }),
    ).toBe(true);

    expect(
      isCustomerKycPending({
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      }),
    ).toBe(false);
  });

  it('isCustomerKycCompleted excludes Tier_0', () => {
    expect(
      isCustomerKycCompleted({
        tier: KycTier.Tier_0,
      }),
    ).toBe(false);
  });

  it('buildPendingKycCustomerWhere excludes Tier_0', () => {
    const where = buildPendingKycCustomerWhere();
    expect(where.OR).toBeDefined();
    expect(JSON.stringify(where)).not.toContain('Tier_0');
  });

  it('buildCompletedKycCustomerWhere excludes Tier_0', () => {
    const where = buildCompletedKycCustomerWhere();
    expect(where.OR).toBeDefined();
    expect(JSON.stringify(where)).not.toContain('Tier_0');
  });
});
