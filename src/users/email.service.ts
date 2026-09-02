import { Injectable, Logger } from '@nestjs/common';
import sgMail from '@sendgrid/mail';
import { config } from 'dotenv';
import {
  AccountRestrictionKind,
  getAccountRestrictionEmailCopy,
} from '../common/utils/account-restriction-email-copy.util.js';
import {
  buildBrandedEmailHtml,
  EMAIL_BRAND_COLOR,
  formatEmailSupportFooterText,
} from '../common/utils/email-branding.util.js';
config();

export type { AccountRestrictionKind };

@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  constructor() {
    // Set SendGrid API key
    const apiKey = process.env.SENDGRID_API_KEY;
    if (!apiKey) {
      this.logger.warn('SENDGRID_API_KEY not found in environment variables');
    } else {
      sgMail.setApiKey(apiKey);
      this.logger.log('SendGrid API initialized successfully');
    }

    // Optional: Set data residency for EU (uncomment if needed)
    // sgMail.setDataResidency('eu');
  }

  async sendWelcomeEmail(
    email: string,
    userData?: {
      firstName?: string | null;
      lastName?: string | null;
      username?: string | null;
    },
  ): Promise<void> {
    // Get user's display name: prefer firstName, then username, then lastName, then default
    // Handle null, undefined, and empty strings
    let userName = 'there';
    if (userData?.firstName && userData.firstName.trim()) {
      userName = userData.firstName.trim();
    } else if (userData?.username && userData.username.trim()) {
      userName = userData.username.trim();
    } else if (userData?.lastName && userData.lastName.trim()) {
      userName = userData.lastName.trim();
    }

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Welcome to Galafy! 🎉',
      text: `Hello ${userName}, Welcome to Galafy! We're thrilled to have you join our community. Get started by exploring events, connecting with performers, and much more. If you have any questions, feel free to reach out to our support team.`,
      html: buildBrandedEmailHtml(`
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Welcome, ${userName}! 🎉</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                We're thrilled to have you join the Galafy community! You're now part of an exciting platform where you can discover events, connect with performers, and create unforgettable experiences.
              </p>
              
              <!-- Welcome Box (Light Blue) -->
              <div style="background-color: #e7f3ff; border-left: 4px solid ${EMAIL_BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 24px; margin-right: 10px;">✨</span>
                  <h3 style="color: #333333; font-size: 18px; font-weight: bold; margin: 0;">Get Started</h3>
                </div>
                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                  Your account has been successfully created. To get the most out of Galafy, make sure to verify your email address using the code we sent you.
                </p>
              </div>
              
              <!-- Features Box (Light Green) -->
              <div style="background-color: #d4edda; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #333333; font-size: 16px; font-weight: bold; margin: 0 0 15px 0;">What you can do:</h3>
                <ul style="color: #333333; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  <li>Discover and attend amazing events</li>
                  <li>Connect with performers and celebrants</li>
                  <li>Send digital sprays and gifts</li>
                  <li>Manage your wallet and transactions</li>
                  <li>Build your profile and showcase your events</li>
                </ul>
              </div>
              
              <!-- Support Information Box (Light Yellow) -->
              <div style="background-color: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: #ff9800;">💬</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    Have questions? Our support team is here to help! Feel free to reach out anytime, and we'll be happy to assist you.
                  </p>
                </div>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Once again, welcome to Galafy! We can't wait to see what amazing experiences you'll create.
              </p>
              <p style="color: #333333; font-size: 14px; margin: 20px 0 0 0;">
                Warm regards,<br>
                The Galafy Team
              </p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Welcome email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending welcome email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the signup process
    }
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Verify Your Account',
      text: `Your verification code is: ${code}. This code will expire in 15 minutes.`,
      html: buildBrandedEmailHtml(`
          <h2 style="color: #333;">Welcome! Verify Your Account</h2>
          <p>Thank you for signing up. Please use the following verification code to verify your account:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: ${EMAIL_BRAND_COLOR}; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p>This verification code will expire in 15 minutes.</p>
          <p>If you did not create an account, please ignore this email.</p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Verification email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending verification email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send verification email: ${error.message}`);
    }
  }

  async sendPasswordResetLink(email: string, resetLink: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Password Reset Request',
      text: `You have requested to reset your password. Click the link below or copy and paste it into your browser: ${resetLink}. This link will expire in 1 hour.`,
      html: buildBrandedEmailHtml(`
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password. Click the link below to reset your password:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetLink}" style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Password reset email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending password reset email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send password reset email: ${error.message}`);
    }
  }

  async sendPasswordResetOtp(email: string, otp: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Password Reset OTP',
      text: `Your password reset OTP is: ${otp}. This code will expire in 15 minutes.`,
      html: buildBrandedEmailHtml(`
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password. Please use the following OTP to reset your password:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: ${EMAIL_BRAND_COLOR}; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This OTP will expire in 15 minutes.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Password reset OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending password reset OTP email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send password reset OTP email: ${error.message}`);
    }
  }

  async sendPinResetOtp(email: string, otp: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Payout PIN Reset OTP',
      text: `Your payout PIN reset OTP is: ${otp}. This code will expire in 15 minutes.`,
      html: buildBrandedEmailHtml(`
          <h2 style="color: #333;">Payout PIN Reset Request</h2>
          <p>You have requested to reset your payout PIN. Please use the following OTP to reset your PIN:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: ${EMAIL_BRAND_COLOR}; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This OTP will expire in 15 minutes.</p>
          <p><strong>Important:</strong> After confirming with this OTP, you will need to enter your new 4-digit PIN to complete the reset.</p>
          <p>If you did not request this PIN reset, please ignore this email and contact support immediately.</p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`PIN reset OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending PIN reset OTP email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send PIN reset OTP email: ${error.message}`);
    }
  }

  async sendPayoutOtp(email: string, otp: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Payout Confirmation OTP',
      text: `Your payout confirmation OTP is: ${otp}. This code will expire in 10 minutes.`,
      html: buildBrandedEmailHtml(`
          <h2 style="color: #333;">Payout Confirmation</h2>
          <p>You have initiated a payout transaction. Please use the following OTP to confirm the transaction:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: ${EMAIL_BRAND_COLOR}; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p><strong>Important:</strong> After confirming with this OTP, you will also need to enter your payout PIN to complete the transaction.</p>
          <p>If you did not initiate this payout, please ignore this email and contact support immediately.</p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Payout OTP email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending payout OTP email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send payout OTP email: ${error.message}`);
    }
  }

  async sendAdminPasswordResetLink(email: string, resetLink: string, token: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Galafy Admin - Password Reset Request',
      text: `You have requested to reset your admin password. Click the link below or copy and paste it into your browser: ${resetLink}. This link will expire in 15 minutes.`,
      html: buildBrandedEmailHtml(
        `
              <h2 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Forgot Password?</h2>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Enter your registered email address to reset your password.
              </p>
              
              <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                You have requested to reset your admin password. Click the button below to reset your password:
              </p>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${resetLink}" style="background-color: ${EMAIL_BRAND_COLOR}; color: white; padding: 14px 28px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">Reset Password</a>
              </div>
              
              <p style="color: #666666; font-size: 12px; line-height: 1.6; margin: 20px 0 0 0;">
                Or copy and paste this link into your browser:
              </p>
              <p style="word-break: break-all; color: #666666; font-size: 12px; margin: 10px 0 20px 0;">${resetLink}</p>
              
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #856404; font-size: 14px; margin: 0;">
                  <strong>⚠️ Security Notice:</strong> This link will expire in 15 minutes. If you did not request this password reset, please ignore this email and contact your administrator immediately.
                </p>
              </div>
              
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Best regards,<br>
                Galafy Admin Team
              </p>
      `,
        { headerTitle: 'Admin' },
      ),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Admin password reset email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending admin password reset email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send admin password reset email: ${error.message}`);
    }
  }

  async sendWalletFundingAlert(
    email: string,
    amount: string,
    accountNumber: string,
    reference: string,
    firstName?: string,
    paymentMethod?: string,
    fundingDate?: Date,
  ): Promise<void> {
    // Format amount with currency
    const formattedAmount =
      amount.includes('₦') || amount.includes('N')
        ? amount
        : `₦${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Format date
    const formattedDate = fundingDate
      ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(fundingDate)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date());

    // Get user's first name or default
    const userName = firstName || 'there';

    // Format payment method (default to Bank Transfer if not provided)
    const paymentMethodDisplay = paymentMethod || 'Bank Transfer';

    // Map payment method to display name
    const paymentMethodMap: { [key: string]: string } = {
      BANK_TRANSFER: 'Bank Transfer',
      CARD: 'Card Payment',
      USSD: 'USSD',
      MANUAL_ADJUSTMENT: 'Manual Adjustment',
    };
    const paymentMethodText = paymentMethodMap[paymentMethodDisplay.toUpperCase()] || paymentMethodDisplay;

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Wallet Funding Successful - Galafy',
      text: `Hello ${userName}, Your Galafy wallet has been successfully funded. Amount: ${formattedAmount}, Date: ${formattedDate}, Payment method: ${paymentMethodText}. If you notice anything unusual, please reach out to us.`,
      html: buildBrandedEmailHtml(`
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Your Galafy wallet has been successfully funded.
              </p>
              
              <!-- Transaction Summary Box (Light Green) -->
              <div style="background-color: #d4edda; border-left: 4px solid #28a745; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 20px; margin-right: 10px; color: #28a745;">✓</span>
                  <h3 style="color: #333333; font-size: 16px; font-weight: bold; margin: 0;">Transaction Summary</h3>
                </div>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <span style="color: #666666;">Amount funded:</span> 
                  <span style="color: #28a745; font-weight: bold; font-size: 16px;">${formattedAmount}</span>
                </p>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <span style="color: #666666;">Date:</span> 
                  <span style="color: #333333;">${formattedDate}</span>
                </p>
                <p style="color: #333333; font-size: 14px; margin: 8px 0; display: flex; align-items: center; gap: 8px;">
                  <span style="color: #666666;">Payment method:</span> 
                  <span style="display: inline-flex; align-items: center; gap: 6px; background-color: #d4edda; color: #155724; padding: 4px 12px; border-radius: 20px; font-size: 13px;">
                    <span style="font-size: 14px;">🏦</span>
                    ${paymentMethodText}
                  </span>
                </p>
              </div>
              
              <!-- Wallet Balance Update Box (Light Blue) -->
              <div style="background-color: #e7f3ff; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: ${EMAIL_BRAND_COLOR};">💰</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    Your updated wallet balance is now available and ready to use for events and digital sprays.
                  </p>
                </div>
              </div>
              
              <!-- Review Notification -->
              <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                You'll be notified once the request has been reviewed.
              </p>
              
              <!-- Information Box (Light Yellow with Orange Border) -->
              <div style="background-color: #fff3cd; border: 1px solid #ff9800; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: #ff9800; font-weight: bold; font-style: italic;">ℹ</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you notice anything unusual, please reach out to us.
                  </p>
                </div>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Warm regards,
              </p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Wallet funding alert email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending wallet funding alert email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the funding process
    }
  }

  async sendWithdrawalStatusAlert(
    email: string,
    amount: string,
    status: string,
    accountNumber: string,
    reference: string,
    message?: string,
    firstName?: string,
    bankName?: string,
    requestDate?: Date,
  ): Promise<void> {
    const statusLower = status.toLowerCase();
    const isPending = statusLower === 'pending' || statusLower === 'processing';
    const isSuccess = statusLower === 'success' || statusLower === 'approved' || statusLower === 'completed';
    const isFailed = statusLower === 'failed' || statusLower === 'rejected';

    // Format amount with currency
    const formattedAmount = amount.includes('N')
      ? amount
      : `N${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    // Format date
    const formattedDate = requestDate
      ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(requestDate)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date());

    // Get user's first name or default
    const userName = firstName || 'there';

    // Mask account number (show last 4 digits)
    const maskedAccount =
      accountNumber.length > 4
        ? `${accountNumber.slice(0, -4).replace(/\d/g, '.')}${accountNumber.slice(-4)}`
        : accountNumber;

    // Format bank account display
    const bankAccountDisplay = bankName
      ? `${bankName} .... ${accountNumber.slice(-4)}`
      : `.... ${accountNumber.slice(-4)}`;

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: isPending
        ? 'Withdrawal Request Received - Galafy'
        : `Withdrawal ${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()} - Galafy`,
      text: isPending
        ? `Hello ${userName}, We've received your withdrawal request and it's currently being processed. Amount: ${formattedAmount}, Bank account: ${bankAccountDisplay}, Date: ${formattedDate}. If you did not initiate this request, please contact our Support team immediately.`
        : `Your withdrawal request of ${formattedAmount} has been ${status.toLowerCase()}. Account: ${bankAccountDisplay}, Reference: ${reference}${message ? `. Message: ${message}` : ''}`,
      html: buildBrandedEmailHtml(`
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                ${
                  isPending
                    ? "We've received your withdrawal request and it's currently being processed."
                    : isSuccess
                      ? `Your withdrawal request has been successfully processed.`
                      : isFailed
                        ? `Your withdrawal request could not be processed.`
                        : `Your withdrawal request status: ${status}.`
                }
              </p>
              
              ${
                isPending
                  ? `
              <!-- Withdrawal Details Box (Light Blue) -->
              <div style="background-color: #e7f3ff; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 20px; margin-right: 10px; color: #007bff;">🕐</span>
                  <h3 style="color: #007bff; font-size: 16px; font-weight: bold; margin: 0;">Withdrawal Details</h3>
                </div>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <span style="color: #666666;">Requested amount:</span> 
                  <span style="color: #007bff; font-weight: bold; font-size: 16px;">${formattedAmount}</span>
                </p>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <span style="color: #666666;">Bank account:</span> 
                  <span style="color: #007bff;">${bankAccountDisplay}</span>
                </p>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <span style="color: #666666;">Date:</span> 
                  <span style="color: #007bff;">${formattedDate}</span>
                </p>
              </div>
              
              <!-- Processing Time Box (White) -->
              <div style="background-color: #ffffff; border: 1px solid #e0e0e0; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: center; margin-bottom: 10px;">
                  <span style="font-size: 20px; margin-right: 10px; color: #007bff;">⏳</span>
                  <h3 style="color: #007bff; font-size: 16px; font-weight: bold; margin: 0;">Processing Time</h3>
                </div>
                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                  Withdrawals are typically processed within <strong>24-48 hours</strong>, depending on verification and banking timelines.
                </p>
              </div>
              
              <!-- Notification Box (Light Green) -->
              <div style="background-color: #d4edda; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: #28a745;">🔔</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    You'll receive another notification once the funds have been successfully sent.
                  </p>
                </div>
              </div>
              `
                  : `
              <!-- Status Details Box -->
              <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Amount:</strong> <span style="color: #007bff; font-weight: bold;">${formattedAmount}</span></p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Status:</strong> <span style="color: ${isSuccess ? '#28a745' : isFailed ? '#dc3545' : '#ffc107'}; font-weight: bold;">${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}</span></p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Bank account:</strong> ${bankAccountDisplay}</p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Date:</strong> ${formattedDate}</p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Reference:</strong> ${reference}</p>
                ${message ? `<p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ''}
              </div>
              `
              }
              
              <!-- Warning Box (Red Bordered) -->
              <div style="background-color: #fff5f5; border: 1px solid #ffcccc; padding: 20px; margin: 20px 0; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: #dc3545;">⚠️</span>
                  <p style="color: #dc3545; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you did not initiate this request, please contact our <a href="mailto:support@galafy.com" style="color: #dc3545; text-decoration: underline; font-weight: bold;">Support team</a> immediately.
                  </p>
                </div>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Warm regards,
              </p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Withdrawal status alert email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending withdrawal status alert email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the withdrawal process
    }
  }

  async sendBankAccountChangeAlert(
    email: string,
    oldAccountNumber: string,
    newAccountNumber: string,
    bankCode: string,
    status: string,
    firstName?: string,
    requestDate?: Date,
  ): Promise<void> {
    const statusColor =
      status.toLowerCase() === 'approved' || status.toLowerCase() === 'success'
        ? '#28a745'
        : status.toLowerCase() === 'pending'
          ? '#ffc107'
          : '#dc3545';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    // Format date for display
    const formattedDate = requestDate
      ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(requestDate)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());

    // Get user's first name or default to a generic greeting
    const userName = firstName || 'there';

    // Status badge styling
    const statusBadgeColor =
      status.toLowerCase() === 'pending'
        ? '#fff3cd'
        : status.toLowerCase() === 'approved' || status.toLowerCase() === 'success'
          ? '#d4edda'
          : '#f8d7da';
    const statusDotColor =
      status.toLowerCase() === 'pending'
        ? '#ff9800'
        : status.toLowerCase() === 'approved' || status.toLowerCase() === 'success'
          ? '#28a745'
          : '#dc3545';

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Bank Account Update Request - Galafy',
      text: `Hello ${userName}, We received a request to update the bank account linked to your Galafy profile. Date: ${formattedDate}, Status: ${statusText}. If you did not initiate this request, please contact our Support team immediately.`,
      html: buildBrandedEmailHtml(`
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                We received a request to update the bank account linked to your Galafy profile.
              </p>
              
              <!-- Request Details Box (Yellow) -->
              <div style="background-color: #fff3cd; border-left: 4px solid #ffc107; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 18px; margin-right: 8px;">🕐</span>
                  <h3 style="color: #333333; font-size: 16px; font-weight: bold; margin: 0;">Request Details</h3>
                </div>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;"><strong>Date:</strong> ${formattedDate}</p>
                <p style="color: #333333; font-size: 14px; margin: 8px 0;">
                  <strong>Status:</strong> 
                  <span style="display: inline-block; background-color: ${statusBadgeColor}; color: #333333; padding: 4px 12px; border-radius: 20px; font-size: 13px; margin-left: 8px;">
                    <span style="display: inline-block; width: 8px; height: 8px; background-color: ${statusDotColor}; border-radius: 50%; margin-right: 6px; vertical-align: middle;"></span>
                    ${statusText}
                  </span>
                </p>
              </div>
              
              <!-- Security Information Box (Blue) -->
              <div style="background-color: #e7f3ff; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: ${EMAIL_BRAND_COLOR};">🛡️</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    For security and compliance reasons, all bank account changes are reviewed before approval. This helps us keep your account safe and prevent unauthorized activity.
                  </p>
                </div>
              </div>
              
              <!-- Follow-up Notification -->
              <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 20px 0;">
                You'll be notified once the request has been reviewed.
              </p>
              
              <!-- Warning Box (Red) -->
              <div style="background-color: #fff5f5; border: 1px solid #ffcccc; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: flex-start;">
                  <span style="font-size: 20px; margin-right: 10px; color: #dc3545;">⚠️</span>
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    If you did not initiate this request, please contact our <a href="mailto:support@galafy.com" style="color: ${EMAIL_BRAND_COLOR}; text-decoration: underline;">Support</a> team immediately.
                  </p>
                </div>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Warm regards,
              </p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Bank account change alert email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending bank account change alert email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the account update process
    }
  }

  async sendAdminInviteEmail(
    email: string,
    inviteData: {
      inviteLink: string;
      role: string;
      expiresAt: Date;
      inviterEmail?: string;
    },
  ): Promise<void> {
    const expiryDate = new Date(inviteData.expiresAt).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    const roleDisplayName = inviteData.role.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: `Admin Portal Invitation - ${roleDisplayName} Role`,
      text: `You have been invited to join the Galafy Admin Portal as a ${roleDisplayName}.

Click the link below to accept your invitation and set up your account:
${inviteData.inviteLink}

This invitation will expire on ${expiryDate}.

${inviteData.inviterEmail ? `Invited by: ${inviteData.inviterEmail}` : ''}

If you did not expect this invitation, please ignore this email.`,
      html: buildBrandedEmailHtml(
        `
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">You've Been Invited! 🎉</h1>
              
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                You have been invited to join the <strong>Galafy Admin Portal</strong> as a <strong>${roleDisplayName}</strong>.
              </p>
              
              ${
                inviteData.inviterEmail
                  ? `
              <p style="color: #666666; font-size: 14px; margin: 0 0 20px 0;">
                Invited by: <strong>${inviteData.inviterEmail}</strong>
              </p>
              `
                  : ''
              }
              
              <!-- Invite Box -->
              <div style="background-color: #e7f3ff; border-left: 4px solid ${EMAIL_BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #333333; font-size: 18px; font-weight: bold; margin: 0 0 15px 0;">Accept Your Invitation</h3>
                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
                  Click the button below to accept your invitation and set up your admin account. You'll be able to choose your password during the setup process.
                </p>
                <a href="${inviteData.inviteLink}" style="display: inline-block; background-color: ${EMAIL_BRAND_COLOR}; color: #ffffff; padding: 12px 30px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                  Accept Invitation
                </a>
              </div>
              
              <!-- Expiry Notice -->
              <div style="background-color: #fff3cd; padding: 15px; margin: 20px 0; border-radius: 4px;">
                <p style="color: #856404; font-size: 14px; margin: 0;">
                  <strong>⏰ Important:</strong> This invitation will expire on <strong>${expiryDate}</strong>. Please accept it before then.
                </p>
              </div>
              
              <!-- Alternative Link -->
              <p style="color: #666666; font-size: 12px; margin: 30px 0 0 0;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${inviteData.inviteLink}" style="color: ${EMAIL_BRAND_COLOR}; word-break: break-all;">${inviteData.inviteLink}</a>
              </p>
              
              <!-- Security Notice -->
              <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #6c757d;">
                <p style="color: #495057; font-size: 12px; margin: 0;">
                  <strong>🔒 Security Notice:</strong> If you did not expect this invitation, please ignore this email. Do not click the link or share it with anyone.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Welcome to the team!<br>
                The Galafy Admin Team
              </p>
      `,
        { headerTitle: 'Admin Portal' },
      ),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Admin invite email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending admin invite email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the invite process, but log it
      throw new Error(`Failed to send admin invite email: ${error.message}`);
    }
  }

  async sendKycReminderEmail(
    email: string,
    userData: {
      firstName?: string | null;
      lastName?: string | null;
      username?: string | null;
      kycUrl: string;
      scenario: string;
    },
  ): Promise<void> {
    let userName = 'there';
    if (userData?.firstName && userData.firstName.trim()) {
      userName = userData.firstName.trim();
    } else if (userData?.username && userData.username.trim()) {
      userName = userData.username.trim();
    } else if (userData?.lastName && userData.lastName.trim()) {
      userName = userData.lastName.trim();
    }

    const kycUrl = userData.kycUrl;
    if (!kycUrl) {
      throw new Error('KYC verification URL is required to send reminder email');
    }

    const template = this.getKycReminderTemplate(userData.scenario);

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: template.subject,
      text: `Hello ${userName}, ${template.message} Visit ${kycUrl} to continue.\n\n${formatEmailSupportFooterText()}`,
      html: this.buildKycReminderHtml(userName, kycUrl, template),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`KYC reminder email (${userData.scenario}) sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending KYC reminder email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      throw new Error(`Failed to send KYC reminder email: ${error.message}`);
    }
  }

  private getKycReminderTemplate(scenario: string): {
    subject: string;
    headline: string;
    message: string;
    benefits: string[];
    cta: string;
  } {
    const templates: Record<
      string,
      { subject: string; headline: string; message: string; benefits: string[]; cta: string }
    > = {
      TIER0_START: {
        subject: 'Start Your KYC Verification - Galafy',
        headline: 'Ready to unlock your Galafy account?',
        message:
          'You have not started KYC verification yet. Complete Tier 1 verification to activate your wallet and start transacting securely.',
        benefits: [
          'Activate your wallet and virtual account',
          'Start sending and receiving payments',
          'Unlock basic withdrawal limits',
        ],
        cta: 'Start KYC Verification',
      },
      TIER1_COMPLETE: {
        subject: 'Complete Your Tier 1 KYC - Galafy',
        headline: 'Finish your Tier 1 verification',
        message:
          'Your Tier 1 KYC is incomplete. Complete your BVN and face verification to continue using your account without restrictions.',
        benefits: [
          'Complete identity verification',
          'Maintain access to your wallet',
          'Prepare for higher tier upgrades',
        ],
        cta: 'Complete Tier 1 KYC',
      },
      TIER1_UPGRADE: {
        subject: 'Upgrade to Tier 2 - Galafy',
        headline: 'You are ready for Tier 2',
        message:
          'You have completed Tier 1 verification. Upgrade to Tier 2 to enjoy higher limits and expanded account features.',
        benefits: [
          'Higher balance and withdrawal limits',
          'Access to more platform features',
          'Stronger account protection',
        ],
        cta: 'Upgrade to Tier 2',
      },
      TIER2_COMPLETE: {
        subject: 'Complete Your Tier 2 KYC - Galafy',
        headline: 'Finish your Tier 2 upgrade',
        message:
          'Your Tier 2 upgrade is incomplete. Complete NIN verification and live face verification to unlock Tier 2 benefits.',
        benefits: [
          'Higher transaction limits',
          'Expanded wallet capabilities',
          'Smoother payouts and transfers',
        ],
        cta: 'Complete Tier 2 KYC',
      },
      TIER2_UPGRADE: {
        subject: 'Upgrade to Tier 3 - Galafy',
        headline: 'You are ready for Tier 3',
        message:
          'You have completed Tier 2 verification. Upgrade to Tier 3 for unlimited balance and the highest account limits.',
        benefits: [
          'Unlimited account balance',
          'Highest withdrawal limits',
          'Full premium account access',
        ],
        cta: 'Upgrade to Tier 3',
      },
      TIER3_COMPLETE: {
        subject: 'Complete Your Tier 3 KYC - Galafy',
        headline: 'Finish your Tier 3 verification',
        message:
          'Your Tier 3 address verification is pending. Complete it to unlock unlimited balance and full premium account access.',
        benefits: [
          'Unlimited account balance',
          'Highest withdrawal limits',
          'Full access to all premium features',
        ],
        cta: 'Complete Tier 3 KYC',
      },
    };

    return templates[scenario] ?? templates.TIER0_START;
  }

  private buildKycReminderHtml(
    userName: string,
    kycUrl: string,
    template: { headline: string; message: string; benefits: string[]; cta: string },
  ): string {
    const benefitsHtml = template.benefits
      .map((benefit) => `<li>${benefit}</li>`)
      .join('');

    return buildBrandedEmailHtml(`
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello, ${userName}! 👋</h1>
              <h2 style="color: #333333; font-size: 18px; font-weight: bold; margin: 0 0 15px 0;">${template.headline}</h2>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                ${template.message}
              </p>
              <div style="background-color: #e7f3ff; border-left: 4px solid ${EMAIL_BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 24px; margin-right: 10px;">✨</span>
                  <h3 style="color: #333333; font-size: 18px; font-weight: bold; margin: 0;">Why complete this step?</h3>
                </div>
                <ul style="color: #333333; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  ${benefitsHtml}
                </ul>
              </div>
              <div style="text-align: center; margin: 30px 0;">
                <a href="${kycUrl}" style="display: inline-block; background-color: ${EMAIL_BRAND_COLOR}; color: #ffffff; padding: 14px 32px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 16px;">
                  ${template.cta}
                </a>
              </div>
              <p style="color: #666666; font-size: 13px; line-height: 1.6; margin: 0 0 20px 0; text-align: center; word-break: break-all;">
                Or copy and paste this link into your browser:<br>
                <a href="${kycUrl}" style="color: ${EMAIL_BRAND_COLOR};">${kycUrl}</a>
              </p>
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Best regards,<br>
                The Galafy Team
              </p>
    `);
  }

  async sendAccountRestrictionEmail(
    email: string,
    userData?: {
      firstName?: string | null;
      lastName?: string | null;
      username?: string | null;
    },
    restrictionReason?: string,
    kind: AccountRestrictionKind = 'aml',
  ): Promise<void> {
    const copy = getAccountRestrictionEmailCopy(kind);

    // Get user's display name: prefer firstName, then username, then lastName, or default
    let userName = 'there';
    if (userData?.firstName && userData.firstName.trim()) {
      userName = userData.firstName.trim();
    } else if (userData?.username && userData.username.trim()) {
      userName = userData.username.trim();
    } else if (userData?.lastName && userData.lastName.trim()) {
      userName = userData.lastName.trim();
    }

    const supportEmail = process.env.SUPPORT_EMAIL || 'support@galafy.com';
    const supportUrl = process.env.PUBLIC_URL ? `${process.env.PUBLIC_URL}/support` : '#';
    const reasonSuffix = restrictionReason ? ` Reason: ${restrictionReason}` : '';
    const bulletHtml = copy.bullets
      .map((item) => `<li>${item}</li>`)
      .join('\n                  ');

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: copy.subject,
      text: `Hello ${userName}, ${copy.textIntro}${reasonSuffix} Please contact our support team at ${supportEmail} for more information and assistance.`,
      html: buildBrandedEmailHtml(`
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Important Account Notice</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Hello ${userName},
              </p>
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                ${copy.htmlIntro}
              </p>
              
              <!-- Warning Box (Red/Orange) -->
              <div style="background-color: #f8d7da; border-left: 4px solid #dc3545; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <div style="display: flex; align-items: center; margin-bottom: 15px;">
                  <span style="font-size: 24px; margin-right: 10px;">⚠️</span>
                  <h3 style="color: #721c24; font-size: 18px; font-weight: bold; margin: 0;">${copy.warningTitle}</h3>
                </div>
                <p style="color: #721c24; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">
                  ${copy.warningBody}
                </p>
                ${
                  restrictionReason
                    ? `
                <div style="background-color: #ffffff; padding: 15px; border-radius: 4px; margin-top: 15px;">
                  <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0;">
                    <strong>Reason:</strong> ${restrictionReason}
                  </p>
                </div>
                `
                    : ''
                }
              </div>
              
              <!-- What This Means -->
              <div style="background-color: #fff3cd; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #856404; font-size: 16px; font-weight: bold; margin: 0 0 15px 0;">What This Means</h3>
                <ul style="color: #856404; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                  ${bulletHtml}
                </ul>
              </div>
              
              <!-- Support Information -->
              <div style="background-color: #e7f3ff; border-left: 4px solid ${EMAIL_BRAND_COLOR}; padding: 20px; margin: 20px 0; border-radius: 4px;">
                <h3 style="color: #333333; font-size: 18px; font-weight: bold; margin: 0 0 15px 0;">Need Help?</h3>
                <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 15px 0;">
                  If you have questions about this restriction or believe this is an error, please contact our support team immediately. We're here to help resolve any issues.
                </p>
                <div style="margin-top: 15px;">
                  <p style="color: #333333; font-size: 14px; margin: 5px 0;">
                    <strong>Email:</strong> <a href="mailto:${supportEmail}" style="color: ${EMAIL_BRAND_COLOR}; text-decoration: none;">${supportEmail}</a>
                  </p>
                  ${
                    supportUrl !== '#'
                      ? `
                  <p style="color: #333333; font-size: 14px; margin: 5px 0;">
                    <strong>Support Portal:</strong> <a href="${supportUrl}" style="color: ${EMAIL_BRAND_COLOR}; text-decoration: none;">${supportUrl}</a>
                  </p>
                  `
                      : ''
                  }
                </div>
              </div>
              
              <!-- Security Notice -->
              <div style="background-color: #f8f9fa; padding: 15px; margin: 20px 0; border-radius: 4px; border-left: 4px solid #6c757d;">
                <p style="color: #495057; font-size: 12px; margin: 0;">
                  <strong>🔒 Security Notice:</strong> This is an automated notification from Galafy. If you did not expect this message, please contact our support team immediately.
                </p>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                We appreciate your understanding and cooperation.
              </p>
              <p style="color: #333333; font-size: 14px; margin: 20px 0 0 0;">
                Best regards,<br>
                ${copy.signOffTeam}
              </p>
      `),
    };

    try {
      await sgMail.send(msg);
      this.logger.log(`Account restriction email sent to ${email}`);
    } catch (error: any) {
      this.logger.error(`Error sending account restriction email to ${email}:`, error.message);
      if (error.response) {
        this.logger.error('SendGrid error details:', error.response.body);
      }
      // Don't throw - email failure shouldn't break the restriction operation, but log it
      this.logger.warn(`Failed to send restriction email to ${email}, but restriction was applied`);
    }
  }
}
