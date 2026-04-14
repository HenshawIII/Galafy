import { Module, forwardRef } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { UsersController } from './users.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { EmailService } from './email.service.js';
import { ProviderModule } from '../provider/provider.module.js';
import { CustomerKycModule } from '../customer-kyc/customer-kyc.module.js';
import { JwtModule } from '@nestjs/jwt';
import { CacheModule } from '../cache/cache.module.js';
import { config } from 'dotenv';
config();

@Module({
  imports: [
    DatabaseModule,
    forwardRef(() => ProviderModule),
    CustomerKycModule,
    CacheModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: '7d' }, // 7 days - suitable for mobile apps
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService, EmailService],
  exports: [UsersService, EmailService],
})
export class UsersModule {}
