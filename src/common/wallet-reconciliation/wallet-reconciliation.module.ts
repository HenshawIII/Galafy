import { Module } from '@nestjs/common';
import { ProviderModule } from '../../provider/provider.module.js';
import { CacheModule } from '../../cache/cache.module.js';
import { WalletReconciliationService } from './wallet-reconciliation.service.js';

@Module({
  imports: [ProviderModule, CacheModule],
  providers: [WalletReconciliationService],
  exports: [WalletReconciliationService],
})
export class WalletReconciliationModule {}
