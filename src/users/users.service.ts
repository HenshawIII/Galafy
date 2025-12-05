import { Injectable, BadRequestException, NotFoundException, UnauthorizedException, ConflictException } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { CreateUserDto, UpdateUserDto, SignupDto, LoginDto, ResetPasswordDto, ForgotPasswordDto, VerifyAccountDto, ResendVerificationDto, KycTier } from './dto/create-user-dto.js';
import { ProviderService } from '../provider/provider.service.js';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { EmailService } from './email.service.js';

@Injectable()
export class UsersService {

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly jwtService: JwtService,
    private readonly emailService: EmailService,
    private readonly providerService: ProviderService,
  ) {}

  async signup(signupDto: SignupDto) {
    // Check if user already exists
    const existingUser = await this.databaseService.user.findUnique({
      where: { email: signupDto.email },
    });

    const existingPhone = await this.databaseService.user.findUnique({
      where: { phone: signupDto.phone },
    });

    if (existingPhone) {
      throw new ConflictException('User with this phone number already exists');
    }

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(signupDto.password, 10);

    // Generate 6-digit verification code
    const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Check if username already exists (if provided)
    if (signupDto.username) {
      const existingUsername = await this.databaseService.user.findUnique({
        where: { username: signupDto.username },
      });

      if (existingUsername) {
        throw new ConflictException('User with this username already exists');
      }
    }

    // Create user with unverified status
    const user = await this.databaseService.user.create({
      data: {
        firstName: signupDto.firstName,
        lastName: signupDto.lastName,
        email: signupDto.email,
        username: signupDto.username,
        password: hashedPassword,
        phone: signupDto.phone,
        kycTier: signupDto.kycTier ?? KycTier.Tier_0, // Default to Tier_0 for new signups
        isVerified: false,
        verificationCode,
      },
    });

    // Send verification code via email (don't fail signup if email fails)
    try {
      await this.emailService.sendVerificationCode(user.email, verificationCode);
    } catch (emailError) {
      // Log error but don't fail signup - user can request resend later
      console.error('Failed to send verification email (signup still succeeded):', emailError.message);
    }

    // Remove sensitive data from response
    const { password, verificationCode: _, ...userWithoutPassword } = user;
    return {
      ...userWithoutPassword,
      message: 'Account created successfully. Please check your email for verification code.',
    };
  }

  async resendVerificationCode(resendVerificationDto: ResendVerificationDto) {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: resendVerificationDto.email },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return { message: 'If the email exists and account is unverified, a new verification code has been sent' };
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    // Generate new 6-digit verification code
    const newVerificationCode = Math.floor(100000 + Math.random() * 900000).toString();

    // Update user with new verification code and reset updatedAt to track new expiration window
    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        verificationCode: newVerificationCode,
        updatedAt: new Date(), // Use updatedAt to track when code was last sent
      },
    });

    // Send new verification code via email
    try {
      await this.emailService.sendVerificationCode(user.email, newVerificationCode);
    } catch (emailError) {
      console.error('Failed to send verification email:', emailError.message);
      // Still return success message - user can try again
    }

    return { message: 'If the email exists and account is unverified, a new verification code has been sent' };
  }

  async verifyAccount(verifyAccountDto: VerifyAccountDto) {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: verifyAccountDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    if (user.isVerified) {
      throw new BadRequestException('Account is already verified');
    }

    // Check if verification code matches
    if (user.verificationCode !== verifyAccountDto.verificationCode) {
      throw new UnauthorizedException('Invalid verification code');
    }

    // Check if verification code has expired (15 minutes from when code was last sent)
    // Use updatedAt to track when verification code was last generated (either at signup or resend)
    const codeAge = Date.now() - user.updatedAt.getTime();
    const expirationTime = 15 * 60 * 1000; // 15 minutes in milliseconds
    if (codeAge > expirationTime) {
      throw new UnauthorizedException('Verification code has expired. Please request a new one.');
    }

    // Update user to verified status and clear verification code
    const updatedUser = await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        isVerified: true,
        verificationCode: null,
      },
    });

    // Remove sensitive data from response
    const { password, verificationCode: _, ...userWithoutPassword } = updatedUser;
    return {
      ...userWithoutPassword,
      message: 'Account verified successfully',
    };
  }

  async login(loginDto: LoginDto) {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: loginDto.email },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Check if account is verified
    if (!user.isVerified) {
      throw new UnauthorizedException('Please verify your account before logging in. Check your email for verification code.');
    }

    // Check if user signed up with Google OAuth (no password set)
    if (!user.password) {
      throw new UnauthorizedException('This account was created with Google sign-in. Please use Google authentication to login.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(loginDto.password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid email or password');
    }

    // Generate JWT token
    const token = this.jwtService.sign({
      sub: user.id,
      email: user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return {
      access_token: token,
      user: userWithoutPassword,
    };
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto) {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: forgotPasswordDto.email },
    });

    if (!user) {
      // Don't reveal if user exists or not for security
      return { message: 'If the email exists, a password reset OTP has been sent' };
    }

    // Generate 6-digit OTP for password reset
    const passwordResetOtp = Math.floor(100000 + Math.random() * 900000).toString();

    // Update user with password reset OTP and reset updatedAt to track expiration
    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        passwordResetOtp,
        updatedAt: new Date(), // Use updatedAt to track when OTP was last sent
      },
    });

    // Send password reset OTP via email
    try {
      await this.emailService.sendPasswordResetOtp(user.email, passwordResetOtp);
    } catch (emailError) {
      console.error('Failed to send password reset OTP email:', emailError.message);
      // Still return success message for security (don't reveal if email exists)
    }

    return { message: 'If the email exists, a password reset OTP has been sent' };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto) {
    // Find user by email
    const user = await this.databaseService.user.findUnique({
      where: { email: resetPasswordDto.email },
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    // Check if password reset OTP exists
    if (!user.passwordResetOtp) {
      throw new UnauthorizedException('No password reset OTP found. Please request a new one.');
    }

    // Check if OTP matches
    if (user.passwordResetOtp !== resetPasswordDto.otp) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Check if OTP has expired (15 minutes from when OTP was last sent)
    // Use updatedAt to track when password reset OTP was last generated
    const otpAge = Date.now() - user.updatedAt.getTime();
    const expirationTime = 15 * 60 * 1000; // 15 minutes in milliseconds
    if (otpAge > expirationTime) {
      throw new UnauthorizedException('Password reset OTP has expired. Please request a new one.');
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(resetPasswordDto.newPassword, 10);

    // Update password and clear password reset OTP
    await this.databaseService.user.update({
      where: { id: user.id },
      data: {
        password: hashedPassword,
        passwordResetOtp: null,
      },
    });

    return { message: 'Password reset successfully' };
  }

  async create(createUserDto: CreateUserDto) {
    // Hash password if provided
    const data: any = {
      firstName: createUserDto.firstName,
      lastName: createUserDto.lastName,
      email: createUserDto.email,
      phone: createUserDto.phone,
      kycTier: createUserDto.kycTier ?? KycTier.Tier_0,
      isVerified: createUserDto.isVerified ?? false,
    };

    if (createUserDto.password) {
      data.password = await bcrypt.hash(createUserDto.password, 10);
    } else {
      data.password = null; // For Google OAuth users
    }

    const user = await this.databaseService.user.create({
      data,
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findAll() {
    const users = await this.databaseService.user.findMany();

    if (users.length === 0) {
      throw new NotFoundException('No users found');
    }

    // Remove passwords from response
    return users.map(({ password, ...user }) => user);
  }

  async findOne(id: string) {
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Remove password from response
    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  async findByEmail(email: string) {
    const user = await this.databaseService.user.findUnique({
      where: { email },
    });

    if (!user) {
      return null;
    }

        return user;
    }

  async update(id: string, updateUserDto: UpdateUserDto) {
    // Check if user exists first
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    // Hash password if it's being updated
    const data = { ...updateUserDto };
    if (data.password) {
      data.password = await bcrypt.hash(data.password, 10);
    }

    const updatedUser = await this.databaseService.user.update({
      where: { id },
      data,
    });

    // Remove password from response
    const { password, ...userWithoutPassword } = updatedUser;
    return userWithoutPassword;
  }

  async remove(id: string) {
    // Check if user exists first
    const user = await this.databaseService.user.findUnique({
      where: { id },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${id} not found`);
    }

    return await this.databaseService.user.delete({
      where: { id },
    });
  }

  /**
   * Get user details with customer information and KYC status
   */
  async getUserDetails(userId: string) {
    // Find user with customer relation including wallets and bank accounts
    const user = await this.databaseService.user.findUnique({
      where: { id: userId },
      include: {
        customer: {
          include: {
            wallets: true,
            bankAccounts: true,
          },
        },
      },
    });

    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    if (!user.customer) {
      throw new NotFoundException(`Customer not found for user ${userId}`);
    }

    const customer = user.customer;

    // Prepare customer details
    const customerDetails = {
      firstName: customer.firstName,
      lastName: customer.lastName,
      mobileNumber: customer.mobileNumber,
      emailAddress: customer.emailAddress,
      tier: customer.tier,
      customerId: customer.id,
      username: user.username,
    };

    // Get KYC status from provider if providerCustomerId exists
    let kycStatus: any = null;
    if (customer.providerCustomerId) {
      try {
        kycStatus = await this.providerService.getCustomerKycStatus(customer.providerCustomerId);
      } catch (error: any) {
        // Log error but don't fail the request - KYC status will be null
        console.error(`Failed to fetch KYC status for customer ${customer.providerCustomerId}:`, error.message);
      }
    }

    return {
      ...customerDetails,
      kycStatus,
      wallets: customer.wallets || [],
      bankAccounts: customer.bankAccounts || [],
    };
  }
}

