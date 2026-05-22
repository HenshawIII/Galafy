import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { UsersModule } from './users/users.module.js';
import { DatabaseModule } from './database/database.module.js';
import { CacheModule } from './cache/cache.module.js';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { ThrottlerRedisStorage } from './cache/throttler-redis.storage.js';
import { ScheduleModule } from '@nestjs/schedule';
import { APP_GUARD } from '@nestjs/core';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { AuthModule } from './auth/auth.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';
import { CustomerKycModule } from './customer-kyc/customer-kyc.module.js';
import { WalletmoduleModule } from './walletmodule/walletmodule.module.js';
import { PaymentsModule } from './payments/payments.module.js';
import { BankDirectoryModule } from './bank-directory/bank-directory.module.js';
import { ProviderModule } from './provider/provider.module.js';
import { AdminModule } from './admin/admin.module.js';
import { EventsModule } from './events/events.module.js';
import { LiveModule } from './live/live.module.js';
import { SpraysModule } from './sprays/sprays.module.js';
import { BvnCryptoModule } from './common/crypto/bvn-crypto.module.js';
import { TierLimitModule } from './common/tier-limit/tier-limit.module.js';

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduled tasks
    CacheModule, // Redis cache module (global)
    BvnCryptoModule,
    TierLimitModule,
    UsersModule,
    DatabaseModule,
    ThrottlerModule.forRootAsync({
      imports: [CacheModule],
      useFactory: (cacheManager: any) => ({
        storage: new ThrottlerRedisStorage(cacheManager),
        throttlers: [
          {
            name: 'short',
            ttl: 60000, // 60 seconds
            limit: 10, // 10 requests per 60 seconds
          },
        ],
      }),
      inject: [CACHE_MANAGER],
    }),
    AuthModule,
    NotificationsModule,
    CustomerKycModule,
    WalletmoduleModule,
    PaymentsModule,
    BankDirectoryModule,
    ProviderModule,
    AdminModule,
    EventsModule,
    LiveModule,
    SpraysModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
  ],
})
export class AppModule {}
