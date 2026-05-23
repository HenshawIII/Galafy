import { Decimal } from '@prisma/client/runtime/library';

export const WEMA_BANK_CODE = '035';

export type NipChargeFeeBand = {
  id: number;
  chargeFeeName: string;
  transactionType: number;
  charge: number;
  lower: number;
  upper: number;
};

export type NipChargesResult = {
  chargeFees: NipChargeFeeBand[];
  termsAndConditions?: string;
  termsAndConditionsUrl?: string;
};

/** Interbank NIP fees apply only when destination is not WEMA (035). */
export function isNipChargeApplicable(bankCode: string | null | undefined): boolean {
  if (!bankCode || !String(bankCode).trim()) {
    return true;
  }
  const normalized = String(bankCode).trim().replace(/^0+/, '') || '0';
  const wema = WEMA_BANK_CODE.replace(/^0+/, '') || '35';
  return normalized !== wema;
}

/** Pick NIP band for net transfer amount (after Gala admin fee). */
export function lookupNipCharge(
  netAmount: Decimal,
  chargeFees: NipChargeFeeBand[],
): NipChargeFeeBand | null {
  const amount = netAmount.toNumber();
  for (const band of chargeFees) {
    if (amount >= band.lower && amount <= band.upper) {
      return band;
    }
  }
  return null;
}

export function nipChargeAmountFromBand(band: NipChargeFeeBand | null): Decimal | null {
  if (!band) {
    return null;
  }
  return new Decimal(band.charge);
}
