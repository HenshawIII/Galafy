import { Global, Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { CacheModule } from '../../cache/cache.module.js';
import { TierLimitService } from '../services/tier-limit.service.js';
import { AccountRestrictionNotifyModule } from '../account-restriction/account-restriction-notify.module.js';

@Global()
@Module({
  imports: [DatabaseModule, CacheModule, AccountRestrictionNotifyModule],
  providers: [TierLimitService],
  exports: [TierLimitService],
})
export class TierLimitModule {}
