import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LiveModule } from '../live/live.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { EventsModule } from '../events/events.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { SpraysController } from './sprays.controller.js';
import { SpraysService } from './sprays.service.js';
import { SprayRateLimitGuard } from './guards/spray-rate-limit.guard.js';

@Module({
  imports: [
    DatabaseModule,
    LiveModule,
    ProviderModule,
    CacheModule,
    EventsModule,
    forwardRef(() => NotificationsModule),
  ],
  controllers: [SpraysController],
  providers: [SpraysService, SprayRateLimitGuard],
  exports: [SpraysService],
})
export class SpraysModule {}

