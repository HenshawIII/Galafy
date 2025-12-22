import { ThrottlerStorage } from '@nestjs/throttler';
import type { Cache } from 'cache-manager';

/**
 * Storage record interface matching ThrottlerStorageRecord
 * Not exported from @nestjs/throttler, so we define it locally
 */
interface ThrottlerStorageRecord {
  totalHits: number;
  timeToExpire: number;
  isBlocked: boolean;
  timeToBlockExpire: number;
}

/**
 * Custom Redis storage for ThrottlerModule
 * Uses the existing Redis cache connection
 */
export class ThrottlerRedisStorage implements ThrottlerStorage {
  constructor(private cacheManager: Cache) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const now = Date.now();
    
    // Get existing records
    const cached = await this.cacheManager.get<number[]>(key);
    const records = cached || [];
    
    // Filter out expired records
    const validRecords = records.filter((timestamp) => timestamp > now - ttl);
    
    // Check if blocked (exceeded limit)
    const isBlocked = validRecords.length >= limit;
    
    // Add current timestamp if not blocked
    if (!isBlocked) {
      validRecords.push(now);
    }
    
    // Calculate time to expire (in seconds)
    const oldestRecord = validRecords.length > 0 ? Math.min(...validRecords) : now;
    const timeToExpire = Math.max(0, Math.ceil((oldestRecord + ttl - now) / 1000));
    
    // Store with TTL (convert milliseconds to seconds)
    await this.cacheManager.set(key, validRecords, Math.ceil(ttl / 1000));
    
    // Return storage record
    return {
      totalHits: validRecords.length,
      timeToExpire,
      isBlocked,
      timeToBlockExpire: isBlocked ? Math.ceil(blockDuration / 1000) : 0,
    };
  }
}
