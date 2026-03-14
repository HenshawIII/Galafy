import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service.js';
import {
  AdminLoginDto,
  AdminRefreshTokenDto,
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
} from './dto/admin-login.dto.js';
import { EmailService } from '../../users/email.service.js';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
  ) {}

  /**
   * Hash password using bcrypt
   */
  async hashPassword(password: string): Promise<string> {
    const saltRounds = 10;
    return bcrypt.hash(password, saltRounds);
  }

  /**
   * Validate password against hash
   */
  async validatePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  /**
   * Check if admin account is locked
   */
  isAccountLocked(admin: { lockedUntil: Date | null }): boolean {
    if (!admin.lockedUntil) {
      return false;
    }
    return new Date() < admin.lockedUntil;
  }

  /**
   * Handle failed login attempt
   */
  async handleFailedLogin(adminId: string): Promise<void> {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
    });

    if (!admin) {
      return;
    }

    const newFailedAttempts = admin.failedLoginAttempts + 1;
    const shouldLock = newFailedAttempts >= this.MAX_FAILED_ATTEMPTS;

    const updateData: any = {
      failedLoginAttempts: newFailedAttempts,
    };

    if (shouldLock) {
      const lockedUntil = new Date();
      lockedUntil.setMinutes(lockedUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES);
      updateData.lockedUntil = lockedUntil;
      this.logger.warn(`Admin account ${admin.email} locked due to ${newFailedAttempts} failed login attempts`);
    }

    await this.databaseService.admin.update({
      where: { id: adminId },
      data: updateData,
    });
  }

  /**
   * Reset failed login attempts on successful login
   */
  async resetFailedAttempts(adminId: string): Promise<void> {
    await this.databaseService.admin.update({
      where: { id: adminId },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date(),
      },
    });
  }

  /**
   * Generate JWT tokens for admin
   */
  async generateTokens(admin: { id: string; email: string; role: string }) {
    const payload = {
      sub: admin.id,
      email: admin.email,
      role: admin.role,
      type: 'admin_access',
    };

    const accessToken = this.jwtService.sign(payload, {
      expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
      secret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
    } as any);

    const refreshPayload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin_refresh',
    };

    const refreshToken = this.jwtService.sign(refreshPayload, {
      expiresIn: process.env.ADMIN_REFRESH_JWT_EXPIRES_IN || '7d',
      secret: process.env.ADMIN_REFRESH_JWT_SECRET || process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
    } as any);

    return {
      accessToken,
      refreshToken,
    };
  }

  /**
   * Admin login
   */
  async login(loginDto: AdminLoginDto) {
    // Find admin by email (case-insensitive)
    const admin = await this.databaseService.admin.findFirst({
      where: {
        email: {
          equals: loginDto.email,
          mode: 'insensitive',
        },
      },
    });

    if (!admin) {
      // Don't reveal if admin exists or not
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account is active
    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Check if account is locked
    if (this.isAccountLocked(admin)) {
      const minutesRemaining = Math.ceil((admin.lockedUntil!.getTime() - new Date().getTime()) / 60000);
      throw new UnauthorizedException(`Account is locked. Please try again in ${minutesRemaining} minute(s).`);
    }

    // Verify password
    const isPasswordValid = await this.validatePassword(loginDto.password, admin.password);

    if (!isPasswordValid) {
      await this.handleFailedLogin(admin.id);
      throw new UnauthorizedException('Invalid email or password');
    }

    // Reset failed attempts on successful login
    await this.resetFailedAttempts(admin.id);

    // Generate tokens
    const tokens = await this.generateTokens(admin);

    // Remove sensitive data from response
    const { password, ...adminWithoutPassword } = admin;

    return {
      ...tokens,
      admin: adminWithoutPassword,
    };
  }

  /**
   * Refresh admin access token
   */
  async refreshToken(refreshTokenDto: AdminRefreshTokenDto) {
    try {
      const payload = this.jwtService.verify(refreshTokenDto.refreshToken, {
        secret: process.env.ADMIN_REFRESH_JWT_SECRET || process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
      });

      if (payload.type !== 'admin_refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      const admin = await this.databaseService.admin.findUnique({
        where: { id: payload.sub },
      });

      if (!admin || !admin.isActive) {
        throw new UnauthorizedException('Admin not found or inactive');
      }

      // Generate new tokens
      const tokens = await this.generateTokens(admin);

      return tokens;
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        throw error;
      }
      throw new UnauthorizedException('Invalid or expired refresh token');
    }
  }

  /**
   * Logout admin (invalidate refresh token)
   * Note: For JWT, we can't truly invalidate without a token blacklist
   * This is a placeholder for future implementation with Redis blacklist
   */
  async logout(adminId: string): Promise<{ message: string }> {
    // Future: Add token to blacklist in Redis
    return { message: 'Logged out successfully' };
  }

  /**
   * Generate secure random token for password reset
   */
  private generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  /**
   * Forgot password - send password reset link via email
   */
  async forgotPassword(forgotPasswordDto: AdminForgotPasswordDto): Promise<{ message: string }> {
    // Find admin by email (case-insensitive)
    const admin = await this.databaseService.admin.findFirst({
      where: {
        email: {
          equals: forgotPasswordDto.email,
          mode: 'insensitive',
        },
      },
    });

    if (!admin) {
      // Don't reveal if admin exists or not for security
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    // Check if account is active
    if (!admin.isActive) {
      // Still return generic message for security
      return { message: 'If the email exists, a password reset link has been sent' };
    }

    // Generate reset token
    const resetToken = this.generatePasswordResetToken();
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + 15); // 15 minutes expiration

    // Update admin with reset token
    await this.databaseService.admin.update({
      where: { id: admin.id },
      data: {
        passwordResetToken: resetToken,
        passwordResetTokenExpiresAt: expiresAt,
      },
    });

    // Construct reset link
    const baseUrl = process.env.ADMIN_PORTAL_URL || process.env.PUBLIC_URL || 'http://localhost:3000';
    const resetLink = `${baseUrl}/admin/reset-password?token=${resetToken}`;

    // Send password reset email
    try {
      await this.emailService.sendAdminPasswordResetLink(admin.email, resetLink, resetToken);
    } catch (emailError: any) {
      this.logger.error(`Failed to send admin password reset email to ${admin.email}:`, emailError.message);
      // Still return success message for security (don't reveal if email exists)
    }

    return { message: 'If the email exists, a password reset link has been sent' };
  }

  /**
   * Reset password using token from email
   */
  async resetPassword(resetPasswordDto: AdminResetPasswordDto): Promise<{ message: string }> {
    // Find admin by reset token
    const admin = await this.databaseService.admin.findUnique({
      where: {
        passwordResetToken: resetPasswordDto.token,
      },
    });

    if (!admin) {
      throw new UnauthorizedException('Invalid or expired password reset token');
    }

    // Check if token has expired
    if (!admin.passwordResetTokenExpiresAt || admin.passwordResetTokenExpiresAt < new Date()) {
      // Clear expired token
      await this.databaseService.admin.update({
        where: { id: admin.id },
        data: {
          passwordResetToken: null,
          passwordResetTokenExpiresAt: null,
        },
      });
      throw new UnauthorizedException('Password reset token has expired. Please request a new one.');
    }

    // Check if account is active
    if (!admin.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    // Hash new password
    const hashedPassword = await this.hashPassword(resetPasswordDto.newPassword);

    // Update password and clear reset token
    await this.databaseService.admin.update({
      where: { id: admin.id },
      data: {
        password: hashedPassword,
        passwordResetToken: null,
        passwordResetTokenExpiresAt: null,
        failedLoginAttempts: 0, // Reset failed attempts on password reset
        lockedUntil: null, // Unlock account if locked
      },
    });

    this.logger.log(`Admin password reset successful for ${admin.email}`);

    return { message: 'Password reset successfully. You can now log in with your new password.' };
  }
}
