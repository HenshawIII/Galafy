import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { config } from 'dotenv';
config();

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "mail.privateemail.com",
      port: parseInt(process.env.SMTP_PORT || '465', 10),
      secure: true, // true for 465, false for other ports
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASSWORD,
      },
      connectionTimeout: 10000, // 10 seconds
      greetingTimeout: 10000,
      socketTimeout: 10000,
      tls: {
        rejectUnauthorized: false, // Allow self-signed certificates
      },
    });

    // Verify SMTP connection on startup
    this.transporter.verify((error, success) => {
      if (error) {
        const err = error as any; // nodemailer error has additional properties
        console.error('SMTP verify error:', error.message);
        console.error('Error code:', err.code);
        console.error('Error command:', err.command);
        console.error('Error response:', err.response);
        
        // Diagnose the issue
        if (err.code === 'ETIMEDOUT' || err.code === 'ECONNREFUSED' || err.code === 'ENOTFOUND') {
          console.error('❌ CONNECTION ERROR: Render cannot reach the SMTP server');
          console.error('This is a platform/network issue - Render blocks outbound SMTP connections');
          console.error('Solution: Use a cloud email service like SendGrid that works with Render');
        } else if (err.code === 'EAUTH' || err.responseCode === 535) {
          console.error('✅ CONNECTION WORKS! But authentication failed');
          console.error('This means Render CAN reach the server, but credentials are wrong');
          console.error('Check your SMTP_USER and SMTP_PASSWORD environment variables');
        } else if (err.code === 'ETLS' || err.code === 'ESOCKET') {
          console.error('⚠️  TLS/SSL Error: Connection works but TLS handshake failed');
          console.error('Try setting SMTP_PORT=587 and secure=false');
        } else {
          console.error('Unknown error type:', err.code);
        }
      } else {
        console.log('✅ SMTP is ready to send messages');
        console.log('Connected to:', process.env.SMTP_HOST || "mail.privateemail.com");
      }
    });
  }

  async sendVerificationCode(email: string, code: string): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Verify Your Account',
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
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Verification email sent to ${email}`);
    } catch (error: any) {
      console.error('❌ Error sending verification email:', error.message);
      console.error('Error code:', error.code);
      console.error('Error command:', error.command);
      console.error('Error response:', error.response);
      
      // Provide specific error message based on error type
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        throw new Error(`SMTP connection timeout - Render cannot reach ${process.env.SMTP_HOST || 'mail.privateemail.com'}. This is a platform network restriction.`);
      } else if (error.code === 'EAUTH') {
        throw new Error('SMTP authentication failed - check your SMTP_USER and SMTP_PASSWORD');
      } else {
        throw new Error(`Failed to send verification email: ${error.message}`);
      }
    }
  }

  async sendPasswordResetLink(email: string, resetLink: string): Promise<void> {
    const mailOptions = {
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: email,
      subject: 'Password Reset Request',
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
      await this.transporter.sendMail(mailOptions);
      console.log(`✅ Password reset email sent to ${email}`);
    } catch (error: any) {
      console.error('❌ Error sending password reset email:', error.message);
      console.error('Error code:', error.code);
      console.error('Error command:', error.command);
      console.error('Error response:', error.response);
      
      // Provide specific error message based on error type
      if (error.code === 'ETIMEDOUT' || error.code === 'ECONNREFUSED') {
        throw new Error(`SMTP connection timeout - Render cannot reach ${process.env.SMTP_HOST || 'mail.privateemail.com'}. This is a platform network restriction.`);
      } else if (error.code === 'EAUTH') {
        throw new Error('SMTP authentication failed - check your SMTP_USER and SMTP_PASSWORD');
      } else {
        throw new Error(`Failed to send password reset email: ${error.message}`);
      }
    }
  }
}

