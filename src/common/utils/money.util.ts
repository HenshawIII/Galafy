import { Decimal } from '@prisma/client/runtime/library';

/**
 * Normalizes a monetary amount to exactly 2 decimal places (kobo precision)
 * Rounds to nearest kobo using banker's rounding (round half to even)
 * This ensures all amounts conform to Naira/kobo precision (1 Naira = 100 Kobo)
 */
export function normalizeToKobo(amount: Decimal | string | number): Decimal {
  const decimal = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;

  // Round to 2 decimal places using banker's rounding (round half to even)
  // This is the standard rounding method for financial calculations
  return decimal.toDecimalPlaces(2, Decimal.ROUND_HALF_EVEN);
}

/**
 * Validates that an amount has at most 2 decimal places
 * Returns true if the amount is valid for kobo precision
 */
export function isValidKoboAmount(amount: Decimal | string | number): boolean {
  try {
    const decimal = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;

    // Check if decimal places <= 2
    const decimalPlaces = decimal.decimalPlaces();
    return decimalPlaces <= 2;
  } catch {
    return false;
  }
}

/**
 * Converts a Decimal to a number for display purposes only
 * Always rounds to 2 decimal places before conversion
 * WARNING: Only use this for display/export, never for calculations
 */
export function toDisplayAmount(amount: Decimal): number {
  return normalizeToKobo(amount).toNumber();
}

/**
 * Converts a Decimal to a formatted string with 2 decimal places
 * Useful for API responses and display
 */
export function toFormattedAmount(amount: Decimal): string {
  return normalizeToKobo(amount).toFixed(2);
}
