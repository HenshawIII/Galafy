import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { EmailModule } from '../../users/email.module.js';
import { AccountRestrictionNotifyService } from './account-restriction-notify.service.js';

@Module({
  imports: [DatabaseModule, EmailModule],
  providers: [AccountRestrictionNotifyService],
  exports: [AccountRestrictionNotifyService],
})
export class AccountRestrictionNotifyModule {}
