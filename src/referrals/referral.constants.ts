export const REFERRAL_CODE_LENGTH = 8;
export const REFERRAL_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

export const REFERRAL_ERRORS = {
  INVALID: 'Invalid referral code',
  SELF: 'You cannot use your own referral code',
  ALREADY_ATTRIBUTED: 'Referral already attributed',
} as const;
