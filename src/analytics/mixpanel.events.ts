export const MixpanelEvent = {
  SignedUp: 'Signed Up',
  AccountVerified: 'Account Verified',
  LoggedIn: 'Logged In',
  KycStarted: 'KYC Started',
  KycTierUpgraded: 'KYC Tier Upgraded',
  WalletCreated: 'Wallet Created',
  LoginFailed: 'Login Failed',
  AccountVerificationFailed: 'Account Verification Failed',
  KycFailed: 'KYC Failed',
  EventCreated: 'Event Created',
  EventJoined: 'Event Joined',
  SpraySent: 'Spray Sent',
  WalletFunded: 'Wallet Funded',
  WalletTransferSent: 'Wallet Transfer Sent',
  PayoutInitiated: 'Payout Initiated',
  PayoutCompleted: 'Payout Completed',
} as const;

export type MixpanelEventName = (typeof MixpanelEvent)[keyof typeof MixpanelEvent];
