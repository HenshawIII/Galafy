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
}

