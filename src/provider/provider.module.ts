import { Module } from '@nestjs/common';
import { ProviderService } from './provider.service.js';
import { ProviderController } from './provider.controller.js';
import { ProviderCallbackController } from './provider-callback.controller.js';
import { ProviderCallbackService } from './provider-callback.service.js';
import { ProviderTxnCallbackController } from './provider-txn-callback.controller.js';
import { ProviderTxnCallbackService } from './provider-txn-callback.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  controllers: [ProviderController, ProviderCallbackController, ProviderTxnCallbackController],
  providers: [ProviderService, ProviderCallbackService, ProviderTxnCallbackService],
  exports: [ProviderService], // Export so other modules can use it
})
export class ProviderModule {}
