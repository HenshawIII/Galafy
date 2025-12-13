import { Injectable, ExecutionContext, CanActivate, HttpException, HttpStatus } from '@nestjs/common';

/**
 * Simple in-memory rate limiter for spray creation
 * Limits to 5 sprays per second per user
 * Can be moved to Redis later for distributed systems
 */
@Injectable()
export class SprayRateLimitGuard implements CanActivate {
  private readonly requestStore = new Map<string, number[]>();
  private readonly maxRequests = 5;
  private readonly windowMs = 1000; // 1 second

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id;

    if (!userId) {
      return true; // Let JWT guard handle authentication
    }

    const key = `spray:${userId}`;
    const now = Date.now();
    const windowStart = now - this.windowMs;

    // Get existing requests in the window
    const requests = this.requestStore.get(key) || [];

    // Filter requests within the time window
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart);

    if (recentRequests.length >= this.maxRequests) {
      throw new HttpException(
        'Rate limit exceeded: Maximum 5 sprays per second allowed',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    // Add current request
    recentRequests.push(now);
    this.requestStore.set(key, recentRequests);

    // Clean up old entries asynchronously
    this.cleanup(key, now);

    return true;
  }

  private cleanup(key: string, now: number): void {
    setTimeout(() => {
      const requests = this.requestStore.get(key);
      if (requests) {
        const filtered = requests.filter((timestamp) => timestamp > now - this.windowMs);
        if (filtered.length === 0) {
          this.requestStore.delete(key);
        } else {
          this.requestStore.set(key, filtered);
        }
      }
    }, this.windowMs * 2); // Clean up after 2 seconds
  }
}

