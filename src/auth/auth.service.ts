import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { CustomerKycService } from '../customer-kyc/customer-kyc.service.js';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import { config } from 'dotenv';
config();

@Injectable()
export class AuthService {
    private client: OAuth2Client;
    
    constructor(
        private readonly usersService: UsersService,
        private readonly customerKycService: CustomerKycService,
        private readonly jwtService: JwtService,
        private readonly databaseService: DatabaseService,
    ) {
        // Validate Google OAuth configuration
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            console.error('GOOGLE_CLIENT_ID environment variable is not set');
            throw new Error('GOOGLE_CLIENT_ID environment variable is required');
        }
        
        this.client = new google.auth.OAuth2({
            clientId: clientId,
        });
    }

    async validateGoogleToken(token: string) {
        // Check if GOOGLE_CLIENT_ID is set
        if (!process.env.GOOGLE_CLIENT_ID) {
            console.error('GOOGLE_CLIENT_ID is not configured');
            throw new UnauthorizedException('Google OAuth is not properly configured');
        }

        try {
            // Decode token to get audience (client ID) without verification
            // This helps debug client ID mismatches
            let tokenAudience: string | undefined;
            try {
                const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                tokenAudience = decoded.aud;
            } catch (decodeError) {
                // If we can't decode, continue with verification attempt
            }

            const configuredClientId = process.env.GOOGLE_CLIENT_ID;
            const ticket = await this.client.verifyIdToken({
                idToken: token,
                audience: configuredClientId,
            });
            
            const payload = ticket.getPayload();
            if (!payload) {
                console.error('Google token verification returned no payload');
                throw new UnauthorizedException('Invalid token: No payload received');
            }

            if (!payload.email) {
                console.error('Google token payload missing email');
                throw new UnauthorizedException('Invalid token: Email not found in token');
            }

            return {
                email: payload.email as string,
                name: payload.name as string,
            };
        } catch (error: any) {
            // Decode token to get audience for debugging
            let tokenAudience: string | undefined;
            try {
                const decoded = JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
                tokenAudience = decoded.aud;
            } catch (decodeError) {
                // If we can't decode, that's okay
            }

            const configuredClientId = process.env.GOOGLE_CLIENT_ID;
            // Log partial client IDs for debugging (first 10 and last 4 chars)
            const logClientId = configuredClientId 
                ? `${configuredClientId.substring(0, 10)}...${configuredClientId.substring(configuredClientId.length - 4)}`
                : 'missing';
            const logTokenAudience = tokenAudience
                ? `${tokenAudience.substring(0, 10)}...${tokenAudience.substring(tokenAudience.length - 4)}`
                : 'unknown';

            // Log the actual error for debugging
            console.error('Google token validation error:', {
                message: error.message,
                code: error.code,
                name: error.name,
                configuredClientId: logClientId,
                tokenAudience: logTokenAudience,
                clientIdsMatch: configuredClientId === tokenAudience,
            });

            // Provide more specific error messages
            if (error.message?.includes('audience') || error.message?.includes('Wrong recipient')) {
                throw new UnauthorizedException(
                    `Invalid token: Client ID mismatch. ` +
                    `The token was issued for a different Google OAuth client ID than configured. ` +
                    `Please ensure your mobile app uses the same client ID as configured in GOOGLE_CLIENT_ID environment variable.`
                );
            }
            
            if (error.message?.includes('expired')) {
                throw new UnauthorizedException('Invalid token: Token has expired');
            }

            if (error.message?.includes('malformed')) {
                throw new UnauthorizedException('Invalid token: Token format is invalid');
            }

            // Generic error with more context
            throw new UnauthorizedException(`Invalid Google token: ${error.message || 'Token verification failed'}`);
        }
    }
    async googleLogin(idtoken: string) {
        const user = await this.validateGoogleToken(idtoken);
        if (!user) {
            throw new UnauthorizedException('Invalid token/Bad Request3');
        }
        // console.log("user", user);
        let dbUser = await this.usersService.findByEmail(user.email);
        if (!dbUser) {
          // Generate username from email prefix (part before @)
          const emailPrefix = user.email.split('@')[0]
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20); // Limit to 20 characters
          
          // Ensure emailPrefix is not empty (fallback to 'user' if all characters were removed)
          const baseUsername = emailPrefix || 'user';
          
          // First, try to use the email prefix as-is
          let username = baseUsername;
          let existingUser = await this.databaseService.user.findUnique({
            where: { username },
          });
          
          // If username is taken, add random suffix
          if (existingUser) {
            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            username = `${baseUsername}${randomSuffix}`;
            
            // Check if this username is also taken (retry if needed)
            existingUser = await this.databaseService.user.findUnique({
              where: { username },
            });
            
            // If still taken after adding suffix, use timestamp
            if (existingUser) {
              const timestamp = Date.now().toString().slice(-6);
              username = `${baseUsername}${timestamp}`;
            }
          }

          dbUser = await this.usersService.create({
            username: username,
            email: user.email,
            // No password for Google OAuth users
            isVerified: true,
          }) as any;
        }
        
        // At this point, dbUser is guaranteed to exist
        if (!dbUser) {
            throw new UnauthorizedException('Failed to create or retrieve user');
        }
        
        // Remove password from response for security
        const { password, ...userWithoutPassword } = dbUser as any;
        
        // Generate access token (short-lived: 15 minutes)
        const accessToken = this.jwtService.sign(
            {
                sub: dbUser.id,
                email: dbUser.email,
                firstName: dbUser.firstName || null,
                lastName: dbUser.lastName || null,
                type: 'access',
            },
            {
                expiresIn: '15m', // Access token expires in 15 minutes
            },
        );

        // Generate refresh token (long-lived: 7 days)
        const refreshToken = this.jwtService.sign(
            {
                sub: dbUser.id,
                email: dbUser.email,
                type: 'refresh',
            },
            {
                expiresIn: '7d', // Refresh token expires in 7 days
                secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET, // Use separate secret if available
            },
        );

        // Calculate refresh token expiration date
        const refreshTokenExpiresAt = new Date();
        refreshTokenExpiresAt.setDate(refreshTokenExpiresAt.getDate() + 7); // 7 days from now

        // Store refresh token in database
        await this.databaseService.user.update({
            where: { id: dbUser.id },
            data: {
                refreshToken,
                refreshTokenExpiresAt,
            },
        });
        
        // Get KYC status if customer exists
        let kycStatus: any = null;
        try {
            kycStatus = await this.customerKycService.getCustomerKycStatusByUserId(dbUser.id);
        } catch (error) {
            // Customer might not exist yet, which is fine - return null for kycStatus
            kycStatus = null;
        }
        
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            user: userWithoutPassword,
            kycStatus,
        }
    }

    /**
     * Refresh access token using refresh token
     */
    async refreshToken(refreshToken: string) {
        try {
            // Verify refresh token
            const payload = this.jwtService.verify(refreshToken, {
                secret: process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET,
            });

            // Check if token type is refresh
            if (payload.type !== 'refresh') {
                throw new UnauthorizedException('Invalid token type');
            }

            // Find user and verify refresh token matches stored token
            const user = await this.databaseService.user.findUnique({
                where: { id: payload.sub },
            });

            if (!user) {
                throw new UnauthorizedException('User not found');
            }

            // Verify refresh token matches stored token
            if (user.refreshToken !== refreshToken) {
                throw new UnauthorizedException('Invalid refresh token');
            }

            // Check if refresh token has expired
            if (user.refreshTokenExpiresAt && user.refreshTokenExpiresAt < new Date()) {
                throw new UnauthorizedException('Refresh token has expired');
            }

            // Generate new access token
            const accessToken = this.jwtService.sign(
                {
                    sub: user.id,
                    email: user.email,
                    firstName: user.firstName || null,
                    lastName: user.lastName || null,
                    type: 'access',
                },
                {
                    expiresIn: '15m', // Access token expires in 15 minutes
                },
            );

            return {
                access_token: accessToken,
            };
        } catch (error: any) {
            if (error.name === 'TokenExpiredError') {
                throw new UnauthorizedException('Refresh token has expired');
            }
            if (error.name === 'JsonWebTokenError') {
                throw new UnauthorizedException('Invalid refresh token');
            }
            throw error;
        }
    }

    /**
     * Logout - invalidate refresh token
     */
    async logout(userId: string) {
        // Clear refresh token from database
        await this.databaseService.user.update({
            where: { id: userId },
            data: {
                refreshToken: null,
                refreshTokenExpiresAt: null,
            },
        });

        return { message: 'Logged out successfully' };
    }
}
