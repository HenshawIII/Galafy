import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ConfigModule } from '../../config/config.module.js';
import { OrganizationWalletService } from '../services/organization-wallet.service.js';
import { InflowCreditService } from './inflow-credit.service.js';
import { ProviderModule } from '../../provider/provider.module.js';

@Module({
  imports: [DatabaseModule, ConfigModule, forwardRef(() => ProviderModule)],
  providers: [InflowCreditService, OrganizationWalletService],
  exports: [InflowCreditService],
})
export class InflowCreditModule {}
