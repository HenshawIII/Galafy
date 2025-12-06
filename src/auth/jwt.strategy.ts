import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../database/database.service.js';
import { config } from 'dotenv';
config();

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly databaseService: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    // Ensure this is an access token, not a refresh token
    if (payload.type && payload.type !== 'access') {
      throw new UnauthorizedException('Invalid token type. Access token required.');
    }

    // Payload contains: sub (user id), email, firstName, lastName
    const user = await this.databaseService.user.findUnique({
      where: { id: payload.sub },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Return user object that will be attached to request.user
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName || null,
      lastName: user.lastName || null,
    };
  }
}

