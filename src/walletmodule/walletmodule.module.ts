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
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { ConfigModule } from '../config/config.module.js';
import { WithdrawalLimitService } from './services/withdrawal-limit.service.js';
import { DebitMandateModule } from '../common/debit-mandate/debit-mandate.module.js';
import { NipChargesService } from './services/nip-charges.service.js';
import { AccountRestrictionNotifyModule } from '../common/account-restriction/account-restriction-notify.module.js';

@Module({
  imports: [
    DatabaseModule,
    ProviderModule,
    UsersModule,
    CacheModule,
    ConfigModule,
    DebitMandateModule,
    AccountRestrictionNotifyModule,
  ],
  controllers: [WalletmoduleController],
  providers: [
    WalletmoduleService,
    PayoutSecurityService,
    WalletExportService,
    OrganizationWalletService,
    WalletRiskService,
    AmlLoggingService,
    WithdrawalLimitService,
    NipChargesService,
  ],
  exports: [WalletmoduleService, WithdrawalLimitService, OrganizationWalletService],
})
export class WalletmoduleModule {}
