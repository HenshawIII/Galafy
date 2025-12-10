import { PartialType } from '@nestjs/mapped-types';
import { IsString, IsEmail, IsNotEmpty, IsEnum, IsOptional, MinLength, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum KycTier {
  Tier_0 = 'Tier_0',
  Tier_1 = 'Tier_1',
  Tier_2 = 'Tier_2',
  Tier_3 = 'Tier_3',
}

export class CreateUserDto {
  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  firstName?: string;

  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  lastName?: string;

  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsOptional()
  @IsString({ message: 'Username must be a string' })
  username?: string;

  @IsOptional()
  @IsString({ message: 'Password must be a string' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password?: string;

  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;

  @IsOptional()
  @IsBoolean()
  isVerified?: boolean;
}

export class UpdateUserDto extends PartialType(CreateUserDto) {}

export class SignupDto {
  @ApiPropertyOptional({ example: 'John', description: 'First name' })
  @IsOptional()
  @IsString({ message: 'First name must be a string' })
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'Last name' })
  @IsOptional()
  @IsString({ message: 'Last name must be a string' })
  lastName?: string;

  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'johndoe', description: 'Username' })
  @IsString({ message: 'Username must be a string' })
  @IsNotEmpty({ message: 'Username is required' })
  username: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password (minimum 6 characters)', minLength: 6 })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  password: string;

  @ApiPropertyOptional({ example: '08012345678', description: 'Phone number' })
  @IsOptional()
  @IsString({ message: 'Phone must be a string' })
  phone?: string;
}

export class LoginDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: 'SecurePassword123!', description: 'Password' })
  @IsString({ message: 'Password must be a string' })
  @IsNotEmpty({ message: 'Password is required' })
  password: string;
}

export class ForgotPasswordDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

export class ResendVerificationDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;
}

export class VerifyAccountDto {
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @IsString({ message: 'Verification code must be a string' })
  @IsNotEmpty({ message: 'Verification code is required' })
  verificationCode: string;
}

export class ResetPasswordDto {
  @ApiProperty({ example: 'john.doe@example.com', description: 'Email address' })
  @IsEmail({}, { message: 'Invalid email format' })
  @IsNotEmpty({ message: 'Email is required' })
  email: string;

  @ApiProperty({ example: '123456', description: 'Password reset OTP (6 digits)' })
  @IsString({ message: 'OTP must be a string' })
  @IsNotEmpty({ message: 'OTP is required' })
  otp: string;

  @ApiProperty({ example: 'NewSecurePassword123!', description: 'New password (minimum 6 characters)', minLength: 6 })
  @IsString({ message: 'New password must be a string' })
  @IsNotEmpty({ message: 'New password is required' })
  @MinLength(6, { message: 'Password must be at least 6 characters long' })
  newPassword: string;
}

