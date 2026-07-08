import {
  KycTier,
  Tier1FaceStatus,
  Tier2UpgradeStatus,
  Tier3UpgradeStatus,
} from '../../../generated/prisma/enums.js';
import {
  buildCompletedKycCustomerWhere,
  buildPendingKycCustomerWhere,
  buildPendingKycUserWhere,
  canReceiveKycReminder,
  deriveExportKycStatus,
  getKycReminderScenario,
  isCustomerKycCompleted,
  isCustomerKycPending,
  KycReminderScenario,
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

  it('buildPendingKycUserWhere only matches Tier 1/2/3 incomplete KYC', () => {
    const where = buildPendingKycUserWhere();
    expect(where.customer).toBeDefined();
    expect(JSON.stringify(where)).not.toContain('null');
  });

  it('deriveExportKycStatus labels Tier_0 and missing customer as not_started', () => {
    expect(deriveExportKycStatus(null)).toBe('not_started');
    expect(
      deriveExportKycStatus({
        tier: KycTier.Tier_0,
      }),
    ).toBe('not_started');
  });

  it('deriveExportKycStatus labels incomplete Tier 1 as pending', () => {
    expect(
      deriveExportKycStatus({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'PENDING',
      }),
    ).toBe('pending');
  });

  it('buildCompletedKycCustomerWhere excludes Tier_0', () => {
    const where = buildCompletedKycCustomerWhere();
    expect(where.OR).toBeDefined();
    expect(JSON.stringify(where)).not.toContain('Tier_0');
  });

  it('canReceiveKycReminder blocks only Tier 3 completed users', () => {
    expect(
      canReceiveKycReminder({
        tier: KycTier.Tier_0,
      }),
    ).toBe(true);

    expect(
      canReceiveKycReminder({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'COMPLETED',
      }),
    ).toBe(true);

    expect(
      canReceiveKycReminder({
        tier: KycTier.Tier_3,
        tier3UpgradeStatus: Tier3UpgradeStatus.COMPLETED,
      }),
    ).toBe(false);
  });

  it('getKycReminderScenario maps tier states to reminder templates', () => {
    expect(
      getKycReminderScenario({
        tier: KycTier.Tier_0,
      }),
    ).toBe(KycReminderScenario.TIER0_START);

    expect(
      getKycReminderScenario({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.PENDING,
      }),
    ).toBe(KycReminderScenario.TIER1_COMPLETE);

    expect(
      getKycReminderScenario({
        tier: KycTier.Tier_1,
        tier1FaceStatus: Tier1FaceStatus.COMPLETED,
        tier1AccountStatus: 'COMPLETED',
      }),
    ).toBe(KycReminderScenario.TIER1_UPGRADE);

    expect(
      getKycReminderScenario({
        tier: KycTier.Tier_2,
        tier2UpgradeStatus: Tier2UpgradeStatus.COMPLETED,
      }),
    ).toBe(KycReminderScenario.TIER2_UPGRADE);
  });
});
