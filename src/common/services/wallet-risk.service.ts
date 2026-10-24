import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { config } from 'dotenv';
import { AmlLoggingService } from './aml-logging.service.js';
import { ConfigService } from '../../config/config.service.js';
import { EmailService } from '../../users/email.service.js';
import {
  buildAdminUserReviewUrl,
  type RiskAlertSeverity,
} from '../utils/risk-threshold-compliance-email.util.js';
config();

export type RiskStatus = 'NORMAL' | 'SOFT_FREEZE' | 'HARD_FREEZE';

export interface RiskScoreComponents {
  velocity: number;
  amountSize: number;
  frequency: number;
  deviceRisk: number;
  finalScore: number;
}

type RiskMetadata = {
  velocity?: number;
  amountSize?: number;
  frequency?: number;
  deviceRisk?: number;
  calculatedAt?: string;
  timeWindowHours?: number;
  alertSeverity?: RiskStatus;
};

@Injectable()
export class WalletRiskService {
  private readonly logger = new Logger(WalletRiskService.name);

  // Risk thresholds - loaded lazily from config
  private riskVelocityMax: number | null = null;
  private riskAmountMax: Decimal | null = null;
  private riskSoftFreezeThreshold: number | null = null;
  private riskHardFreezeThreshold: number | null = null;
  private readonly RISK_TIME_WINDOW_HOURS = 24; // 24 hours window

