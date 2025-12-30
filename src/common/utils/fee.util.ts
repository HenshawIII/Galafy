import { Decimal } from '@prisma/client/runtime/library';
import { Logger } from '@nestjs/common';
import { normalizeToKobo } from './money.util.js';

const logger = new Logger('FeeUtil');

// Read fee percentages from environment variables and parse as Decimal
// Normalize to ensure values are in decimal format (0.03 for 3%, not 3)
// If value is >= 1, assume it's a percentage and convert to decimal (e.g., 10 -> 0.10)
function normalizeFeePercentage(envValue: string | undefined, defaultValue: string): Decimal {
  const value = envValue || defaultValue;
  const decimal = new Decimal(value);
  
  // If value is >= 1, assume it's a percentage (e.g., 10 means 10%) and convert to decimal (0.10)
  if (decimal.gte(new Decimal('1'))) {
    logger.warn(
      `Fee percentage ${value} appears to be in percentage format (>= 1). ` +
      `Converting to decimal format: ${decimal.div(100).toString()}. ` +
      `Please use decimal format in env (e.g., 0.10 for 10%, not 10)`,
    );
    return decimal.div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  }
  
  // Ensure it's normalized to 4 decimal places and < 10 (for DECIMAL(5,4) constraint)
  const normalized = decimal.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  if (normalized.gte(new Decimal('10'))) {
    logger.error(
      `Fee percentage ${value} exceeds maximum allowed value (9.9999). ` +
      `Please use decimal format (e.g., 0.10 for 10%, not 10)`,
    );
    throw new Error(
      `Invalid fee percentage: ${value}. Must be less than 10. ` +
      `Use decimal format (e.g., 0.10 for 10%, not 10)`,
    );
  }
  
  return normalized;
}

const ADMIN_PAYOUT_FEE = normalizeFeePercentage(process.env.ADMIN_PAYOUT_FEE, '0.03');
const ADMIN_FUNDING_FEE = normalizeFeePercentage(process.env.ADMIN_FUNDING_FEE, '0.10');
const ADMIN_FUNDING_FEE_100KABOVE = normalizeFeePercentage(process.env.ADMIN_FUNDING_FEE_100KABOVE, '0.07');
const FUNDING_THRESHOLD = new Decimal('100000.00');

// Log fee configuration on module load
if (!process.env.ADMIN_PAYOUT_FEE) {
  logger.warn('ADMIN_PAYOUT_FEE not set, using default: 0.03 (3%)');
}
if (!process.env.ADMIN_FUNDING_FEE) {
  logger.warn('ADMIN_FUNDING_FEE not set, using default: 0.10 (10%)');
}
if (!process.env.ADMIN_FUNDING_FEE_100KABOVE) {
  logger.warn('ADMIN_FUNDING_FEE_100KABOVE not set, using default: 0.07 (7%)');
}

export interface FeeCalculationResult {
  fee: Decimal;
  netAmount: Decimal;
  feePercentage: Decimal;
}

/**
 * Calculate funding fee based on amount threshold
 * - ≤100,000: Use ADMIN_FUNDING_FEE (10%)
 * - >100,000: Use ADMIN_FUNDING_FEE_100KABOVE (7%)
 * 
 * @param amount - The gross funding amount
 * @returns Object containing fee, netAmount (amount - fee), and feePercentage used
 */
export function calculateFundingFee(amount: Decimal | string | number): FeeCalculationResult {
  try {
    const grossAmount = typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

    // Determine fee percentage based on threshold
    const feePercentage = grossAmount.lte(FUNDING_THRESHOLD)
      ? ADMIN_FUNDING_FEE
      : ADMIN_FUNDING_FEE_100KABOVE;

    // Calculate fee: amount * feePercentage
    const fee = normalizeToKobo(grossAmount.times(feePercentage));

    // Calculate net amount: amount - fee
    const netAmount = normalizeToKobo(grossAmount.minus(fee));

    return {
      fee,
      netAmount,
      feePercentage,
    };
  } catch (error) {
    logger.error(`Error calculating funding fee: ${error.message}`, error.stack);
    // Fallback: return zero fee on error
    const grossAmount = typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;
    return {
      fee: normalizeToKobo(0),
      netAmount: normalizeToKobo(grossAmount),
      feePercentage: new Decimal(0),
    };
  }
}

/**
 * Calculate payout fee (3%)
 * 
 * @param amount - The gross payout amount
 * @returns Object containing fee, netAmount (amount - fee), and feePercentage used
 */
export function calculatePayoutFee(amount: Decimal | string | number): FeeCalculationResult {
  try {
    const grossAmount = typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;

    // Calculate fee: amount * ADMIN_PAYOUT_FEE (3%)
    const fee = normalizeToKobo(grossAmount.times(ADMIN_PAYOUT_FEE));

    // Calculate net amount: amount - fee
    const netAmount = normalizeToKobo(grossAmount.minus(fee));

    return {
      fee,
      netAmount,
      feePercentage: ADMIN_PAYOUT_FEE,
    };
  } catch (error) {
    logger.error(`Error calculating payout fee: ${error.message}`, error.stack);
    // Fallback: return zero fee on error
    const grossAmount = typeof amount === 'string' || typeof amount === 'number'
      ? new Decimal(amount)
      : amount;
    return {
      fee: normalizeToKobo(0),
      netAmount: normalizeToKobo(grossAmount),
      feePercentage: new Decimal(0),
    };
  }
}

