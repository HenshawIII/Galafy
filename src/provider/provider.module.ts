import { Module, forwardRef } from '@nestjs/common';
import { ProviderService } from './provider.service.js';
import { ProviderController } from './provider.controller.js';
import { ProviderCallbackController } from './provider-callback.controller.js';
import { ProviderCallbackService } from './provider-callback.service.js';
import { ProviderTxnCallbackController } from './provider-txn-callback.controller.js';
import { ProviderTxnCallbackService } from './provider-txn-callback.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { InflowCreditModule } from '../common/inflow-credit/inflow-credit.module.js';
import { ConfigModule } from '../config/config.module.js';
import { UsersModule } from '../users/users.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { WalletRiskService } from '../common/services/wallet-risk.service.js';
import { AmlLoggingService } from '../common/services/aml-logging.service.js';

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => InflowCreditModule),
    ConfigModule,
    forwardRef(() => UsersModule),
    NotificationsModule,
  ],
  controllers: [ProviderController, ProviderCallbackController, ProviderTxnCallbackController],
  providers: [
    ProviderService,
    ProviderCallbackService,
    ProviderTxnCallbackService,
    WalletRiskService,
    AmlLoggingService,
  ],
  exports: [ProviderService],
})
export class ProviderModule {}
