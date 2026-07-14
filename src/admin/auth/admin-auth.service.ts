import { Injectable, UnauthorizedException, BadRequestException, NotFoundException, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service.js';
import {
  AdminLoginDto,
  AdminRefreshTokenDto,
  AdminForgotPasswordDto,
  AdminResetPasswordDto,
} from './dto/admin-login.dto.js';
import { AdminTwoFactorCodeDto, AdminVerifyTwoFactorLoginDto } from './dto/admin-2fa.dto.js';
import { AdminSecretCryptoService } from './admin-secret-crypto.service.js';
import { EmailService } from '../../users/email.service.js';
import { generateSecret, generateURI, verify } from 'otplib';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;
  private readonly mandatory2FAKey = 'ADMIN_MANDATORY_2FA_ENABLED';

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly secretCrypto: AdminSecretCryptoService,
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

    // Reset failed attempts on successful password verification
    await this.resetFailedAttempts(admin.id);

    const mandatory2FAEnabled = await this.isMandatory2FAEnabled();

    if (mandatory2FAEnabled && !admin.twoFactorEnabled) {
      return {
        requires2FAEnrollment: true,
        message: 'Two-factor authentication setup is required before signing in. Please contact a super admin if this persists.',
      };
    }

    if (admin.twoFactorEnabled || mandatory2FAEnabled) {
      const tempToken = this.jwtService.sign(
        {
          sub: admin.id,
          email: admin.email,
          type: 'admin_2fa_pending',
        },
        {
          expiresIn: '5m',
          secret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
        } as any,
      );

      return {
        requires2FA: true,
        tempToken,
      };
    }

    // Generate tokens
    const tokens = await this.generateTokens(admin);

    await this.databaseService.adminActionLog.create({
      data: {
        adminId: admin.id,
        actionType: 'ADMIN_LOGIN',
        targetType: 'ADMIN',
        targetId: admin.id,
        details: { via: 'password', email: admin.email },
      },
    });

    // Remove sensitive data from response
    const { password, twoFactorSecret, ...adminWithoutPassword } = admin;

    return {
      ...tokens,
      admin: adminWithoutPassword,
    };
  }

  async getTwoFactorStatus(adminId: string) {
    const admin = await this.databaseService.admin.findUnique({
      where: { id: adminId },
      select: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: true,
      },
    });

    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    return {
      twoFactorEnabled: admin.twoFactorEnabled,
      twoFactorEnabledAt: admin.twoFactorEnabledAt,
    };
  }

  async setupTwoFactor(adminId: string) {
    const admin = await this.databaseService.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      throw new NotFoundException('Admin not found');
    }

    const secret = generateSecret();
    const encryptedSecret = this.secretCrypto.encrypt(secret);
    const issuer = process.env.ADMIN_2FA_ISSUER || 'Galafy Admin';
    const otpauthUrl = generateURI({
      issuer,
      label: admin.email,
      secret,
    });

    await this.databaseService.admin.update({
      where: { id: adminId },
      data: {
        twoFactorSecret: encryptedSecret,
        twoFactorEnabled: false,
        twoFactorEnabledAt: null,
      },
    });

    return {
      otpauthUrl,
      secret,
    };
  }

  async enableTwoFactor(adminId: string, dto: AdminTwoFactorCodeDto) {
    const admin = await this.databaseService.admin.findUnique({ where: { id: adminId } });
    if (!admin?.twoFactorSecret) {
      throw new BadRequestException('2FA setup has not been started. Call setup first.');
    }

    const secret = this.secretCrypto.decrypt(admin.twoFactorSecret);
    if (!secret || !(await this.verifyTotpCode(secret, dto.code))) {
      throw new UnauthorizedException('Invalid authentication code');
    }

    await this.databaseService.admin.update({
      where: { id: adminId },
      data: {
        twoFactorEnabled: true,
        twoFactorEnabledAt: new Date(),
      },
    });

    return { message: 'Two-factor authentication enabled' };
  }

  async disableTwoFactor(adminId: string, dto: AdminTwoFactorCodeDto) {
    const admin = await this.databaseService.admin.findUnique({ where: { id: adminId } });
    if (!admin?.twoFactorEnabled || !admin.twoFactorSecret) {
      throw new BadRequestException('Two-factor authentication is not enabled');
    }

    const mandatory2FAEnabled = await this.isMandatory2FAEnabled();
    if (mandatory2FAEnabled) {
      throw new BadRequestException('Two-factor authentication is mandatory and cannot be disabled');
    }

    const secret = this.secretCrypto.decrypt(admin.twoFactorSecret);
    if (!secret || !(await this.verifyTotpCode(secret, dto.code))) {
      throw new UnauthorizedException('Invalid authentication code');
    }

    await this.databaseService.admin.update({
      where: { id: adminId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorEnabledAt: null,
      },
    });

    return { message: 'Two-factor authentication disabled' };
  }

  async verifyTwoFactorLogin(dto: AdminVerifyTwoFactorLoginDto) {
    let payload: { sub: string; email: string; type: string };
    try {
      payload = this.jwtService.verify(dto.tempToken, {
        secret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
      }) as typeof payload;
    } catch {
      throw new UnauthorizedException('Invalid or expired verification session. Please log in again.');
    }

    if (payload.type !== 'admin_2fa_pending') {
      throw new UnauthorizedException('Invalid verification session');
    }

    const admin = await this.databaseService.admin.findUnique({ where: { id: payload.sub } });
    if (!admin || !admin.isActive || !admin.twoFactorEnabled || !admin.twoFactorSecret) {
      throw new UnauthorizedException('Two-factor authentication is not available for this account');
    }

    const secret = this.secretCrypto.decrypt(admin.twoFactorSecret);
    if (!secret || !(await this.verifyTotpCode(secret, dto.code))) {
      await this.handleFailedLogin(admin.id);
      throw new UnauthorizedException('Invalid authentication code');
    }

    await this.resetFailedAttempts(admin.id);

    const tokens = await this.generateTokens(admin);
    const { password, twoFactorSecret, ...adminWithoutPassword } = admin;

    await this.databaseService.adminActionLog.create({
      data: {
        adminId: admin.id,
        actionType: 'ADMIN_LOGIN',
        targetType: 'ADMIN',
        targetId: admin.id,
        details: { via: '2fa', email: admin.email },
      },
    });

    return {
      ...tokens,
      admin: adminWithoutPassword,
    };
  }

  private async verifyTotpCode(secret: string, code: string): Promise<boolean> {
    const result = await verify({ secret, token: code, epochTolerance: 1 });
    return result.valid;
  }

  private async isMandatory2FAEnabled(): Promise<boolean> {
    try {
      const config = await this.databaseService.systemConfig.findUnique({
        where: { key: this.mandatory2FAKey },
        select: { value: true, isActive: true },
      });
      if (!config || !config.isActive) return false;
      return config.value.trim().toLowerCase() === 'true';
    } catch (error) {
      this.logger.warn(`Failed reading ${this.mandatory2FAKey}: ${(error as Error).message}`);
      return false;
    }
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
