import { Injectable, ExecutionContext, CanActivate, HttpException, HttpStatus } from '@nestjs/common';
import { CacheService } from '../../cache/cache.service.js';

/**
 * Redis-based rate limiter for spray creation
 * Limits to 10 sprays per second per user
 * Uses Redis for distributed rate limiting across multiple instances
 */
@Injectable()
export class SprayRateLimitGuard implements CanActivate {
  private readonly maxRequests = 10;
  private readonly windowMs = 1000; // 1 second in milliseconds
  private readonly cacheKeyPrefix = 'spray:rate:';

  constructor(private readonly cacheService: CacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      return true; // Let JWT guard handle authentication
    }

    const key = `${this.cacheKeyPrefix}${userId}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    try {
      // Get current count from Redis
      const cached = await this.cacheService.get<{ count: number; resetAt: number }>(key);

      if (cached) {
        // Check if we're still in the same window
        if (cached.resetAt > now) {
          // Still in the same window, check count
          if (cached.count >= this.maxRequests) {
            throw new HttpException(
              'Rate limit exceeded: Maximum 10 sprays per second allowed',
              HttpStatus.TOO_MANY_REQUESTS,
            );
          }
          // Increment count
          await this.cacheService.set(
            key,
            { count: cached.count + 1, resetAt: cached.resetAt },
            Math.ceil((cached.resetAt - now) / 1000), // TTL in seconds
          );
        } else {
          // Window expired, start new window
          await this.cacheService.set(
            key,
            { count: 1, resetAt: now + this.windowMs },
            Math.ceil(this.windowMs / 1000), // TTL in seconds (1 second)
          );
        }
      } else {
        // No existing entry, start new window
        await this.cacheService.set(
          key,
          { count: 1, resetAt: now + this.windowMs },
          Math.ceil(this.windowMs / 1000), // TTL in seconds (1 second)
        );
      }

      return true;
    } catch (error: any) {
      // If it's our rate limit exception, re-throw it
      if (error instanceof HttpException && error.getStatus() === HttpStatus.TOO_MANY_REQUESTS) {
        throw error;
      }
      // For Redis errors, log and allow the request (fail open)
      console.error('Redis rate limit error:', error.message);
      return true;
    }
  }
}

