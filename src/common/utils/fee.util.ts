import { Decimal } from '@prisma/client/runtime/library';
import { Logger } from '@nestjs/common';
import { normalizeToKobo } from './money.util.js';

const logger = new Logger('FeeUtil');

// Read fee percentages from environment variables and parse as Decimal
const ADMIN_PAYOUT_FEE = new Decimal(process.env.ADMIN_PAYOUT_FEE || '0.03');
const ADMIN_FUNDING_FEE = new Decimal(process.env.ADMIN_FUNDING_FEE || '0.10');
const ADMIN_FUNDING_FEE_100KABOVE = new Decimal(process.env.ADMIN_FUNDING_FEE_100KABOVE || '0.07');
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

