import { Injectable, Logger } from '@nestjs/common';
import  sgMail from '@sendgrid/mail';
import { config } from 'dotenv';
config();

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

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Verify Your Account',
      text: `Your verification code is: ${code}. This code will expire in 15 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Welcome! Verify Your Account</h2>
          <p>Thank you for signing up. Please use the following verification code to verify your account:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${code}</h1>
          </div>
          <p>This verification code will expire in 15 minutes.</p>
          <p>If you did not create an account, please ignore this email.</p>
        </div>
      `,
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
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password. Click the link below to reset your password:</p>
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetLink}" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">Reset Password</a>
          </div>
          <p>Or copy and paste this link into your browser:</p>
          <p style="word-break: break-all; color: #666;">${resetLink}</p>
          <p>This link will expire in 1 hour.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
        </div>
      `,
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
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Password Reset Request</h2>
          <p>You have requested to reset your password. Please use the following OTP to reset your password:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This OTP will expire in 15 minutes.</p>
          <p>If you did not request this password reset, please ignore this email.</p>
        </div>
      `,
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

  async sendPayoutOtp(email: string, otp: string): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Payout Confirmation OTP',
      text: `Your payout confirmation OTP is: ${otp}. This code will expire in 10 minutes.`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Payout Confirmation</h2>
          <p>You have initiated a payout transaction. Please use the following OTP to confirm the transaction:</p>
          <div style="background-color: #f4f4f4; padding: 20px; text-align: center; margin: 20px 0;">
            <h1 style="color: #007bff; font-size: 32px; margin: 0; letter-spacing: 5px;">${otp}</h1>
          </div>
          <p>This OTP will expire in 10 minutes.</p>
          <p><strong>Important:</strong> After confirming with this OTP, you will also need to enter your payout PIN to complete the transaction.</p>
          <p>If you did not initiate this payout, please ignore this email and contact support immediately.</p>
        </div>
      `,
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
    const formattedAmount = amount.includes('₦') || amount.includes('N') 
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
      'BANK_TRANSFER': 'Bank Transfer',
      'CARD': 'Card Payment',
      'USSD': 'USSD',
      'MANUAL_ADJUSTMENT': 'Manual Adjustment',
    };
    const paymentMethodText = paymentMethodMap[paymentMethodDisplay.toUpperCase()] || paymentMethodDisplay;

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Wallet Funding Successful - Galafy',
      text: `Hello ${userName}, Your Galapay wallet has been successfully funded. Amount: ${formattedAmount}, Date: ${formattedDate}, Payment method: ${paymentMethodText}. If you notice anything unusual, please reach out to us.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header with Galafy Logo -->
            <div style="background-color: #007bff; padding: 30px 20px; text-align: center;">
              <div style="color: #ffffff; font-size: 28px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px;">
                <span style="display: inline-block; width: 30px; height: 30px; background-color: #ffffff; border-radius: 4px; position: relative;">
                  <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #007bff; font-weight: bold; font-size: 20px;">G</span>
                </span>
                Galafy
              </div>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 30px 20px;">
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                Your Galapay wallet has been successfully funded.
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
                  <span style="font-size: 20px; margin-right: 10px; color: #007bff;">💰</span>
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
            </div>
          </div>
        </body>
        </html>
      `,
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
    const formattedAmount = amount.includes('N') ? amount : `N${parseFloat(amount).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    
    // Format date
    const formattedDate = requestDate 
      ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(requestDate)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date());
    
    // Get user's first name or default
    const userName = firstName || 'there';
    
    // Mask account number (show last 4 digits)
    const maskedAccount = accountNumber.length > 4 
      ? `${accountNumber.slice(0, -4).replace(/\d/g, '.')}${accountNumber.slice(-4)}`
      : accountNumber;
    
    // Format bank account display
    const bankAccountDisplay = bankName 
      ? `${bankName} .... ${accountNumber.slice(-4)}`
      : `.... ${accountNumber.slice(-4)}`;

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: isPending ? 'Withdrawal Request Received - Galafy' : `Withdrawal ${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()} - Galafy`,
      text: isPending 
        ? `Hello ${userName}, We've received your withdrawal request and it's currently being processed. Amount: ${formattedAmount}, Bank account: ${bankAccountDisplay}, Date: ${formattedDate}. If you did not initiate this request, please contact our Support team immediately.`
        : `Your withdrawal request of ${formattedAmount} has been ${status.toLowerCase()}. Account: ${bankAccountDisplay}, Reference: ${reference}${message ? `. Message: ${message}` : ''}`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header with Galafy Logo -->
            <div style="background-color: #007bff; padding: 30px 20px; text-align: center;">
              <div style="color: #ffffff; font-size: 28px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px;">
                <span style="display: inline-block; width: 30px; height: 30px; background-color: #ffffff; border-radius: 4px; position: relative;">
                  <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #007bff; font-weight: bold; font-size: 20px;">G</span>
                </span>
                Galafy
              </div>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 30px 20px;">
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                ${isPending 
                  ? "We've received your withdrawal request and it's currently being processed."
                  : isSuccess
                    ? `Your withdrawal request has been successfully processed.`
                    : isFailed
                      ? `Your withdrawal request could not be processed.`
                      : `Your withdrawal request status: ${status}.`
                }
              </p>
              
              ${isPending ? `
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
              ` : `
              <!-- Status Details Box -->
              <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 8px;">
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Amount:</strong> <span style="color: #007bff; font-weight: bold;">${formattedAmount}</span></p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Status:</strong> <span style="color: ${isSuccess ? '#28a745' : isFailed ? '#dc3545' : '#ffc107'}; font-weight: bold;">${status.charAt(0).toUpperCase() + status.slice(1).toLowerCase()}</span></p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Bank account:</strong> ${bankAccountDisplay}</p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Date:</strong> ${formattedDate}</p>
                <p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Reference:</strong> ${reference}</p>
                ${message ? `<p style="margin: 5px 0; color: #333333; font-size: 14px;"><strong>Message:</strong> ${message}</p>` : ''}
              </div>
              `}
              
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
            </div>
          </div>
        </body>
        </html>
      `,
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
    const statusColor = status.toLowerCase() === 'approved' || status.toLowerCase() === 'success' ? '#28a745' : status.toLowerCase() === 'pending' ? '#ffc107' : '#dc3545';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();
    
    // Format date for display
    const formattedDate = requestDate 
      ? new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(requestDate)
      : new Intl.DateTimeFormat('en-US', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date());
    
    // Get user's first name or default to a generic greeting
    const userName = firstName || 'there';
    
    // Status badge styling
    const statusBadgeColor = status.toLowerCase() === 'pending' ? '#fff3cd' : status.toLowerCase() === 'approved' || status.toLowerCase() === 'success' ? '#d4edda' : '#f8d7da';
    const statusDotColor = status.toLowerCase() === 'pending' ? '#ff9800' : status.toLowerCase() === 'approved' || status.toLowerCase() === 'success' ? '#28a745' : '#dc3545';

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Bank Account Update Request - Galafy',
      text: `Hello ${userName}, We received a request to update the bank account linked to your Galapay profile. Date: ${formattedDate}, Status: ${statusText}. If you did not initiate this request, please contact our Support team immediately.`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
          <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
            <!-- Header with Galafy Logo -->
            <div style="background-color: #007bff; padding: 30px 20px; text-align: center;">
              <div style="color: #ffffff; font-size: 28px; font-weight: bold; display: inline-flex; align-items: center; gap: 10px;">
                <span style="display: inline-block; width: 30px; height: 30px; background-color: #ffffff; border-radius: 4px; position: relative;">
                  <span style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); color: #007bff; font-weight: bold; font-size: 20px;">G</span>
                </span>
                Galafy
              </div>
            </div>
            
            <!-- Main Content -->
            <div style="padding: 30px 20px;">
              <!-- Greeting -->
              <h1 style="color: #333333; font-size: 24px; font-weight: bold; margin: 0 0 15px 0;">Hello ${userName},</h1>
              
              <!-- Main Message -->
              <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 25px 0;">
                We received a request to update the bank account linked to your Galapay profile.
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
                  <span style="font-size: 20px; margin-right: 10px; color: #007bff;">🛡️</span>
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
                    If you did not initiate this request, please contact our <a href="mailto:support@galafy.com" style="color: #007bff; text-decoration: underline;">Support</a> team immediately.
                  </p>
                </div>
              </div>
              
              <!-- Closing -->
              <p style="color: #333333; font-size: 14px; margin: 30px 0 0 0;">
                Warm regards,
              </p>
            </div>
          </div>
        </body>
        </html>
      `,
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
}

