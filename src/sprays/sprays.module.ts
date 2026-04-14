import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { LiveModule } from '../live/live.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { DebitMandateModule } from '../common/debit-mandate/debit-mandate.module.js';
import { SpraysController } from './sprays.controller.js';
import { SpraysService } from './sprays.service.js';
import { SprayRateLimitGuard } from './guards/spray-rate-limit.guard.js';

@Module({
  imports: [DatabaseModule, ProviderModule, LiveModule, CacheModule, DebitMandateModule],
  controllers: [SpraysController],
  providers: [SpraysService, SprayRateLimitGuard],
  exports: [SpraysService],
})
export class SpraysModule {}
