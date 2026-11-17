import { KycTier } from '../../../generated/prisma/enums.js';
import { KycReminderScenario } from './admin-kyc.util.js';

export type KycReminderTemplate = {
  subject: string;
  headline: string;
  message: string;
  benefits: string[];
  cta: string;
};

export type KycReminderCatalogEntry = {
  messageKey: string;
  title: string;
  snippet: string;
  targetTier: typeof KycTier.Tier_0 | typeof KycTier.Tier_1 | typeof KycTier.Tier_2;
};

/** Fixed admin Messages catalog rows (Tier 3 excluded). */
export const KYC_REMINDER_CATALOG: KycReminderCatalogEntry[] = [
  {
    messageKey: 'UPGRADE_TO_TIER_1',
    title: 'Upgrade to Tier 1',
    snippet: 'Complete your KYC to unlock higher transaction limits and more features.',
    targetTier: KycTier.Tier_0,
  },
  {
    messageKey: 'UPGRADE_TO_TIER_2',
    title: 'Upgrade to Tier 2',
    snippet: "You've completed Tier 1. Upgrade now to increase your limits.",
    targetTier: KycTier.Tier_1,
  },
  {
    messageKey: 'UPGRADE_TO_TIER_3',
    title: 'Upgrade to Tier 3',
    snippet: 'Complete your address verification to unlock unlimited transactions.',
    targetTier: KycTier.Tier_2,
  },
];

export function getKycReminderCatalogEntry(
  targetTier: KycTier,
): KycReminderCatalogEntry | undefined {
  return KYC_REMINDER_CATALOG.find((entry) => entry.targetTier === targetTier);
}

export function getKycReminderTemplate(scenario: string): KycReminderTemplate {
  const templates: Record<string, KycReminderTemplate> = {
    [KycReminderScenario.TIER0_START]: {
      subject: 'Start Your KYC Verification - Galafy',
      headline: 'Ready to unlock your Galafy account?',
      message:
        'You have not started KYC verification yet. Complete Tier 1 verification to activate your wallet and start transacting securely.',
      benefits: [
        'Activate your wallet and virtual account',
        'Start sending and receiving payments',
        'Unlock basic withdrawal limits',
      ],
      cta: 'Start KYC Verification',
    },
    [KycReminderScenario.TIER1_COMPLETE]: {
      subject: 'Complete Your Tier 1 KYC - Galafy',
      headline: 'Finish your Tier 1 verification',
      message:
        'Your Tier 1 KYC is incomplete. Complete your BVN and face verification to continue using your account without restrictions.',
      benefits: [
        'Complete identity verification',
        'Maintain access to your wallet',
        'Prepare for higher tier upgrades',
      ],
      cta: 'Complete Tier 1 KYC',
    },
    [KycReminderScenario.TIER1_UPGRADE]: {
      subject: 'Upgrade to Tier 2 - Galafy',
      headline: 'You are ready for Tier 2',
      message:
        'You have completed Tier 1 verification. Upgrade to Tier 2 to enjoy higher limits and expanded account features.',
      benefits: [
        'Higher balance and withdrawal limits',
        'Access to more platform features',
        'Stronger account protection',
      ],
      cta: 'Upgrade to Tier 2',
    },
    [KycReminderScenario.TIER2_COMPLETE]: {
      subject: 'Complete Your Tier 2 KYC - Galafy',
      headline: 'Finish your Tier 2 upgrade',
      message:
        'Your Tier 2 upgrade is incomplete. Complete NIN verification and live face verification to unlock Tier 2 benefits.',
      benefits: [
        'Higher transaction limits',
        'Expanded wallet capabilities',
        'Smoother payouts and transfers',
      ],
      cta: 'Complete Tier 2 KYC',
    },
    [KycReminderScenario.TIER2_UPGRADE]: {
      subject: 'Upgrade to Tier 3 - Galafy',
      headline: 'You are ready for Tier 3',
      message:
        'You have completed Tier 2 verification. Upgrade to Tier 3 for unlimited balance and the highest account limits.',
      benefits: [
        'Unlimited account balance',
        'Highest withdrawal limits',
        'Full premium account access',
      ],
      cta: 'Upgrade to Tier 3',
    },
    [KycReminderScenario.TIER3_COMPLETE]: {
      subject: 'Complete Your Tier 3 KYC - Galafy',
      headline: 'Finish your Tier 3 verification',
      message:
        'Your Tier 3 address verification is pending. Complete it to unlock unlimited balance and full premium account access.',
      benefits: [
        'Unlimited account balance',
        'Highest withdrawal limits',
        'Full access to all premium features',
      ],
      cta: 'Complete Tier 3 KYC',
    },
  };

  return templates[scenario] ?? templates[KycReminderScenario.TIER0_START];
}