  // Fallback values
  private readonly FALLBACK_RISK_VELOCITY_MAX = 50;
  private readonly FALLBACK_RISK_AMOUNT_MAX = new Decimal('1000000');
  private readonly FALLBACK_RISK_SOFT_FREEZE_THRESHOLD = 70;
  private readonly FALLBACK_RISK_HARD_FREEZE_THRESHOLD = 85;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amlLoggingService: AmlLoggingService,
    private readonly configService: ConfigService,
    private readonly emailService: EmailService,
  ) {
    // Config will be loaded lazily on first use
  }

  /**
   * Load risk configuration from database or use fallback
   */
  private async loadRiskConfig(): Promise<{
    RISK_VELOCITY_MAX: number;
    RISK_AMOUNT_MAX: Decimal;
    RISK_SOFT_FREEZE_THRESHOLD: number;
    RISK_HARD_FREEZE_THRESHOLD: number;
  }> {
    // Use cached values if already loaded
    if (this.riskVelocityMax !== null) {
      return {
        RISK_VELOCITY_MAX: this.riskVelocityMax,
        RISK_AMOUNT_MAX: this.riskAmountMax!,
        RISK_SOFT_FREEZE_THRESHOLD: this.riskSoftFreezeThreshold!,
        RISK_HARD_FREEZE_THRESHOLD: this.riskHardFreezeThreshold!,
      };
    }

    try {
      this.riskVelocityMax = await this.configService.getConfig<number>(
        'RISK_VELOCITY_MAX',
        this.FALLBACK_RISK_VELOCITY_MAX,
      );
      this.riskAmountMax = await this.configService.getConfig<Decimal>(
        'RISK_AMOUNT_MAX',
        this.FALLBACK_RISK_AMOUNT_MAX,
      );
      this.riskSoftFreezeThreshold = await this.configService.getConfig<number>(
        'RISK_SOFT_FREEZE_THRESHOLD',
        this.FALLBACK_RISK_SOFT_FREEZE_THRESHOLD,
      );
      this.riskHardFreezeThreshold = await this.configService.getConfig<number>(
        'RISK_HARD_FREEZE_THRESHOLD',
        this.FALLBACK_RISK_HARD_FREEZE_THRESHOLD,
      );

      this.logger.log(
        `Risk scoring configured: Velocity Max=${this.riskVelocityMax}, ` +
          `Amount Max=${this.riskAmountMax.toString()}, ` +
          `Soft Freeze=${this.riskSoftFreezeThreshold}, ` +
          `Hard Freeze=${this.riskHardFreezeThreshold}`,
      );
    } catch (error) {
      this.logger.warn(`Failed to load risk config, using fallback values: ${error.message}`);
      this.riskVelocityMax = this.FALLBACK_RISK_VELOCITY_MAX;
      this.riskAmountMax = this.FALLBACK_RISK_AMOUNT_MAX;
      this.riskSoftFreezeThreshold = this.FALLBACK_RISK_SOFT_FREEZE_THRESHOLD;
      this.riskHardFreezeThreshold = this.FALLBACK_RISK_HARD_FREEZE_THRESHOLD;
    }

    return {
      RISK_VELOCITY_MAX: this.riskVelocityMax,
      RISK_AMOUNT_MAX: this.riskAmountMax,
      RISK_SOFT_FREEZE_THRESHOLD: this.riskSoftFreezeThreshold,
      RISK_HARD_FREEZE_THRESHOLD: this.riskHardFreezeThreshold,
    };
  }

  /**
   * Calculate risk score for a wallet based on last 24 hours of transactions
   * Formula: (Transaction Velocity + Amount Size + Frequency) / 3
   * Each component is normalized to 0-100 scale
   */
  async calculateRiskScore(walletId: string): Promise<RiskScoreComponents> {
    const config = await this.loadRiskConfig();

    const timeWindowStart = new Date();
    timeWindowStart.setHours(timeWindowStart.getHours() - this.RISK_TIME_WINDOW_HOURS);

    // Query transactions from last 24 hours
    const transactions = await this.databaseService.transaction.findMany({
      where: {
        walletId,
        createdAt: {
          gte: timeWindowStart,
        },
        status: {
          in: ['SUCCESS', 'PROCESSING'], // Only count successful or processing transactions
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
      select: {
        id: true,
        amount: true,
        createdAt: true,
      },
    });

    // If no transactions, return zero risk
    if (transactions.length === 0) {
      return {
        velocity: 0,
        amountSize: 0,
        frequency: 0,
        deviceRisk: 0,
        finalScore: 0,
      };
    }

    // Calculate Transaction Velocity (0-100)
    // Velocity = (transactionCount / maxExpectedTransactions) * 100 (capped at 100)
    const velocity = Math.min((transactions.length / config.RISK_VELOCITY_MAX) * 100, 100);

    // Calculate Amount Size (0-100)
    // Amount Size = (averageAmount / maxExpectedAmount) * 100 (capped at 100)
    const totalAmount = transactions.reduce((sum, tx) => sum.plus(tx.amount), new Decimal(0));
    const averageAmount = totalAmount.dividedBy(transactions.length);
    const amountSize = Math.min(averageAmount.dividedBy(config.RISK_AMOUNT_MAX).times(100).toNumber(), 100);

    // Calculate Frequency (0-100)
    // Frequency = based on average time between transactions
    // Shorter intervals = higher risk
    let frequency = 0;
    if (transactions.length > 1) {
      // Calculate average time between transactions in milliseconds
      const timeDiffs: number[] = [];
      for (let i = 1; i < transactions.length; i++) {
        const diff = transactions[i].createdAt.getTime() - transactions[i - 1].createdAt.getTime();
        timeDiffs.push(diff);
      }
      const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;

      // Normalize to 0-100 scale
      // If average time is < 1 minute (60000ms), risk is high (100)
      // If average time is > 1 hour (3600000ms), risk is low (0)
      // Linear interpolation between these points
      const oneMinute = 60000; // 1 minute in milliseconds
      const oneHour = 3600000; // 1 hour in milliseconds

      if (avgTimeDiff <= oneMinute) {
        frequency = 100;
      } else if (avgTimeDiff >= oneHour) {
        frequency = 0;
      } else {
        // Linear interpolation: 100 at 1min, 0 at 1hour
        frequency = 100 * (1 - (avgTimeDiff - oneMinute) / (oneHour - oneMinute));
      }
    } else {
      // Single transaction - low frequency risk
      frequency = 0;
    }

    // Device Risk: Set to 0 for now (will be added later)
    const deviceRisk = 0;

    // Calculate final score: Average of the three components
    // Since deviceRisk is 0, we average velocity, amountSize, and frequency
    const finalScore = (velocity + amountSize + frequency) / 3;

    return {
      velocity,
      amountSize,
      frequency,
      deviceRisk,
      finalScore: Math.round(finalScore * 100) / 100, // Round to 2 decimal places
    };
  }

  /**
   * Determine alert severity based on risk score (no longer auto-applied as wallet freeze).
   */
  async checkFreezeStatus(riskScore: number): Promise<RiskStatus> {
    const config = await this.loadRiskConfig();

    if (riskScore >= config.RISK_HARD_FREEZE_THRESHOLD) {
      return 'HARD_FREEZE';
    } else if (riskScore >= config.RISK_SOFT_FREEZE_THRESHOLD) {
      return 'SOFT_FREEZE';
    }
    return 'NORMAL';
  }

  private resolvePreviousAlertSeverity(
    riskMetadata: unknown,
    legacyRiskStatus: string | null | undefined,
  ): RiskStatus {
    const meta = (riskMetadata && typeof riskMetadata === 'object' ? riskMetadata : {}) as RiskMetadata;
    if (meta.alertSeverity === 'SOFT_FREEZE' || meta.alertSeverity === 'HARD_FREEZE' || meta.alertSeverity === 'NORMAL') {
      return meta.alertSeverity;
    }
    if (legacyRiskStatus === 'SOFT_FREEZE' || legacyRiskStatus === 'HARD_FREEZE') {
      return legacyRiskStatus;
    }
    return 'NORMAL';
  }

  private shouldNotifyCompliance(previous: RiskStatus, next: RiskStatus): next is RiskAlertSeverity {
    if (next === 'NORMAL') return false;
    if (next === 'HARD_FREEZE') return previous !== 'HARD_FREEZE';
    // SOFT: notify when newly entering soft (not already soft/hard)
    return previous === 'NORMAL';
  }

  /**
   * Update wallet with new risk score. Does NOT auto-freeze; emails compliance on soft/hard alerts.
   */
  async updateWalletRiskScore(walletId: string): Promise<void> {
    try {
      const config = await this.loadRiskConfig();

      // Calculate risk score
      const components = await this.calculateRiskScore(walletId);
      const alertSeverity = await this.checkFreezeStatus(components.finalScore);
      const calculatedAt = new Date().toISOString();

      // Get current wallet to check if alert severity changed
      const currentWallet = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: {
          riskStatus: true,
          riskScore: true,
          riskMetadata: true,
          customerId: true,
          customer: {
            select: {
              id: true,
              userId: true,
              user: {
                select: {
                  id: true,
                  email: true,
                  username: true,
                  firstName: true,
                  lastName: true,
                },
              },
            },
          },
        },
      });

      const previousAlertSeverity = this.resolvePreviousAlertSeverity(
        currentWallet?.riskMetadata,
        currentWallet?.riskStatus,
      );
      const alertChanged = previousAlertSeverity !== alertSeverity;
      const notifyCompliance = this.shouldNotifyCompliance(previousAlertSeverity, alertSeverity);

      // Persist score + alert metadata; never write SOFT/HARD onto riskStatus (no auto-freeze).
      await this.databaseService.wallet.update({
        where: { id: walletId },
        data: {
          riskScore: new Decimal(components.finalScore),
          riskStatus: 'NORMAL',
          riskScoreUpdatedAt: new Date(),
          riskMetadata: {
            velocity: components.velocity,
            amountSize: components.amountSize,
            frequency: components.frequency,
            deviceRisk: components.deviceRisk,
            calculatedAt,
            timeWindowHours: this.RISK_TIME_WINDOW_HOURS,
            alertSeverity,
            softThreshold: config.RISK_SOFT_FREEZE_THRESHOLD,
            hardThreshold: config.RISK_HARD_FREEZE_THRESHOLD,
          },
        },
      });

      // Log risk score calculation (non-blocking)
      try {
        this.amlLoggingService.logRiskScoreCalculated(
          walletId,
          components.finalScore,
          alertSeverity,
          {
            velocity: components.velocity,
            amountSize: components.amountSize,
            frequency: components.frequency,
            deviceRisk: components.deviceRisk,
          },
          currentWallet?.customerId,
          {
            previousRiskScore: currentWallet?.riskScore?.toNumber(),
            timeWindowHours: this.RISK_TIME_WINDOW_HOURS,
            autoFreezeDisabled: true,
          },
        );
      } catch (logError) {
        this.logger.error(`AML logging failed for risk score calculation: ${logError.message}`);
      }

      if (alertChanged) {
        try {
          if (alertSeverity === 'HARD_FREEZE' || alertSeverity === 'SOFT_FREEZE') {
            this.amlLoggingService.logFreezeApplied(
              walletId,
              alertSeverity,
              components.finalScore,
              `Risk score ${components.finalScore.toFixed(2)} exceeds ${alertSeverity === 'HARD_FREEZE' ? 'hard' : 'soft'} threshold (${alertSeverity === 'HARD_FREEZE' ? config.RISK_HARD_FREEZE_THRESHOLD : config.RISK_SOFT_FREEZE_THRESHOLD}). Auto-freeze disabled — compliance notified.`,
              currentWallet?.customerId,
              {
                velocity: components.velocity,
                amountSize: components.amountSize,
                frequency: components.frequency,
                autoFreezeDisabled: true,
              },
            );
          } else if (previousAlertSeverity !== 'NORMAL' && alertSeverity === 'NORMAL') {
            this.amlLoggingService.logFreezeReleased(
              walletId,
              previousAlertSeverity as 'SOFT_FREEZE' | 'HARD_FREEZE',
              components.finalScore,
              currentWallet?.customerId,
              {
                previousRiskScore: currentWallet?.riskScore?.toNumber(),
                autoFreezeDisabled: true,
              },
            );
          }

          this.amlLoggingService.logRiskStatusChanged(
            walletId,
            previousAlertSeverity,
            alertSeverity,
            components.finalScore,
            currentWallet?.riskScore?.toNumber(),
            currentWallet?.customerId,
            {
              velocity: components.velocity,
              amountSize: components.amountSize,
              frequency: components.frequency,
              autoFreezeDisabled: true,
            },
          );
        } catch (logError) {
          this.logger.error(`AML logging failed for risk alert change: ${logError.message}`);
        }
      }

      if (notifyCompliance && currentWallet?.customer?.user) {
        const user = currentWallet.customer.user;
        void this.emailService.sendRiskThresholdComplianceEmail({
          severity: alertSeverity,
          walletId,
          customerId: currentWallet.customerId,
          user: {
            id: user.id,
            email: user.email,
            username: user.username,
            firstName: user.firstName,
            lastName: user.lastName,
          },
          finalScore: components.finalScore,
          softThreshold: config.RISK_SOFT_FREEZE_THRESHOLD,
          hardThreshold: config.RISK_HARD_FREEZE_THRESHOLD,
          velocity: components.velocity,
          amountSize: components.amountSize,
          frequency: components.frequency,
          deviceRisk: components.deviceRisk,
          timeWindowHours: this.RISK_TIME_WINDOW_HOURS,
          calculatedAt,
          reviewUrl: buildAdminUserReviewUrl(user.id),
        });
      }

      if (alertSeverity === 'HARD_FREEZE') {
        if (notifyCompliance) {
          this.logger.error(
            `HARD RISK ALERT (no auto-freeze): Wallet ${walletId}. ` +
              `Score: ${components.finalScore.toFixed(2)} (Velocity: ${components.velocity.toFixed(2)}, ` +
              `Amount: ${components.amountSize.toFixed(2)}, Frequency: ${components.frequency.toFixed(2)})`,
          );
        } else {
          this.logger.warn(
            `HARD RISK: Wallet ${walletId} remains above hard threshold. ` +
              `Score: ${components.finalScore.toFixed(2)}`,
          );
        }
      } else if (notifyCompliance && alertSeverity === 'SOFT_FREEZE') {
        this.logger.warn(
          `SOFT RISK ALERT (no auto-freeze): Wallet ${walletId}. ` +
            `Score: ${components.finalScore.toFixed(2)}. Compliance notified.`,
        );
      } else if (alertChanged && alertSeverity === 'NORMAL' && previousAlertSeverity !== 'NORMAL') {
        this.logger.log(
          `Wallet ${walletId} risk alert normalized. ` +
            `Previous alert: ${previousAlertSeverity}, New Score: ${components.finalScore.toFixed(2)}`,
        );
      }
    } catch (error) {
      // Get customer ID for AML logging
      const wallet = await this.databaseService.wallet
        .findUnique({
          where: { id: walletId },
          select: { customerId: true },
        })
        .catch(() => null);

      // Log risk score update failure (non-blocking)
      try {
        this.amlLoggingService.logRiskScoreUpdateFailed(walletId, error as Error, wallet?.customerId, {
          errorMessage: (error as Error).message,
        });
      } catch (logError) {
        this.logger.error(`AML logging failed for risk score update failure: ${logError.message}`);
      }

      this.logger.error(`Failed to update risk score for wallet ${walletId}: ${error.message}`, error.stack);
      // Don't throw - risk scoring failure shouldn't block transactions
    }
  }

  /**
   * Check if wallet is frozen and throw error if transaction should be blocked.
   * Retained for any legacy SOFT/HARD rows until scoring/unrestrict clears them.
   * @param walletId - Wallet ID to check
   * @param blockAllTransactions - If true, block all transactions for hard freeze. If false, only block payouts for soft freeze.
   */
  async checkWalletFreezeStatus(walletId: string, blockAllTransactions: boolean = false): Promise<void> {
    const wallet = await this.databaseService.wallet.findUnique({
      where: { id: walletId },
      select: { riskStatus: true, riskScore: true },
    });

    if (!wallet) {
      return; // Wallet not found - let other validation handle this
    }

    if (wallet.riskStatus === 'HARD_FREEZE') {
      // Get customer ID for AML logging
      const walletWithCustomer = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: { customerId: true },
      });

      // Log AML transaction block (non-blocking)
      try {
        this.amlLoggingService.logTransactionBlocked(
          walletId,
          'N/A', // Transaction ID not available at this point
          'UNKNOWN',
          'UNKNOWN',
          new Decimal(0),
          `Hard freeze - Risk score: ${wallet.riskScore?.toString() || 'N/A'}`,
          wallet.riskStatus,
          wallet.riskScore?.toNumber(),
          walletWithCustomer?.customerId,
          undefined,
          {
            blockAllTransactions,
          },
        );
      } catch (logError) {
        // Log the logging error but don't block transaction
        this.logger.error(`AML logging failed for hard freeze check: ${logError.message}`);
      }

      throw new BadRequestException(
        `Wallet is hard frozen due to high risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
          `All transactions are blocked. Please contact support.`,
      );
    }

    if (blockAllTransactions && wallet.riskStatus === 'SOFT_FREEZE') {
      // Get customer ID for AML logging
      const walletWithCustomer = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: { customerId: true },
      });

      // Log AML transaction block (non-blocking)
      try {
        this.amlLoggingService.logTransactionBlocked(
          walletId,
          'N/A', // Transaction ID not available at this point
          'UNKNOWN',
          'UNKNOWN',
          new Decimal(0),
          `Soft freeze - Risk score: ${wallet.riskScore?.toString() || 'N/A'}`,
          wallet.riskStatus,
          wallet.riskScore?.toNumber(),
          walletWithCustomer?.customerId,
          undefined,
          {
            blockAllTransactions,
          },
        );
      } catch (logError) {
        // Log the logging error but don't block transaction
        this.logger.error(`AML logging failed for soft freeze check: ${logError.message}`);
      }

      throw new BadRequestException(
        `Wallet is soft frozen due to elevated risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
          `This transaction type is blocked. Please contact support.`,
      );
    }
  }
}
