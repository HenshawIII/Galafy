import { getAccountRestrictionEmailCopy } from './account-restriction-email-copy.util.js';

describe('getAccountRestrictionEmailCopy', () => {
  it('returns distinct subjects per restriction kind', () => {
    expect(getAccountRestrictionEmailCopy('aml').subject).toContain('Restricted');
    expect(getAccountRestrictionEmailCopy('balance').subject).toContain('Balance');
    expect(getAccountRestrictionEmailCopy('risk_soft').subject).toContain('Activity');
    expect(getAccountRestrictionEmailCopy('risk_hard').subject).toContain('Wallet');
    expect(getAccountRestrictionEmailCopy('provider').subject).toContain('Wallet Account');
  });

  it('includes tier-oriented bullets for balance restrictions', () => {
    const copy = getAccountRestrictionEmailCopy('balance');
    expect(copy.bullets.some((b) => b.toLowerCase().includes('kyc'))).toBe(true);
  });
});
