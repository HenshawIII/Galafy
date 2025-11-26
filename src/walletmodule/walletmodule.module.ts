import { Module } from '@nestjs/common';
import { WalletmoduleService } from './walletmodule.service.js';
import { WalletmoduleController } from './walletmodule.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [DatabaseModule, ProviderModule],
  controllers: [WalletmoduleController],
  providers: [WalletmoduleService],
  exports: [WalletmoduleService],
})
export class WalletmoduleModule {}
