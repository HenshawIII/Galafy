import { Module } from '@nestjs/common';
import { BankDirectoryController } from './bank-directory.controller.js';
import { BankDirectoryService } from './bank-directory.service.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [ProviderModule],
  controllers: [BankDirectoryController],
  providers: [BankDirectoryService],
  exports: [BankDirectoryService],
})
export class BankDirectoryModule {}
