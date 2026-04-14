import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  ValidationPipe,
  UseGuards,
  Request,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import {
  CreateUserDto,
  UpdateUserDto,
  SignupDto,
  LoginDto,
  ResetPasswordDto,
  ForgotPasswordDto,
  VerifyAccountDto,
  ResendVerificationDto,
  UpdateUserProfileDto,
} from './dto/create-user-dto.js';
import { UserSettingsDto, UpdateUserSettingsDto } from './dto/user-settings.dto.js';
import { SearchUserDto } from './dto/search-user.dto.js';
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
  @ApiBody({
    schema: {
      properties: {
        email: { type: 'string' },
        username: { type: 'string' },
        password: { type: 'string' },
        phone: { type: 'string' },
      },
    },
  })
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
    description:
      'Login successful, returns access token, refresh token, user details, KYC status, and verification status',
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
        },
        isVerified: 'true',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 409, description: 'User already logged in on another device. Please log out first.' })
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

  @Patch('profile')
  @ApiOperation({ summary: 'Update user profile (username and profilePicture)' })
  @ApiBody({ type: UpdateUserProfileDto })
  @ApiResponse({
    status: 200,
    description: 'User profile updated successfully',
    schema: {
      example: {
        id: 'uuid',
        email: 'user@example.com',
        username: 'newusername',
        profilePicture: 'https://example.com/profile.jpg',
        firstName: 'John',
        lastName: 'Doe',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiResponse({ status: 404, description: 'User not found' })
  @ApiResponse({ status: 409, description: 'Username already taken' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  updateUserProfile(@Request() req: any, @Body(ValidationPipe) updateUserProfileDto: UpdateUserProfileDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }
    return this.usersService.updateUserProfile(userId, updateUserProfileDto);
  }

  @Get(':id/details')
  @ApiOperation({ summary: 'Get user details with customer information and KYC status' })
  @ApiParam({ name: 'id', description: 'User ID' })
  @ApiResponse({ status: 200, description: 'User details retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - You can only access your own user details' })
  @ApiResponse({ status: 404, description: 'User or customer not found' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  getUserDetails(@Request() req: any, @Param('id') id: string) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }

    // Ensure users can only access their own details
    if (userId !== id) {
      throw new ForbiddenException('You can only access your own user details.');
    }

    return this.usersService.getUserDetails(id);
  }

  @Get('settings')
  @ApiOperation({ summary: 'Get current user settings' })
  @ApiResponse({
    status: 200,
    description: 'User settings retrieved successfully',
    type: UserSettingsDto,
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  getUserSettings(@Request() req: any) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }
    return this.usersService.getUserSettings(userId);
  }

  @Patch('settings')
  @ApiOperation({ summary: 'Update current user settings' })
  @ApiBody({ type: UpdateUserSettingsDto })
  @ApiResponse({
    status: 200,
    description: 'User settings updated successfully',
    type: UserSettingsDto,
  })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  updateUserSettings(@Request() req: any, @Body(ValidationPipe) updateUserSettingsDto: UpdateUserSettingsDto) {
    const userId = req.user?.id;
    if (!userId) {
      throw new BadRequestException('User ID is required. Please ensure you are authenticated.');
    }
    return this.usersService.updateUserSettings(userId, updateUserSettingsDto);
  }

  @Get('search')
  @ApiOperation({ summary: 'Search users by username' })
  @ApiQuery({ name: 'query', required: false, description: 'Search query for username (case-insensitive)' })
  @ApiQuery({ name: 'page', required: false, type: Number, description: 'Page number (default: 1)' })
  @ApiQuery({ name: 'pageSize', required: false, type: Number, description: 'Items per page (default: 20, max: 100)' })
  @ApiResponse({
    status: 200,
    description: 'Users found successfully',
    schema: {
      example: {
        users: [
          {
            id: 'uuid',
            username: 'johndoe',
            firstName: 'John',
            lastName: 'Doe',
            profilePicture: 'https://example.com/profile.jpg',
            email: 'john@example.com',
            createdAt: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 20,
        totalPages: 1,
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Unauthorized - Invalid or expired token. Please log in again.' })
  searchUsers(@Query(ValidationPipe) searchDto: SearchUserDto) {
    return this.usersService.searchUsers(searchDto);
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
