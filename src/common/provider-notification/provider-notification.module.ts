import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ProviderNotificationLedgerService } from './provider-notification-ledger.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [ProviderNotificationLedgerService],
  exports: [ProviderNotificationLedgerService],
})
export class ProviderNotificationModule {}
