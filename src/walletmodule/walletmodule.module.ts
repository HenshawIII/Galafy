import { Module } from '@nestjs/common';
import { WalletmoduleService } from './walletmodule.service.js';
import { WalletmoduleController } from './walletmodule.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { PayoutSecurityService } from './services/payout-security.service.js';
import { WalletExportService } from './services/wallet-export.service.js';
import { UsersModule } from '../users/users.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';

@Module({
  imports: [DatabaseModule, ProviderModule, UsersModule, CacheModule],
  controllers: [WalletmoduleController],
  providers: [WalletmoduleService, PayoutSecurityService, WalletExportService, OrganizationWalletService],
  exports: [WalletmoduleService],
})
export class WalletmoduleModule {}
