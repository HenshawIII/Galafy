import { Module, forwardRef } from '@nestjs/common';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ConfigModule } from '../config/config.module.js';
import { InternalLedgerModule } from '../common/internal-ledger/internal-ledger.module.js';

@Module({
  imports: [DatabaseModule, InternalLedgerModule, UsersModule, forwardRef(() => NotificationsModule), ConfigModule],
  controllers: [WebhooksController],
  providers: [WebhooksService, OrganizationWalletService, WalletRiskService, AmlLoggingService],
  exports: [WebhooksService],
})
export class PaymentsModule {}
