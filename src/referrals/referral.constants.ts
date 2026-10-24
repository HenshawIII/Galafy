export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const REFERRAL_ERRORS = {
  INVALID: 'Invalid referral code',
  SELF: 'You cannot use your own referral code',
  ALREADY_ATTRIBUTED: 'Referral already attributed',
  CLAIM_UNAVAILABLE: 'Referral balance claims are not available yet',
} as const;

/** Placeholder until referral earnings are implemented. */
export const REFERRAL_BALANCE_PLACEHOLDER = '0.00';
