import { KycTier } from '../../../generated/prisma/enums.js';
import { KycReminderScenario } from './admin-kyc.util.js';
import {
  getKycReminderCatalogEntry,
  getKycReminderTemplate,
  KYC_REMINDER_CATALOG,
} from './kyc-reminder-copy.util.js';

describe('kyc-reminder-copy.util', () => {
  it('exposes three catalog rows for Tier 0–2 only', () => {
    expect(KYC_REMINDER_CATALOG).toHaveLength(3);
    expect(KYC_REMINDER_CATALOG.map((r) => r.targetTier)).toEqual([
      KycTier.Tier_0,
      KycTier.Tier_1,
      KycTier.Tier_2,
    ]);
  });

  it('resolves catalog entry by target tier', () => {
    expect(getKycReminderCatalogEntry(KycTier.Tier_1)?.messageKey).toBe('UPGRADE_TO_TIER_2');
    expect(getKycReminderCatalogEntry(KycTier.Tier_3)).toBeUndefined();
  });

  it('returns scenario templates for email and in-app reuse', () => {
    const upgrade = getKycReminderTemplate(KycReminderScenario.TIER1_UPGRADE);
    expect(upgrade.subject).toContain('Upgrade to Tier 2');
    expect(upgrade.headline).toBeTruthy();
    expect(upgrade.message).toBeTruthy();
  });
});
