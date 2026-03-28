import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { InternalLedgerTransferService } from './internal-ledger-transfer.service.js';

@Module({
  imports: [DatabaseModule],
  providers: [InternalLedgerTransferService],
  exports: [InternalLedgerTransferService],
})
export class InternalLedgerModule {}
