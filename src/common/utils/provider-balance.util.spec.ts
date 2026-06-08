import { Decimal } from '@prisma/client/runtime/library';
import {
  computeBalanceDiscrepancy,
  formatBalanceAmount,
  isBalanceInSync,
  parseProviderBalanceString,
} from './provider-balance.util.js';

describe('provider-balance.util', () => {
  it('parses comma-formatted provider balance strings', () => {
    expect(parseProviderBalanceString('1,298.00')?.toString()).toBe('1298');
    expect(parseProviderBalanceString('26799.00')?.toString()).toBe('26799');
    expect(parseProviderBalanceString(110)?.toString()).toBe('110');
  });

  it('returns null for invalid provider balance strings', () => {
    expect(parseProviderBalanceString('')).toBeNull();
    expect(parseProviderBalanceString('abc')).toBeNull();
    expect(parseProviderBalanceString(null)).toBeNull();
  });

  it('computes discrepancy and sync tolerance', () => {
    const discrepancy = computeBalanceDiscrepancy(new Decimal('1000'), new Decimal('970'));
    expect(formatBalanceAmount(discrepancy)).toBe('30.00');
    expect(isBalanceInSync(discrepancy)).toBe(false);
    expect(isBalanceInSync(new Decimal('0.01'))).toBe(true);
    expect(isBalanceInSync(new Decimal('-0.01'))).toBe(true);
    expect(isBalanceInSync(new Decimal('0.02'))).toBe(false);
  });
});
