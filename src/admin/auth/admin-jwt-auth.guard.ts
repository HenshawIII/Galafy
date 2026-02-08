import {
  Injectable,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_ADMIN_PUBLIC_KEY } from './decorators/public.decorator.js';

@Injectable()
export class AdminJwtAuthGuard extends AuthGuard('admin-jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_ADMIN_PUBLIC_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, admin: any, info: any, context: ExecutionContext) {
    // If there's an error or no admin, provide helpful error messages
    if (err || !admin) {
      // Handle specific JWT errors
      if (info) {
        switch (info.name) {
          case 'TokenExpiredError':
            throw new UnauthorizedException(
              'Your admin session has expired. Please log in again.',
            );
          case 'JsonWebTokenError':
            throw new UnauthorizedException(
              'Invalid admin authentication token. Please provide a valid token.',
            );
          case 'NotBeforeError':
            throw new UnauthorizedException('Token is not yet valid.');
          default:
            // Check if token is missing
            if (
              info.message === 'No auth token' ||
              info.message?.includes('No auth token')
            ) {
              throw new UnauthorizedException(
                'Admin authentication token is required. Please provide a valid Bearer token.',
              );
            }
            throw new UnauthorizedException(
              'Admin authentication failed. Please log in again.',
            );
        }
      }

      // If there's an error but no info, it might be a different type of error
      if (err) {
        throw err;
      }

      // Default case: no admin and no specific error info
      throw new UnauthorizedException(
        'Admin authentication required. Please provide a valid authentication token.',
      );
    }

    return admin;
  }
}

