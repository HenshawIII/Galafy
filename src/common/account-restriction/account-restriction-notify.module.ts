import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module.js';
import { UsersModule } from '../../users/users.module.js';
import { AccountRestrictionNotifyService } from './account-restriction-notify.service.js';

@Module({
  imports: [DatabaseModule, UsersModule],
  providers: [AccountRestrictionNotifyService],
  exports: [AccountRestrictionNotifyService],
})
export class AccountRestrictionNotifyModule {}
