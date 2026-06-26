import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ConfigModule } from '../../config/config.module.js';
import { OrganizationWalletService } from '../services/organization-wallet.service.js';
import { InflowCreditService } from './inflow-credit.service.js';
import { ProviderModule } from '../../provider/provider.module.js';
import { DebitMandateModule } from '../debit-mandate/debit-mandate.module.js';
import { ProviderAccountStatusModule } from '../provider-account-status/provider-account-status.module.js';
import { AccountRestrictionNotifyModule } from '../account-restriction/account-restriction-notify.module.js';
import { ProviderNotificationModule } from '../provider-notification/provider-notification.module.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    DebitMandateModule,
    forwardRef(() => ProviderModule),
    ProviderAccountStatusModule,
    AccountRestrictionNotifyModule,
    ProviderNotificationModule,
  ],
  providers: [InflowCreditService, OrganizationWalletService],
  exports: [InflowCreditService],
})
export class InflowCreditModule {}
