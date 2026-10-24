import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomInt } from 'crypto';
import { DatabaseService } from '../database/database.service.js';
import {
  REFERRAL_BALANCE_PLACEHOLDER,
  REFERRAL_CODE_ALPHABET,
  REFERRAL_CODE_LENGTH,
  REFERRAL_ERRORS,
} from './referral.constants.js';

@Injectable()
export class ReferralsService {
  private readonly logger = new Logger(ReferralsService.name);
  private readonly MAX_CODE_ATTEMPTS = 12;

  constructor(private readonly databaseService: DatabaseService) {}

  normalizeCode(code: string): string {
    return code.trim().toUpperCase();
  }

  private generateRandomCode(): string {
    let code = '';
    for (let i = 0; i < REFERRAL_CODE_LENGTH; i++) {
      code += REFERRAL_CODE_ALPHABET[randomInt(REFERRAL_CODE_ALPHABET.length)];
    }
    return code;
  }

  async generateUniqueCode(): Promise<string> {
    for (let attempt = 0; attempt < this.MAX_CODE_ATTEMPTS; attempt++) {
      const code = this.generateRandomCode();
      const existing = await this.databaseService.user.findUnique({
        where: { referralCode: code },
        select: { id: true },
      });
      if (!existing) {
        return code;
      }
    }
    throw new BadRequestException('Unable to generate a unique referral code. Please try again.');
  }

  /**
   * Ensure the user has a referral code; generate and persist if missing.
   */
  async ensureUserReferralCode(userId: string): Promise<string> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { id: true, referralCode: true },
    });
    if (!user) {
      throw new BadRequestException('User not found');
    }
    if (user.referralCode) {
      return user.referralCode;
    }

    for (let attempt = 0; attempt < this.MAX_CODE_ATTEMPTS; attempt++) {
      const code = this.generateRandomCode();
      try {
        const updated = await this.databaseService.user.update({
          where: { id: userId },
          data: { referralCode: code },
          select: { referralCode: true },
        });
        return updated.referralCode as string;
      } catch (error: unknown) {
        // Unique collision — retry
        this.logger.warn(`Referral code collision for user ${userId}, retrying`);
      }
    }

    // Re-read in case another request won the race
    const again = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { referralCode: true },
    });
    if (again?.referralCode) {
      return again.referralCode;
    }
    throw new BadRequestException('Unable to generate a unique referral code. Please try again.');
  }

  /**
   * Public validation — does not reveal whether the referrer opted out of other privacy settings.
   */
  async validateCode(rawCode: string): Promise<{
    valid: boolean;
    code?: string;
    referrer?: {
      id: string;
      username: string | null;
      firstName: string | null;
      lastName: string | null;
    };
  }> {
    const code = this.normalizeCode(rawCode);
    if (!/^[A-Z0-9]{8}$/.test(code)) {
      return { valid: false };
    }

    const owner = await this.databaseService.user.findUnique({
      where: { referralCode: code },
      select: {
        id: true,
        username: true,
        firstName: true,
        lastName: true,
      },
    });

    if (!owner) {
      return { valid: false };
    }

    return {
      valid: true,
      code,
      referrer: {
        id: owner.id,
        username: owner.username,
        firstName: owner.firstName,
        lastName: owner.lastName,
      },
    };
  }

  /**
   * Throws BadRequestException with a stable message if the code is invalid.
   * Used before email signup so no user row is created.
   */
  async assertValidReferralCode(rawCode: string): Promise<{
    code: string;
    referrerId: string;
  }> {
    const result = await this.validateCode(rawCode);
    if (!result.valid || !result.referrer || !result.code) {
      throw new BadRequestException(REFERRAL_ERRORS.INVALID);
    }
    return { code: result.code, referrerId: result.referrer.id };
  }

  async attributeReferral(referredUserId: string, rawCode: string): Promise<{
    referrerId: string;
    codeUsed: string;
    createdAt: Date;
  }> {
    const { code, referrerId } = await this.assertValidReferralCode(rawCode);

    if (referrerId === referredUserId) {
      throw new BadRequestException(REFERRAL_ERRORS.SELF);
    }

    const existing = await this.databaseService.referral.findUnique({
      where: { referredUserId },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException(REFERRAL_ERRORS.ALREADY_ATTRIBUTED);
    }

    try {
      const row = await this.databaseService.referral.create({
        data: {
          referrerId,
          referredUserId,
          codeUsed: code,
        },
        select: {
          referrerId: true,
          codeUsed: true,
          createdAt: true,
        },
      });
      return row;
    } catch (error: unknown) {
      // Unique on referredUserId — race
      const again = await this.databaseService.referral.findUnique({
        where: { referredUserId },
        select: { id: true },
      });
      if (again) {
        throw new BadRequestException(REFERRAL_ERRORS.ALREADY_ATTRIBUTED);
      }
      throw error;
    }
  }

  async getReferralSummary(userId: string) {
    const referralCode = await this.ensureUserReferralCode(userId);

    const [received, given] = await Promise.all([
      this.databaseService.referral.findUnique({
        where: { referredUserId: userId },
        select: {
          createdAt: true,
          referrer: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
      this.databaseService.referral.findMany({
        where: { referrerId: userId },
        orderBy: { createdAt: 'desc' },
        select: {
          createdAt: true,
          referredUser: {
            select: {
              id: true,
              username: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      }),
    ]);

    return {
      referralCode,
      /** Earned referral balance; placeholder until earnings are implemented. */
      referralBalance: REFERRAL_BALANCE_PLACEHOLDER,
      referredBy: received
        ? {
            id: received.referrer.id,
            username: received.referrer.username,
            firstName: received.referrer.firstName,
            lastName: received.referrer.lastName,
            attributedAt: received.createdAt.toISOString(),
          }
        : null,
      referrals: given.map((row) => ({
        id: row.referredUser.id,
        username: row.referredUser.username,
        firstName: row.referredUser.firstName,
        lastName: row.referredUser.lastName,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Claim earned referral balance.
   * Stub until earnings / payout flow is implemented.
   */
  async claimReferralBalance(_userId: string): Promise<never> {
    throw new BadRequestException(REFERRAL_ERRORS.CLAIM_UNAVAILABLE);
  }
}
