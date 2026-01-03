import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { OrganizationWalletService } from '../common/services/organization-wallet.service.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [DatabaseModule, ProviderModule, UsersModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, WebhooksService, OrganizationWalletService, WalletRiskService, AmlLoggingService],
  exports: [PaymentsService, WebhooksService],
})
export class PaymentsModule {}
