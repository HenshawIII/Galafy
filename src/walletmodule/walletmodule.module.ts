import { Module } from '@nestjs/common';
import { WalletmoduleService } from './walletmodule.service.js';
import { WalletmoduleController } from './walletmodule.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { PayoutSecurityService } from './services/payout-security.service.js';
import { UsersModule } from '../users/users.module.js';

@Module({
  imports: [DatabaseModule, ProviderModule, UsersModule],
  controllers: [WalletmoduleController],
  providers: [WalletmoduleService, PayoutSecurityService],
  exports: [WalletmoduleService],
})
export class WalletmoduleModule {}
