import { Module } from '@nestjs/common';
import { DebitWalletMandateService } from './debit-wallet-mandate.service.js';

@Module({
  providers: [DebitWalletMandateService],
  exports: [DebitWalletMandateService],
})
export class DebitMandateModule {}
