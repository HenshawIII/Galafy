import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { DatabaseService } from '../../database/database.service.js';
import { config } from 'dotenv';
config();

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy, 'admin-jwt') {
  constructor(private readonly databaseService: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey:
        process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET || 'your-secret-key',
    });
  }

  async validate(payload: any) {
    // Ensure this is an admin access token
    if (payload.type && payload.type !== 'admin_access') {
      throw new UnauthorizedException(
        'Invalid token type. Admin access token required.',
      );
    }

    // Payload contains: sub (admin id), email, role
    const admin = await this.databaseService.admin.findUnique({
      where: { id: payload.sub },
    });

    if (!admin) {
      throw new UnauthorizedException('Admin not found');
    }

    if (!admin.isActive) {
      throw new UnauthorizedException('Admin account is deactivated');
    }

    // Return admin object that will be attached to request.admin
    return {
      id: admin.id,
      email: admin.email,
      role: admin.role,
    };
  }
}

