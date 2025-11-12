import { Controller, Get, Post, Body, Patch, Param, Delete, Query, ValidationPipe } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { CreateUserDto, UpdateUserDto, SignupDto, LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyAccountDto, ResendVerificationDto } from './dto/create-user-dto.js';
import { Throttle, SkipThrottle } from '@nestjs/throttler';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post('signup')
  signup(@Body(ValidationPipe) signupDto: SignupDto) {
    return this.usersService.signup(signupDto);
  }

  @Post('verify')
  verifyAccount(@Body(ValidationPipe) verifyAccountDto: VerifyAccountDto) {
    return this.usersService.verifyAccount(verifyAccountDto);
  }

  @Post('resend-verification')
  resendVerificationCode(@Body(ValidationPipe) resendVerificationDto: ResendVerificationDto) {
    return this.usersService.resendVerificationCode(resendVerificationDto);
  }

  @Post('login')
  login(@Body(ValidationPipe) loginDto: LoginDto) {
    return this.usersService.login(loginDto);
  }

  @Post('forgot-password')
  forgotPassword(@Body(ValidationPipe) forgotPasswordDto: ForgotPasswordDto) {
    return this.usersService.forgotPassword(forgotPasswordDto);
  }

  @Post('reset-password')
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

