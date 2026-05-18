import { BadRequestException } from '@nestjs/common';
import { resolvePartnershipAccountNumber } from './customer-account.util.js';

describe('resolvePartnershipAccountNumber', () => {
  it('prefers tier1Nuban over wallet virtual account', () => {
    expect(
      resolvePartnershipAccountNumber({
        tier1Nuban: '0123456789',
        wallets: [{ virtualAccountNumber: '9999999999', isDefault: true }],
      }),
    ).toBe('0123456789');
  });

  it('uses default wallet virtual account when tier1Nuban is missing', () => {
    expect(
      resolvePartnershipAccountNumber({
        tier1Nuban: null,
        wallets: [
          { virtualAccountNumber: '1111111111', isDefault: false },
          { virtualAccountNumber: '2222222222', isDefault: true },
        ],
      }),
    ).toBe('2222222222');
  });

  it('falls back to any wallet with a virtual account number', () => {
    expect(
      resolvePartnershipAccountNumber({
        wallets: [{ virtualAccountNumber: '3333333333', isDefault: false }],
      }),
    ).toBe('3333333333');
  });

  it('throws when no account number is available', () => {
    expect(() => resolvePartnershipAccountNumber({ wallets: [] })).toThrow(BadRequestException);
  });
});
