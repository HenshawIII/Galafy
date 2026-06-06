import { Decimal } from '@prisma/client/runtime/library';
import { calculateFundingFee } from './fee.util.js';

describe('calculateFundingFee (inclusive gross)', () => {
  it('splits 1100 gross at 10% into 1000 net and 100 fee', async () => {
    const result = await calculateFundingFee(new Decimal(1100));
    expect(result.netAmount.toFixed(2)).toBe('1000.00');
    expect(result.fee.toFixed(2)).toBe('100.00');
    expect(result.grossAmount.toFixed(2)).toBe('1100.00');
  });

  it('uses 7% tier when gross exceeds 100k', async () => {
    const gross = new Decimal(214000);
    const result = await calculateFundingFee(gross);
    expect(result.netAmount.toFixed(2)).toBe('200000.00');
    expect(result.fee.toFixed(2)).toBe('14000.00');
  });
});
