import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ProviderNotificationLedgerService } from './provider-notification-ledger.service.js';
import { SprayTransferLookupService } from './spray-transfer-lookup.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProviderNotificationLedgerService, SprayTransferLookupService],
  exports: [ProviderNotificationLedgerService, SprayTransferLookupService],
})
export class ProviderNotificationModule {}
