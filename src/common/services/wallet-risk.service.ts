import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { Prisma } from '@prisma/client';
import { config } from 'dotenv';
import { AmlLoggingService } from './aml-logging.service.js';
config();

export type RiskStatus = 'NORMAL' | 'SOFT_FREEZE' | 'HARD_FREEZE';

export interface RiskScoreComponents {
  velocity: number;
  amountSize: number;
  frequency: number;
  deviceRisk: number;
  finalScore: number;
}

@Injectable()
export class WalletRiskService {
  private readonly logger = new Logger(WalletRiskService.name);

  // Risk thresholds from environment variables
  private readonly RISK_VELOCITY_MAX: number;
  private readonly RISK_AMOUNT_MAX: Decimal;
  private readonly RISK_SOFT_FREEZE_THRESHOLD: number;
  private readonly RISK_HARD_FREEZE_THRESHOLD: number;
  private readonly RISK_TIME_WINDOW_HOURS = 24; // 24 hours window

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly amlLoggingService: AmlLoggingService,
  ) {
    // Load configuration from environment variables
    this.RISK_VELOCITY_MAX = parseInt(process.env.RISK_VELOCITY_MAX || '50', 10);
    this.RISK_AMOUNT_MAX = new Decimal(process.env.RISK_AMOUNT_MAX || '1000000');
    this.RISK_SOFT_FREEZE_THRESHOLD = parseInt(process.env.RISK_SOFT_FREEZE_THRESHOLD || '70', 10);
    this.RISK_HARD_FREEZE_THRESHOLD = parseInt(process.env.RISK_HARD_FREEZE_THRESHOLD || '85', 10);

    this.logger.log(
      `Risk scoring configured: Velocity Max=${this.RISK_VELOCITY_MAX}, ` +
      `Amount Max=${this.RISK_AMOUNT_MAX.toString()}, ` +
      `Soft Freeze=${this.RISK_SOFT_FREEZE_THRESHOLD}, ` +
      `Hard Freeze=${this.RISK_HARD_FREEZE_THRESHOLD}`,
    );
  }

  /**
   * Calculate risk score for a wallet based on last 24 hours of transactions
   * Formula: (Transaction Velocity + Amount Size + Frequency) / 3
   * Each component is normalized to 0-100 scale
   */
  async calculateRiskScore(walletId: string): Promise<RiskScoreComponents> {
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
    const velocity = Math.min((transactions.length / this.RISK_VELOCITY_MAX) * 100, 100);

    // Calculate Amount Size (0-100)
    // Amount Size = (averageAmount / maxExpectedAmount) * 100 (capped at 100)
    const totalAmount = transactions.reduce(
      (sum, tx) => sum.plus(tx.amount),
      new Decimal(0),
    );
    const averageAmount = totalAmount.dividedBy(transactions.length);
    const amountSize = Math.min(
      averageAmount.dividedBy(this.RISK_AMOUNT_MAX).times(100).toNumber(),
      100,
    );

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
   * Determine freeze status based on risk score
   */
  checkFreezeStatus(riskScore: number): RiskStatus {
    if (riskScore >= this.RISK_HARD_FREEZE_THRESHOLD) {
      return 'HARD_FREEZE';
    } else if (riskScore >= this.RISK_SOFT_FREEZE_THRESHOLD) {
      return 'SOFT_FREEZE';
    }
    return 'NORMAL';
  }

  /**
   * Update wallet with new risk score and status
   */
  async updateWalletRiskScore(walletId: string): Promise<void> {
    try {
      // Calculate risk score
      const components = await this.calculateRiskScore(walletId);
      const riskStatus = this.checkFreezeStatus(components.finalScore);

      // Get current wallet to check if status changed
      const currentWallet = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: { riskStatus: true, riskScore: true },
      });

      const previousStatus = currentWallet?.riskStatus || 'NORMAL';
      const statusChanged = previousStatus !== riskStatus;

      // Get customer ID for AML logging
      const wallet = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: { customerId: true },
      });

      // Update wallet with new risk score
      await this.databaseService.wallet.update({
        where: { id: walletId },
        data: {
          riskScore: new Decimal(components.finalScore),
          riskStatus,
          riskScoreUpdatedAt: new Date(),
          riskMetadata: {
            velocity: components.velocity,
            amountSize: components.amountSize,
            frequency: components.frequency,
            deviceRisk: components.deviceRisk,
            calculatedAt: new Date().toISOString(),
            timeWindowHours: this.RISK_TIME_WINDOW_HOURS,
          },
        },
      });

      // Log risk score calculation
      this.amlLoggingService.logRiskScoreCalculated(
        walletId,
        components.finalScore,
        riskStatus,
        {
          velocity: components.velocity,
          amountSize: components.amountSize,
          frequency: components.frequency,
          deviceRisk: components.deviceRisk,
        },
        wallet?.customerId,
        {
          previousRiskScore: currentWallet?.riskScore?.toNumber(),
          timeWindowHours: this.RISK_TIME_WINDOW_HOURS,
        },
      );

      // Log status changes
      if (statusChanged) {
        if (riskStatus === 'HARD_FREEZE') {
          this.amlLoggingService.logFreezeApplied(
            walletId,
            'HARD_FREEZE',
            components.finalScore,
            `Risk score ${components.finalScore.toFixed(2)} exceeds hard freeze threshold (${this.RISK_HARD_FREEZE_THRESHOLD})`,
            wallet?.customerId,
            {
              velocity: components.velocity,
              amountSize: components.amountSize,
              frequency: components.frequency,
            },
          );
        } else if (riskStatus === 'SOFT_FREEZE') {
          this.amlLoggingService.logFreezeApplied(
            walletId,
            'SOFT_FREEZE',
            components.finalScore,
            `Risk score ${components.finalScore.toFixed(2)} exceeds soft freeze threshold (${this.RISK_SOFT_FREEZE_THRESHOLD})`,
            wallet?.customerId,
            {
              velocity: components.velocity,
              amountSize: components.amountSize,
              frequency: components.frequency,
            },
          );
        } else if (previousStatus !== 'NORMAL' && riskStatus === 'NORMAL') {
          this.amlLoggingService.logFreezeReleased(
            walletId,
            previousStatus as 'SOFT_FREEZE' | 'HARD_FREEZE',
            components.finalScore,
            wallet?.customerId,
            {
              previousRiskScore: currentWallet?.riskScore?.toNumber(),
            },
          );
        }

        // Log status change
        this.amlLoggingService.logRiskStatusChanged(
          walletId,
          previousStatus,
          riskStatus,
          components.finalScore,
          currentWallet?.riskScore?.toNumber(),
          wallet?.customerId,
          {
            velocity: components.velocity,
            amountSize: components.amountSize,
            frequency: components.frequency,
          },
        );
      }

      // Keep existing logger for backward compatibility
      if (riskStatus === 'HARD_FREEZE') {
        if (statusChanged) {
          this.logger.error(
            `🚨 HARD FREEZE ALERT: Wallet ${walletId} has been frozen due to high risk score. ` +
            `Score: ${components.finalScore.toFixed(2)} (Velocity: ${components.velocity.toFixed(2)}, ` +
            `Amount: ${components.amountSize.toFixed(2)}, Frequency: ${components.frequency.toFixed(2)})`,
          );
        } else {
          this.logger.warn(
            `⚠️ HARD FREEZE: Wallet ${walletId} remains frozen. ` +
            `Score: ${components.finalScore.toFixed(2)}`,
          );
        }
      } else if (statusChanged && riskStatus === 'SOFT_FREEZE') {
        this.logger.warn(
          `⚠️ SOFT FREEZE: Wallet ${walletId} has been soft frozen. ` +
          `Score: ${components.finalScore.toFixed(2)}. Payouts will be blocked.`,
        );
      } else if (statusChanged && riskStatus === 'NORMAL' && previousStatus !== 'NORMAL') {
        this.logger.log(
          `✅ Wallet ${walletId} risk status normalized. ` +
          `Previous: ${previousStatus}, New Score: ${components.finalScore.toFixed(2)}`,
        );
      }
    } catch (error) {
      // Get customer ID for AML logging
      const wallet = await this.databaseService.wallet.findUnique({
        where: { id: walletId },
        select: { customerId: true },
      }).catch(() => null);

      this.amlLoggingService.logRiskScoreUpdateFailed(
        walletId,
        error as Error,
        wallet?.customerId,
        {
          errorMessage: (error as Error).message,
        },
      );

      this.logger.error(
        `Failed to update risk score for wallet ${walletId}: ${error.message}`,
        error.stack,
      );
      // Don't throw - risk scoring failure shouldn't block transactions
    }
  }

  /**
   * Check if wallet is frozen and throw error if transaction should be blocked
   * @param walletId - Wallet ID to check
   * @param blockAllTransactions - If true, block all transactions for hard freeze. If false, only block payouts for soft freeze.
   */
  async checkWalletFreezeStatus(
    walletId: string,
    blockAllTransactions: boolean = false,
  ): Promise<void> {
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

      throw new BadRequestException(
        `Wallet is soft frozen due to elevated risk score (${wallet.riskScore?.toString() || 'N/A'}). ` +
        `This transaction type is blocked. Please contact support.`,
      );
    }
  }
}

