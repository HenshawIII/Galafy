import { bankAccountNameMatchesTier1 } from './bank-account-name-match.util.js';

describe('bankAccountNameMatchesTier1', () => {
  it('passes when both tier1 tokens appear in account name (reordered)', () => {
    expect(bankAccountNameMatchesTier1('ADEWOLE AKANJI', 'AKANJI ADEWOLE OLUMIDE')).toEqual({ ok: true });
    expect(bankAccountNameMatchesTier1('ADEWOLE AKANJI', 'AKANJI ADEWOLE')).toEqual({ ok: true });
  });

  it('passes with middle names in tier1 and account name', () => {
    expect(bankAccountNameMatchesTier1('JOHN MICHAEL DOE', 'DOE JOHN SMITH')).toEqual({ ok: true });
    expect(bankAccountNameMatchesTier1('JOHN MICHAEL DOE', 'DOE MICHAEL JOHN')).toEqual({ ok: true });
  });

  it('normalizes punctuation and case', () => {
    expect(bankAccountNameMatchesTier1('John Doe', "O'DOE, JOHN.")).toEqual({ ok: true });
  });

  it('fails when a required tier1 token is missing from account name', () => {
    expect(bankAccountNameMatchesTier1('ADEWOLE AKANJI', 'ADEGOKE AKANJI')).toEqual({
      ok: false,
      reason: 'Bank account name does not match your verified identity',
    });
    expect(bankAccountNameMatchesTier1('JOHN DOE', 'JOHN')).toEqual({
      ok: false,
      reason: 'Bank account name does not match your verified identity',
    });
  });

  it('rejects missing tier1NubanName', () => {
    expect(bankAccountNameMatchesTier1(null, 'JOHN DOE')).toEqual({
      ok: false,
      reason: 'Tier 1 KYC required before adding a bank account',
    });
    expect(bankAccountNameMatchesTier1('', 'JOHN DOE')).toEqual({
      ok: false,
      reason: 'Tier 1 KYC required before adding a bank account',
    });
  });

  it('rejects missing account name', () => {
    expect(bankAccountNameMatchesTier1('JOHN DOE', null)).toEqual({
      ok: false,
      reason: 'Account name is required',
    });
  });
});
