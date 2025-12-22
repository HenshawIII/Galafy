import { Module } from '@nestjs/common';
import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import { redisStore } from 'cache-manager-redis-store';
import { config } from 'dotenv';
import { CacheService } from './cache.service.js';

config();

@Module({
  imports: [
    NestCacheModule.registerAsync({
      useFactory: async () => {
        // Support both Redis URL (for Render/production) and host/port (for local)
        let store;
        
        if (process.env.REDIS_URL) {
          // Parse Redis URL (format: redis://[:password@]host[:port][/database])
          const redisUrl = new URL(process.env.REDIS_URL);
          store = await redisStore({
            socket: {
              host: redisUrl.hostname,
              port: parseInt(redisUrl.port || '6379'),
            },
            password: redisUrl.password || undefined,
            database: redisUrl.pathname ? parseInt(redisUrl.pathname.slice(1)) : 0,
          });
        } else {
          // Use host/port configuration (for local development)
          store = await redisStore({
            socket: {
              host: process.env.REDIS_HOST || 'localhost',
              port: parseInt(process.env.REDIS_PORT || '6379'),
            },
            password: process.env.REDIS_PASSWORD || undefined,
            database: parseInt(process.env.REDIS_DB || '0'),
          });
        }
        
        return {
          store: () => store,
          ttl: parseInt(process.env.REDIS_TTL || '3600'), // Default 1 hour
        };
      },
      isGlobal: true, // Make it available globally
    }),
  ],
  providers: [CacheService],
  exports: [NestCacheModule, CacheService],
})
export class CacheModule {}
