import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ValidationPipe, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody, ApiBearerAuth, ApiUnauthorizedResponse } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto, UpdateUserDto, SignupDto, LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyAccountDto, ResendVerificationDto } from './dto/create-user-dto.js';
import { Throttle, SkipThrottle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { Public } from '../auth/public.decorator.js';

@ApiTags('users')
@Controller('users')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('bearer')
@ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('signup')
  @Public()
  @ApiOperation({ summary: 'User signup' })
  @ApiBody({ schema: { properties: {  email: { type: 'string' }, username: { type: 'string' }, password: { type: 'string' }, phone: { type: 'string' }, kycTier: { type: 'string' } } } })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'User already exists or validation failed' })
  signup(@Body(ValidationPipe) signupDto: SignupDto) {
    return this.usersService.signup(signupDto);
  }

  @Post('verify')
  @Public()
  @ApiOperation({ summary: 'Verify account after signup' })
  @ApiBody({ schema: { properties: { email: { type: 'string' }, verificationCode: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Account verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Account already verified' })
  verifyAccount(@Body(ValidationPipe) verifyAccountDto: VerifyAccountDto) {
    return this.usersService.verifyAccount(verifyAccountDto);
  }

  @Post('resend-verification')
  @Public()
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiBody({ schema: { properties: { email: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Verification code resent successfully' })
  @ApiResponse({ status: 400, description: 'Account already verified' })
  resendVerificationCode(@Body(ValidationPipe) resendVerificationDto: ResendVerificationDto) {
    return this.usersService.resendVerificationCode(resendVerificationDto);
  }

  @Post('login')
  @Public()
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ 
    status: 200, 
    description: 'Login successful, returns access token, refresh token, user details, and KYC status',
    schema: {
      example: {
        access_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        refresh_token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
        user: {
          id: 'uuid',
          email: 'user@example.com',
          firstName: 'John',
          lastName: 'Doe',
        },
        kycStatus: {
          customerId: 'uuid',
          tier: 'Tier_1',
          providerTierCode: 'TIER_1',
          hasNin: false,
          hasBvn: true,
          hasAddressVerification: false,
        }
      }
    }
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.usersService.login(loginDto);
  }

  @Post('forgot-password')
  @Public()
  @ApiOperation({ summary: 'Forgot password - sends OTP to email' })
  @ApiBody({ schema: { properties: { email: { type: 'string' } } } })
  @ApiResponse({ status: 200, description: 'Password reset OTP sent successfully' })
  @ApiResponse({ status: 400, description: 'Email not found' })
  forgotPassword(@Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto) {
    return this.usersService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @Public()
  @ApiOperation({ summary: 'Reset password using OTP' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid OTP or expired' })
  @ApiResponse({ status: 401, description: 'Invalid or expired OTP' })
  resetPassword(@Body(ValidationPipe) resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(resetPasswordDto);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get user details with customer information and KYC status' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiResponse({ status: 404, description: 'User or customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  getUserDetails(@Param('id') id: string) {
    return this.usersService.getUserDetails(id);
  }

  // @Post()
  // create(@Body(ValidationPipe) createUserDto: CreateUserDto) {
  //   return this.usersService.create(createUserDto);
  // }

  // @Throttle({short:{ttl:60000,limit:3}})
  // @Get()
  // findAll() {
  //   return this.usersService.findAll();
  // }

  // @Get('email')
  // findByEmail(@Query('email') email: string) {
  //   return this.usersService.findByEmail(email);
  // }
  
  // @SkipThrottle({default:false})
  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.usersService.findOne(id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body(ValidationPipe) updateUserDto: UpdateUserDto) {
  //   return this.usersService.update(id, updateUserDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.usersService.remove(id);
  // }
}

