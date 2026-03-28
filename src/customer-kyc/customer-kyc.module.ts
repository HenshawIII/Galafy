import { Module, forwardRef } from '@nestjs/common';
import { CustomerKycController } from './customer-kyc.controller.js';
import { CustomerKycService } from './customer-kyc.service.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [DatabaseModule, forwardRef(() => ProviderModule)],
  controllers: [CustomerKycController],
  providers: [CustomerKycService],
  exports: [CustomerKycService],
})
export class CustomerKycModule {}
