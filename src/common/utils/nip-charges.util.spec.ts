import { Decimal } from '@prisma/client/runtime/library';
import {
  isNipChargeApplicable,
  lookupNipCharge,
  type NipChargeFeeBand,
} from './nip-charges.util.js';

const SAMPLE_BANDS: NipChargeFeeBand[] = [
  { id: 1, chargeFeeName: 'InterBank1', transactionType: 1, charge: 10.75, lower: 0, upper: 5000 },
  { id: 2, chargeFeeName: 'Interbank2', transactionType: 1, charge: 26.88, lower: 5000.01, upper: 50000 },
];

describe('nip-charges.util', () => {
  it('returns no NIP fee for WEMA bank code 035', () => {
    expect(isNipChargeApplicable('035')).toBe(false);
    expect(isNipChargeApplicable('00035')).toBe(false);
  });

  it('requires NIP fee for external banks', () => {
    expect(isNipChargeApplicable('058')).toBe(true);
  });

  it('looks up 10.75 charge for net amount 5000', () => {
    const band = lookupNipCharge(new Decimal(5000), SAMPLE_BANDS);
    expect(band?.charge).toBe(10.75);
    expect(band?.chargeFeeName).toBe('InterBank1');
  });
});
