import { Injectable, Inject } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  /**
   * Get a value from cache
   */
  async get<T>(key: string): Promise<T | undefined> {
    return this.cacheManager.get<T>(key);
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param ttl Time to live in seconds (optional, uses default if not provided)
   */
  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
  }

  /**
   * Delete a value from cache
   */
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
  }

  /**
   * Reset/clear all cache
   */
  async reset(): Promise<void> {
    await this.cacheManager.clear();
  }

  /**
   * Helper for user-specific cache keys
   */
  getUserKey(userId: string, suffix: string): string {
    return `user:${userId}:${suffix}`;
  }

  /**
   * Helper for event-specific cache keys
   */
  getEventKey(eventId: string, suffix: string): string {
    return `event:${eventId}:${suffix}`;
  }

  /**
   * Helper for spray-specific cache keys
   */
  getSprayKey(sprayId: string, suffix: string): string {
    return `spray:${sprayId}:${suffix}`;
  }

  /**
   * Invalidate all cache entries for a user
   */
  async invalidateUserCache(userId: string): Promise<void> {
    // Note: This is a simple implementation
    // For production, you might want to track keys or use patterns
    const keys = [
      this.getUserKey(userId, 'details'),
      this.getUserKey(userId, 'profile'),
      this.getUserKey(userId, 'settings'),
    ];
    await Promise.all(keys.map((key) => this.del(key)));
  }

  /**
   * Invalidate all cache entries for an event
   */
  async invalidateEventCache(eventId: string): Promise<void> {
    const keys = [
      this.getEventKey(eventId, 'details'),
      this.getEventKey(eventId, 'participants'),
      this.getEventKey(eventId, 'leaderboard'),
    ];
    await Promise.all(keys.map((key) => this.del(key)));
  }
}
