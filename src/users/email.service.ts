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
  ): Promise<void> {
    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Wallet Funding Successful',
      text: `Your wallet has been funded with ${amount}. Account: ${accountNumber}, Reference: ${reference}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #28a745;">Wallet Funding Successful</h2>
          <p>Your wallet has been successfully funded.</p>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
            <p style="margin: 5px 0;"><strong>Account Number:</strong> ${accountNumber}</p>
            <p style="margin: 5px 0;"><strong>Transaction Reference:</strong> ${reference}</p>
          </div>
          <p>If you did not initiate this funding, please contact support immediately.</p>
        </div>
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
  ): Promise<void> {
    const statusColor = status.toLowerCase() === 'success' ? '#28a745' : status.toLowerCase() === 'failed' ? '#dc3545' : '#ffc107';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: `Withdrawal ${statusText}`,
      text: `Your withdrawal request of ${amount} has been ${statusText.toLowerCase()}. Account: ${accountNumber}, Reference: ${reference}${message ? `. Message: ${message}` : ''}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: ${statusColor};">Withdrawal ${statusText}</h2>
          <p>Your withdrawal request has been ${statusText.toLowerCase()}.</p>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>Amount:</strong> ${amount}</p>
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
            <p style="margin: 5px 0;"><strong>Account Number:</strong> ${accountNumber}</p>
            <p style="margin: 5px 0;"><strong>Transaction Reference:</strong> ${reference}</p>
            ${message ? `<p style="margin: 5px 0;"><strong>Message:</strong> ${message}</p>` : ''}
          </div>
          ${status.toLowerCase() === 'failed' ? '<p style="color: #dc3545;">If you believe this is an error, please contact support.</p>' : ''}
        </div>
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
  ): Promise<void> {
    const statusColor = status.toLowerCase() === 'approved' || status.toLowerCase() === 'success' ? '#28a745' : status.toLowerCase() === 'pending' ? '#ffc107' : '#dc3545';
    const statusText = status.charAt(0).toUpperCase() + status.slice(1).toLowerCase();

    const msg = {
      to: email,
      from: process.env.SMTP_USER || process.env.SENDGRID_FROM || 'noreply@example.com',
      subject: 'Bank Account Change Request',
      text: `Your bank account change request has been ${statusText.toLowerCase()}. Old Account: ${oldAccountNumber}, New Account: ${newAccountNumber}, Bank Code: ${bankCode}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Bank Account Change Request</h2>
          <p>Your bank account change request has been ${statusText.toLowerCase()}.</p>
          <div style="background-color: #f4f4f4; padding: 20px; margin: 20px 0; border-radius: 5px;">
            <p style="margin: 5px 0;"><strong>Status:</strong> <span style="color: ${statusColor}; font-weight: bold;">${statusText}</span></p>
            <p style="margin: 5px 0;"><strong>Previous Account:</strong> ${oldAccountNumber}</p>
            <p style="margin: 5px 0;"><strong>New Account:</strong> ${newAccountNumber}</p>
            <p style="margin: 5px 0;"><strong>Bank Code:</strong> ${bankCode}</p>
          </div>
          ${status.toLowerCase() === 'pending' ? '<p>Your request is being reviewed. You will be notified once it is processed.</p>' : ''}
          ${status.toLowerCase() === 'rejected' ? '<p style="color: #dc3545;">If you believe this is an error, please contact support.</p>' : ''}
          <p>If you did not request this change, please contact support immediately.</p>
        </div>
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

