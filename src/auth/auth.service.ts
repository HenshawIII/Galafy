import { Injectable, UnauthorizedException } from '@nestjs/common';
import { UsersService } from '../users/users.service.js';
import { JwtService } from '@nestjs/jwt';
import { google } from 'googleapis';
import { config } from 'dotenv';
import { KycTier } from '../users/dto/create-user-dto.js';
config();

@Injectable()
export class AuthService {
    private client = new google.auth.OAuth2({
        clientId: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        redirectUri: process.env.GOOGLE_REDIRECT_URI,
    })
    constructor(private readonly usersService: UsersService, private readonly jwtService: JwtService) {}

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
          // Split name into firstName and lastName
          const nameParts = (user.name || user.email.split('@')[0]).split(' ');
          const firstName = nameParts[0] || user.email.split('@')[0];
          const lastName = nameParts.slice(1).join(' ') || '';

          dbUser = await this.usersService.create({
            firstName,
            lastName,
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
        
        // Generate JWT token with same structure as regular login
        const token = this.jwtService.sign({
            sub: dbUser.id,
            email: dbUser.email,
            firstName: dbUser.firstName,
            lastName: dbUser.lastName,
        });
        
        return {
            access_token: token,
            user: userWithoutPassword,
        }
    }
    
    
}
