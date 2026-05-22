import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CacheModule } from '../../cache/cache.module.js';
import { TierLimitService } from '../services/tier-limit.service.js';

@Global()
@Module({
  imports: [DatabaseModule, CacheModule],
  providers: [TierLimitService],
  exports: [TierLimitService],
})
export class TierLimitModule {}
