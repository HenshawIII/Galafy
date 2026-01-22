import { Injectable, BadRequestException, UnauthorizedException, Logger } from '@nestjs/common';
import { DatabaseService } from '../../database/database.service.js';
import * as bcrypt from 'bcrypt';
import { EmailService } from '../../users/email.service.js';
import { Prisma } from '@prisma/client';

@Injectable()
export class PayoutSecurityService {
  private readonly logger = new Logger(PayoutSecurityService.name);
  private readonly OTP_EXPIRY_MINUTES = 10; // OTP expires in 10 minutes
  private readonly PIN_RESET_OTP_EXPIRY_MINUTES = 15; // PIN reset OTP expires in 15 minutes

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Set payout PIN for a user (first time setup only)
   */
  async setPayoutPin(userId: string, pin: string): Promise<void> {
    // Validate PIN format
    if (!/^\d{4}$/.test(pin)) {
      throw new BadRequestException('PIN must be exactly 4 digits');
    }

    // Check if PIN already exists
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { payoutPin: true },
    });

    if (user && user.payoutPin) {
      throw new BadRequestException('Payout PIN already exists. Use the update endpoint to change your PIN.');
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
   * Reset payout PIN - Generate and send OTP to user's email
   */
  async resetPayoutPin(emailAddress: string): Promise<void> {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: emailAddress },
      select: { id: true, email: true, payoutPin: true },
    });

    // Don't reveal if user exists or not for security
    if (!user) {
      // Still return success message - don't reveal if email exists
      return;
    }

    // Check if PIN has been set
    if (!user.payoutPin) {
      // Don't reveal if PIN is set or not - just return success
      return;
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();

    // Calculate expiration time (15 minutes)
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + this.PIN_RESET_OTP_EXPIRY_MINUTES);

    // Store OTP and expiration in database
    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        pinResetOtp: otp,
        pinResetOtpExpiresAt: expiresAt,
      },
    });

    // Send OTP via email
    try {
      await this.emailService.sendPinResetOtp(user.email, otp);
      this.logger.log(`PIN reset OTP sent to ${user.email} for user ${user.id}`);
    } catch (error) {
      this.logger.error(`Failed to send PIN reset OTP email: ${error.message}`);
      // Don't throw error - OTP is still stored, user can request resend
    }
  }

  /**
   * Verify PIN reset OTP
   */
  async verifyPinResetOtp(userId: string, otp: string): Promise<boolean> {
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: {
        pinResetOtp: true,
        pinResetOtpExpiresAt: true,
      },
    });

    if (!user || !user.pinResetOtp) {
      throw new BadRequestException('No PIN reset OTP found. Please request a PIN reset first.');
    }

    // Check if OTP has expired
    if (!user.pinResetOtpExpiresAt || new Date() > user.pinResetOtpExpiresAt) {
      // Clear expired OTP
      await this.databaseService.user.update({
        where: { id: userId },
        data: {
          pinResetOtp: null,
          pinResetOtpExpiresAt: null,
        },
      });
      throw new BadRequestException('PIN reset OTP has expired. Please request a new OTP.');
    }

    // Verify OTP
    if (user.pinResetOtp !== otp) {
      throw new UnauthorizedException('Invalid PIN reset OTP');
    }

    // Clear OTP after successful verification
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        pinResetOtp: null,
        pinResetOtpExpiresAt: null,
      },
    });

    return true;
  }

  /**
   * Update payout PIN for a user (requires OTP verification)
   */
  async updatePayoutPin(userId: string, otp: string, newPin: string): Promise<void> {
    // Validate PIN format
    if (!/^\d{4}$/.test(newPin)) {
      throw new BadRequestException('New PIN must be exactly 4 digits');
    }

    // Validate OTP format
    if (!/^\d{6}$/.test(otp)) {
      throw new BadRequestException('OTP must be exactly 6 digits');
    }

    // Get user's current PIN
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      select: { payoutPin: true },
    });

    if (!user || !user.payoutPin) {
      throw new BadRequestException('Payout PIN has not been set. Please set your PIN first using the create endpoint.');
    }

    // Verify OTP
    await this.verifyPinResetOtp(userId, otp);

    // Check if new PIN is different from old PIN
    const isSamePin = await bcrypt.compare(newPin, user.payoutPin);
    if (isSamePin) {
      throw new BadRequestException('New PIN must be different from the current PIN');
    }

    // Hash the new PIN
    const hashedNewPin = await bcrypt.hash(newPin, 10);

    // Update user with new hashed PIN
    await this.databaseService.user.update({
      where: { id: userId },
      data: { payoutPin: hashedNewPin },
    });

    this.logger.log(`Payout PIN updated for user ${userId}`);
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

    // Clear pending payout data and field
    // Note: Use type assertion to set JSON field to null in Prisma
    await this.databaseService.user.update({
      where: { id: userId },
      data: {
        pendingPayoutData: null as any,
      },
    });

    return user.pendingPayoutData;
  }
}

