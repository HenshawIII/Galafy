import { Decimal } from '@prisma/client/runtime/library';
import { normalizeToKobo } from './money.util.js';

const BALANCE_SYNC_TOLERANCE = new Decimal('0.01');

/**
 * Parse provider balance strings such as "1,298.00" or "1298" into kobo-normalized Decimal.
 */
export function parseProviderBalanceString(value: unknown): Decimal | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeToKobo(value);
  }
  if (typeof value !== 'string') {
    return null;
  }
  const cleaned = value.trim().replace(/,/g, '');
  if (!cleaned) {
    return null;
  }
  try {
    const parsed = new Decimal(cleaned);
    if (!parsed.isFinite()) {
      return null;
    }
    return normalizeToKobo(parsed);
  } catch {
    return null;
  }
}

export function computeBalanceDiscrepancy(internal: Decimal, provider: Decimal): Decimal {
  return normalizeToKobo(internal.minus(provider));
}

export function isBalanceInSync(discrepancy: Decimal): boolean {
  return discrepancy.abs().lte(BALANCE_SYNC_TOLERANCE);
}

export function formatBalanceAmount(amount: Decimal): string {
  return normalizeToKobo(amount).toFixed(2);
}
