import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import { Decimal } from '@prisma/client/runtime/library';
import { getCurrentWATAsUTC } from '../../common/utils/timezone.util.js';

@Injectable()
export class WithdrawalLimitService {
  private readonly logger = new Logger(WithdrawalLimitService.name);
  private readonly DEFAULT_TIER_2_LIMIT = new Decimal(100000000); // 1M in kobo
  private readonly APPROVED_TIER_2_LIMIT = new Decimal(1000000000); // 10M in kobo

  constructor(private readonly databaseService: DatabaseService) {}

  /**
   * Get or create withdrawal limit for customer
   */
  async getOrCreateWithdrawalLimit(customerId: string) {
    let limit = await this.databaseService.withdrawalLimit.findUnique({
      where: { customerId },
    });

    if (!limit) {
      limit = await this.databaseService.withdrawalLimit.create({
        data: {
          customerId,
          dailyLimit: this.DEFAULT_TIER_2_LIMIT,
          dailyWithdrawn: new Decimal(0),
          lastResetDate: new Date(),
          isLimitIncreased: false,
        },
      });
      this.logger.log(`Created withdrawal limit for customer ${customerId}`);
    }

    return limit;
  }

  /**
   * Reset daily limit if it's a new day
   */
  async resetDailyLimitIfNeeded(customerId: string): Promise<void> {
    const limit = await this.getOrCreateWithdrawalLimit(customerId);
    const now = getCurrentWATAsUTC();
    const lastReset = new Date(limit.lastResetDate);

    // Check if it's a new day (compare dates, not times)
    const isNewDay =
      now.getUTCFullYear() !== lastReset.getUTCFullYear() ||
      now.getUTCMonth() !== lastReset.getUTCMonth() ||
      now.getUTCDate() !== lastReset.getUTCDate();

    if (isNewDay) {
      await this.databaseService.withdrawalLimit.update({
        where: { customerId },
        data: {
          dailyWithdrawn: new Decimal(0),
          lastResetDate: now,
        },
      });
      this.logger.log(`Reset daily withdrawal limit for customer ${customerId}`);
    }
  }

  /**
   * Check if withdrawal amount is within daily limit
   */
  async checkDailyLimit(
    customerId: string,
    amount: Decimal,
  ): Promise<{ allowed: boolean; currentLimit: Decimal; used: Decimal; remaining: Decimal }> {
    await this.resetDailyLimitIfNeeded(customerId);

    const limit = await this.getOrCreateWithdrawalLimit(customerId);

    // Determine the current limit (approved limit if increased, else default)
    const currentLimit = limit.isLimitIncreased && limit.approvedDailyLimit
      ? limit.approvedDailyLimit
      : limit.dailyLimit;

    const used = limit.dailyWithdrawn;
    const remaining = currentLimit.minus(used);
    const allowed = amount.lte(remaining);

    return {
      allowed,
      currentLimit,
      used,
      remaining,
    };
  }

  /**
   * Record withdrawal amount
   */
  async recordWithdrawal(customerId: string, amount: Decimal): Promise<void> {
    await this.resetDailyLimitIfNeeded(customerId);

    const limit = await this.getOrCreateWithdrawalLimit(customerId);
    const newDailyWithdrawn = limit.dailyWithdrawn.plus(amount);

    await this.databaseService.withdrawalLimit.update({
      where: { customerId },
      data: {
        dailyWithdrawn: newDailyWithdrawn,
      },
    });

    this.logger.log(
      `Recorded withdrawal of ${amount.toString()} for customer ${customerId}. Daily total: ${newDailyWithdrawn.toString()}`,
    );
  }

  /**
   * Get withdrawal limit info for a customer
   */
  async getWithdrawalLimitInfo(customerId: string) {
    await this.resetDailyLimitIfNeeded(customerId);

    const limit = await this.getOrCreateWithdrawalLimit(customerId);

    const currentLimit = limit.isLimitIncreased && limit.approvedDailyLimit
      ? limit.approvedDailyLimit
      : limit.dailyLimit;

    return {
      dailyLimit: limit.dailyLimit,
      approvedDailyLimit: limit.approvedDailyLimit,
      currentLimit,
      dailyWithdrawn: limit.dailyWithdrawn,
      remaining: currentLimit.minus(limit.dailyWithdrawn),
      isLimitIncreased: limit.isLimitIncreased,
      lastResetDate: limit.lastResetDate,
    };
  }
}

