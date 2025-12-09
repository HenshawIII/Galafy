import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../../users/email.service.js';

@Injectable()
export class PayoutSecurityService {
  private readonly logger = new Logger(PayoutSecurityService.name);
  private readonly OTP_EXPIRY_MINUTES = 10; // OTP expires in 10 minutes

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Set or update payout PIN for a user
   */
  async setPayoutPin(userId: string, pin: string): Promise<void> {
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException('PIN must be exactly 4 digits');
    }

    // Hash the PIN
    const hashedPin = await bcrypt.hash(pin, 10);

    // Update user with hashed PIN
    await this.databaseService.user.update({
      where: { id: userId },
      data: { payoutPin: hashedPin },
    });

    this.logger.log(`Payout PIN set for user ${userId}`);
  }

  /**
   * Verify payout PIN
   */
  async verifyPayoutPin(userId: string, pin: string): Promise<boolean> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { payoutPin: true },
    });

    if (!user || !user.payoutPin) {
      throw new BadRequestException('Payout PIN has not been set. Please set your PIN first.');
    }

    return await bcrypt.compare(pin, user.payoutPin);
  }

  /**
   * Generate and send OTP for payout confirmation
   */
  async generateAndSendOtp(userId: string): Promise<string> {
    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.OTP_EXPIRY_MINUTES);

    // Get user email
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { email: true },
    });

    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Store OTP and expiration in database
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        payoutOtp: otp,
        payoutOtpExpiresAt: expiresAt,
      },
    });

    // Send OTP via email
    try {
      await this.emailService.sendPayoutOtp(user.email, otp);
      this.logger.log(`Payout OTP sent to ${user.email} for user ${userId}`);
    } catch (error) {
      this.logger.error(`Failed to send payout OTP email: ${error.message}`);
      // Don't throw error - OTP is still stored, user can request resend
    }

    return otp;
  }

  /**
   * Verify OTP
   */
  async verifyOtp(userId: string, otp: string): Promise<boolean> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: {
        payoutOtp: true,
        payoutOtpExpiresAt: true,
      },
    });

    if (!user || !user.payoutOtp) {
      throw new BadRequestException('No OTP found. Please initiate a payout first.');
    }

    // Check if OTP has expired
    if (!user.payoutOtpExpiresAt || new Date() > user.payoutOtpExpiresAt) {
      // Clear expired OTP
      await this.databaseService.user.update({
        where: { id: userId },
        data: {
          payoutOtp: null,
          payoutOtpExpiresAt: null,
        },
      });
      throw new BadRequestException('OTP has expired. Please request a new OTP.');
    }

    // Verify OTP
    if (user.payoutOtp !== otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Clear OTP after successful verification
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        payoutOtp: null,
        payoutOtpExpiresAt: null,
      },
    });

    return true;
  }

  /**
   * Store pending payout data temporarily
   */
  async storePendingPayout(userId: string, payoutData: any): Promise<void> {
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        pendingPayoutData: payoutData as any,
      },
    });
  }

  /**
   * Retrieve and clear pending payout data
   */
  async getAndClearPendingPayout(userId: string): Promise<any | null> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { pendingPayoutData: true },
    });

    if (!user || !user.pendingPayoutData) {
      return null;
    }

    // Clear pending payout data
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        pendingPayoutData: undefined,
      },
    });

    return user.pendingPayoutData;
  }
}

