import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { DatabaseService } from '../database/database.service.js';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { KycTier } from '../users/dto/create-user-dto.js';
config();

@Injectable()
export class AuthService {
    private client = new google.auth.OAuth2({
        clientId: process.env.GOOGLE_CLIENT_ID,
        
    })
    constructor(
        private readonly usersService: UsersService,
        private readonly jwtService: JwtService,
        private readonly databaseService: DatabaseService,
    ) {}

    async validateGoogleToken(token: string) {
        try {
            const ticket = await this.client.verifyIdToken({
                idToken: token,
                audience: process.env.GOOGLE_CLIENT_ID,
            });
            const payload = ticket.getPayload();
            if (!payload) {
                throw new UnauthorizedException('Invalid token/Bad Request1');
            }
            // console.log(payload);
            return {email: payload?.email as string,
                 name: payload?.name as string};
        } catch (error) {
            throw new UnauthorizedException('Invalid token/Bad Request2');
        }
    }
    async googleLogin(idtoken: string) {
        const user = await this.validateGoogleToken(idtoken);
        if (!user) {
            throw new UnauthorizedException('Invalid token/Bad Request3');
        }
        let dbUser = await this.usersService.findByEmail(user.email);
        if (!dbUser) {
          // Generate username from email (use part before @) or name
          // Remove special characters and make lowercase
          const baseUsername = (user.name || user.email.split('@')[0])
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 20); // Limit to 20 characters
          
          // Generate unique username with retry logic
          let username: string;
          let attempts = 0;
          const maxAttempts = 10;
          
          do {
            const randomSuffix = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
            username = `${baseUsername}${randomSuffix}`;
            
            const existingUser = await this.databaseService.user.findUnique({
              where: { username },
            });
            
            if (!existingUser) {
              break; // Username is available
            }
            
            attempts++;
          } while (attempts < maxAttempts);
          
          // If still not unique after max attempts, use timestamp
          if (attempts >= maxAttempts) {
            const timestamp = Date.now().toString().slice(-6);
            username = `${baseUsername}${timestamp}`;
          }

          dbUser = await this.usersService.create({
            username,
            email: user.email,
            // No password for Google OAuth users
            kycTier: KycTier.Tier_0,
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
        
        return {
            access_token: accessToken,
            refresh_token: refreshToken,
            user: userWithoutPassword,
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
