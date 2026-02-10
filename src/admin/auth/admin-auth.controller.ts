import {
  Controller,
  Post,
  Body,
  UseGuards,
  ValidationPipe,
  Request,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminLoginDto, AdminRefreshTokenDto, AdminForgotPasswordDto, AdminResetPasswordDto } from './dto/admin-login.dto.js';
import { AdminJwtAuthGuard } from './admin-jwt-auth.guard.js';
import { AdminPublic } from './decorators/public.decorator.js';

@ApiTags('admin-auth')
@Controller('admin/auth')
export class AdminAuthController {
  constructor(private readonly adminAuthService: AdminAuthService) {}

  @Post('login')
  @AdminPublic()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Admin login',
    description:
      'Authenticate admin with email and password. Rate limited to 5 attempts per 15 minutes.',
  })
  @ApiBody({ type: AdminLoginDto })
  @ApiResponse({
    status: 200,
    description: 'Admin logged in successfully',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        admin: {
          id: 'admin-uuid',
          email: 'admin@example.com',
          role: 'SUPER_ADMIN',
          isActive: true,
          createdAt: '2025-01-25T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials or account locked',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many login attempts. Please try again later.',
  })
  async login(@Body(ValidationPipe) loginDto: AdminLoginDto) {
    return this.adminAuthService.login(loginDto);
  }

  @Post('refresh')
  @AdminPublic()
  @ApiOperation({
    summary: 'Refresh admin access token',
    description: 'Get a new access token using a valid refresh token',
  })
  @ApiBody({ type: AdminRefreshTokenDto })
  @ApiResponse({
    status: 200,
    description: 'Token refreshed successfully',
    schema: {
      example: {
        accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refreshToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired refresh token',
  })
  async refreshToken(
    @Body(ValidationPipe) refreshTokenDto: AdminRefreshTokenDto,
  ) {
    return this.adminAuthService.refreshToken(refreshTokenDto);
  }

  @Post('logout')
  @UseGuards(AdminJwtAuthGuard)
  @ApiBearerAuth('bearer')
  @ApiOperation({
    summary: 'Admin logout',
    description: 'Logout admin (invalidate session)',
  })
  @ApiResponse({
    status: 200,
    description: 'Logged out successfully',
    schema: {
      example: {
        message: 'Logged out successfully',
      },
    },
  })
  @ApiUnauthorizedResponse({
    description: 'Unauthorized - Invalid or expired token',
  })
  async logout(@Request() req: any) {
    const adminId = req.admin?.id;
    return this.adminAuthService.logout(adminId);
  }

  @Post('forgot-password')
  @AdminPublic()
  @Throttle({ default: { limit: 5, ttl: 900000 } }) // 5 attempts per 15 minutes
  @ApiOperation({
    summary: 'Request password reset',
    description: 'Send password reset link to admin email. Rate limited to 5 attempts per 15 minutes.',
  })
  @ApiBody({ type: AdminForgotPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset link sent successfully (if email exists)',
    schema: {
      example: {
        message: 'If the email exists, a password reset link has been sent',
      },
    },
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests. Please try again later.',
  })
  async forgotPassword(@Body(ValidationPipe) forgotPasswordDto: AdminForgotPasswordDto) {
    return this.adminAuthService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @AdminPublic()
  @ApiOperation({
    summary: 'Reset password with token',
    description: 'Reset admin password using token from email. This endpoint is public and does not require authentication.',
  })
  @ApiBody({ type: AdminResetPasswordDto })
  @ApiResponse({
    status: 200,
    description: 'Password reset successfully',
    schema: {
      example: {
        message: 'Password reset successfully. You can now log in with your new password.',
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired token',
  })
  async resetPassword(@Body(ValidationPipe) resetPasswordDto: AdminResetPasswordDto) {
    return this.adminAuthService.resetPassword(resetPasswordDto);
  }
}

