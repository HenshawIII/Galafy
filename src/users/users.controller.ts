import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ValidationPipe } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import { UsersService } from './users.service.js';
import { CreateUserDto, UpdateUserDto, SignupDto, LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyAccountDto, ResendVerificationDto } from './dto/create-user-dto.js';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@ApiTags('users')
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('signup')
  @ApiOperation({ summary: 'User signup' })
  @ApiBody({ type: SignupDto })
  @ApiResponse({ status: 201, description: 'User created successfully' })
  @ApiResponse({ status: 400, description: 'User already exists or validation failed' })
  signup(@Body(ValidationPipe) signupDto: SignupDto) {
    return this.usersService.signup(signupDto);
  }

  @Post('verify')
  @ApiOperation({ summary: 'Verify account after signup' })
  @ApiBody({ type: VerifyAccountDto })
  @ApiResponse({ status: 200, description: 'Account verified successfully' })
  @ApiResponse({ status: 400, description: 'Invalid verification code' })
  @ApiResponse({ status: 401, description: 'Account already verified' })
  verifyAccount(@Body(ValidationPipe) verifyAccountDto: VerifyAccountDto) {
    return this.usersService.verifyAccount(verifyAccountDto);
  }

  @Post('resend-verification')
  @ApiOperation({ summary: 'Resend verification code' })
  @ApiBody({ type: ResendVerificationDto })
  @ApiResponse({ status: 200, description: 'Verification code resent successfully' })
  @ApiResponse({ status: 400, description: 'Account already verified' })
  resendVerificationCode(@Body(ValidationPipe) resendVerificationDto: ResendVerificationDto) {
    return this.usersService.resendVerificationCode(resendVerificationDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'User login' })
  @ApiBody({ type: LoginDto })
  @ApiResponse({ status: 200, description: 'Login successful, returns JWT token' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.usersService.login(loginDto);
  }

  @Post('forgot-password')
  @ApiOperation({ summary: 'Forgot password' })
  @ApiBody({ type: ForgotPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset link sent successfully' })
  @ApiResponse({ status: 400, description: 'Email not found' })
  forgotPassword(@Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto) {
    return this.usersService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
  @ApiOperation({ summary: 'Reset password' })
  @ApiBody({ type: ResetPasswordDto })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid token' })
  @ApiResponse({ status: 401, description: 'Invalid token type' })
  resetPassword(@Body(ValidationPipe) resetPasswordDto: ResetPasswordDto) {
    return this.usersService.resetPassword(resetPasswordDto);
  }

  @Post()
  create(@Body(ValidationPipe) createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  @Throttle({short:{ttl:60000,limit:3}})
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  @Get('email')
  findByEmail(@Query('email') email: string) {
    return this.usersService.findByEmail(email);
  }
  
  @SkipThrottle({default:false})
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  @Patch(':id')
  update(@Param('id') id: string, @Body(ValidationPipe) updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }
}

