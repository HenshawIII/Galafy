import { Module, forwardRef } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { ProviderModule } from '../../provider/provider.module.js';
import { ProviderAccountStatusService } from './provider-account-status.service.js';

@Module({
  imports: [DatabaseModule, forwardRef(() => ProviderModule)],
  providers: [ProviderAccountStatusService],
  exports: [ProviderAccountStatusService],
})
export class ProviderAccountStatusModule {}
