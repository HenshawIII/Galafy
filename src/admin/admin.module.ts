import { Module } from '@nestjs/common';
import { AdminService } from './admin.service.js';
import { AdminController } from './admin.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ConfigModule } from '../config/config.module.js';
import { AdminAuthModule } from './auth/admin-auth.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { UsersModule } from '../users/users.module.js';
import { WalletmoduleModule } from '../walletmodule/walletmodule.module.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [
    DatabaseModule,
    ConfigModule,
    AdminAuthModule,
    CacheModule,
    UsersModule, // Import UsersModule to access EmailService
    WalletmoduleModule, // Import WalletmoduleModule to access WalletmoduleService, WithdrawalLimitService
    ProviderModule, // Import ProviderModule to access ProviderService
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
