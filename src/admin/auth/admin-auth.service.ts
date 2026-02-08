import {
  Injectable,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../../database/database.service.js';
import { AdminLoginDto, AdminRefreshTokenDto } from './dto/admin-login.dto.js';
import * as bcrypt from 'bcrypt';

@Injectable()
export class AdminAuthService {
  private readonly logger = new Logger(AdminAuthService.name);
  private readonly MAX_FAILED_ATTEMPTS = 5;
  private readonly LOCKOUT_DURATION_MINUTES = 30;

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
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
      lockedUntil.setMinutes(
        lockedUntil.getMinutes() + this.LOCKOUT_DURATION_MINUTES,
      );
      updateData.lockedUntil = lockedUntil;
      this.logger.warn(
        `Admin account ${admin.email} locked due to ${newFailedAttempts} failed login attempts`,
      );
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

    const accessToken = this.jwtService.sign(
      payload,
      {
        expiresIn: process.env.ADMIN_JWT_EXPIRES_IN || '8h',
        secret: process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET,
      } as any,
    );

    const refreshPayload = {
      sub: admin.id,
      email: admin.email,
      type: 'admin_refresh',
    };

    const refreshToken = this.jwtService.sign(
      refreshPayload,
      {
        expiresIn: process.env.ADMIN_REFRESH_JWT_EXPIRES_IN || '7d',
        secret:
          process.env.ADMIN_REFRESH_JWT_SECRET ||
          process.env.ADMIN_JWT_SECRET ||
          process.env.JWT_SECRET,
      } as any,
    );

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
      const minutesRemaining = Math.ceil(
        (admin.lockedUntil!.getTime() - new Date().getTime()) / 60000,
      );
      throw new UnauthorizedException(
        `Account is locked. Please try again in ${minutesRemaining} minute(s).`,
      );
    }

    // Verify password
    const isPasswordValid = await this.validatePassword(
      loginDto.password,
      admin.password,
    );

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
        secret:
          process.env.ADMIN_REFRESH_JWT_SECRET ||
          process.env.ADMIN_JWT_SECRET ||
          process.env.JWT_SECRET,
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
}

