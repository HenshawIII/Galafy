import { Decimal } from '@prisma/client/runtime/library';
import { Logger } from '@nestjs/common';
import { normalizeToKobo } from './money.util.js';
import { ConfigService } from '../../config/config.service.js';

const logger = new Logger('FeeUtil');

// Fallback values if config service is not available or config doesn't exist
const FALLBACK_ADMIN_PAYOUT_FEE = new Decimal('0.03');
const FALLBACK_ADMIN_FUNDING_FEE = new Decimal('0.10');
const FALLBACK_ADMIN_FUNDING_FEE_100KABOVE = new Decimal('0.07');
const FALLBACK_FUNDING_THRESHOLD = new Decimal('100000.00');

// Helper function to normalize fee percentage
function normalizeFeePercentage(value: string | Decimal): Decimal {
  const decimal = typeof value === 'string' ? new Decimal(value) : value;

  // If value is >= 1, assume it's a percentage (e.g., 10 means 10%) and convert to decimal (0.10)
  if (decimal.gte(new Decimal('1'))) {
    logger.warn(
      `Fee percentage ${decimal.toString()} appears to be in percentage format (>= 1). ` +
        `Converting to decimal format: ${decimal.div(100).toString()}. ` +
        `Please use decimal format (e.g., 0.10 for 10%, not 10)`,
    );
    return decimal.div(100).toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  }

  // Ensure it's normalized to 4 decimal places and < 10
  const normalized = decimal.toDecimalPlaces(4, Decimal.ROUND_HALF_EVEN);
  if (normalized.gte(new Decimal('10'))) {
    logger.error(
      `Fee percentage ${decimal.toString()} exceeds maximum allowed value (9.9999). ` +
        `Please use decimal format (e.g., 0.10 for 10%, not 10)`,
    );
    throw new Error(
      `Invalid fee percentage: ${decimal.toString()}. Must be less than 10. ` +
        `Use decimal format (e.g., 0.10 for 10%, not 10)`,
    );
  }

  return normalized;
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
 * @param configService - Optional ConfigService instance (for async config access)
 * @returns Object containing fee, netAmount (amount - fee), and feePercentage used
 */
export async function calculateFundingFee(
  amount: Decimal | string | number,
  configService?: ConfigService,
): Promise<FeeCalculationResult> {
  try {
    const grossAmount = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;

    // Get fee percentages from config service or use fallback
    let fundingFee: Decimal;
    let fundingFee100KAbove: Decimal;
    let fundingThreshold: Decimal;

    if (configService) {
      try {
        fundingFee = normalizeFeePercentage(
          await configService.getConfig<Decimal>('ADMIN_FUNDING_FEE', FALLBACK_ADMIN_FUNDING_FEE),
        );
        fundingFee100KAbove = normalizeFeePercentage(
          await configService.getConfig<Decimal>('ADMIN_FUNDING_FEE_100KABOVE', FALLBACK_ADMIN_FUNDING_FEE_100KABOVE),
        );
        fundingThreshold = await configService.getConfig<Decimal>('FUNDING_THRESHOLD', FALLBACK_FUNDING_THRESHOLD);
      } catch (error) {
        logger.warn(`Failed to get config values, using fallback: ${error.message}`);
        fundingFee = FALLBACK_ADMIN_FUNDING_FEE;
        fundingFee100KAbove = FALLBACK_ADMIN_FUNDING_FEE_100KABOVE;
        fundingThreshold = FALLBACK_FUNDING_THRESHOLD;
      }
    } else {
      // Fallback to environment variables or defaults
      const envFundingFee = process.env.ADMIN_FUNDING_FEE;
      const envFundingFee100K = process.env.ADMIN_FUNDING_FEE_100KABOVE;

      fundingFee = envFundingFee ? normalizeFeePercentage(envFundingFee) : FALLBACK_ADMIN_FUNDING_FEE;
      fundingFee100KAbove = envFundingFee100K
        ? normalizeFeePercentage(envFundingFee100K)
        : FALLBACK_ADMIN_FUNDING_FEE_100KABOVE;
      fundingThreshold = FALLBACK_FUNDING_THRESHOLD;
    }

    // Determine fee percentage based on threshold
    const feePercentage = grossAmount.lte(fundingThreshold) ? fundingFee : fundingFee100KAbove;

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
    const grossAmount = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;
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
 * @param configService - Optional ConfigService instance (for async config access)
 * @returns Object containing fee, netAmount (amount - fee), and feePercentage used
 */
export async function calculatePayoutFee(
  amount: Decimal | string | number,
  configService?: ConfigService,
): Promise<FeeCalculationResult> {
  try {
    const grossAmount = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;

    // Get fee percentage from config service or use fallback
    let payoutFee: Decimal;

    if (configService) {
      try {
        payoutFee = normalizeFeePercentage(
          await configService.getConfig<Decimal>('ADMIN_PAYOUT_FEE', FALLBACK_ADMIN_PAYOUT_FEE),
        );
      } catch (error) {
        logger.warn(`Failed to get config value, using fallback: ${error.message}`);
        payoutFee = FALLBACK_ADMIN_PAYOUT_FEE;
      }
    } else {
      // Fallback to environment variable or default
      const envPayoutFee = process.env.ADMIN_PAYOUT_FEE;
      payoutFee = envPayoutFee ? normalizeFeePercentage(envPayoutFee) : FALLBACK_ADMIN_PAYOUT_FEE;
    }

    // Calculate fee: amount * ADMIN_PAYOUT_FEE (3%)
    const fee = normalizeToKobo(grossAmount.times(payoutFee));

    // Calculate net amount: amount - fee
    const netAmount = normalizeToKobo(grossAmount.minus(fee));

    return {
      fee,
      netAmount,
      feePercentage: payoutFee,
    };
  } catch (error) {
    logger.error(`Error calculating payout fee: ${error.message}`, error.stack);
    // Fallback: return zero fee on error
    const grossAmount = typeof amount === 'string' || typeof amount === 'number' ? new Decimal(amount) : amount;
    return {
      fee: normalizeToKobo(0),
      netAmount: normalizeToKobo(grossAmount),
      feePercentage: new Decimal(0),
    };
  }
}
