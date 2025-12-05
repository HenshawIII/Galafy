import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from './public.decorator.js';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);

    if (isPublic) {
      return true;
    }

    return super.canActivate(context);
  }

  handleRequest(err: any, user: any, info: any, context: ExecutionContext) {
    // If there's an error or no user, provide helpful error messages
    if (err || !user) {
      // Handle specific JWT errors
      if (info) {
        switch (info.name) {
          case 'TokenExpiredError':
            throw new UnauthorizedException('Your session has expired. Please log in again.');
          case 'JsonWebTokenError':
            throw new UnauthorizedException('Invalid authentication token. Please provide a valid token.');
          case 'NotBeforeError':
            throw new UnauthorizedException('Token is not yet valid.');
          default:
            // Check if token is missing
            if (info.message === 'No auth token' || info.message?.includes('No auth token')) {
              throw new UnauthorizedException('Authentication token is required. Please provide a valid Bearer token.');
            }
            throw new UnauthorizedException('Authentication failed. Please log in again.');
        }
      }
      
      // If there's an error but no info, it might be a different type of error
      if (err) {
        throw err;
      }
      
      // Default case: no user and no specific error info
      throw new UnauthorizedException('Authentication required. Please provide a valid authentication token.');
    }

    return user;
  }
}

