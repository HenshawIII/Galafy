import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { ConfigController } from './config.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { JwtAuthModule } from '../auth/jwt-auth.module.js';

@Module({
  imports: [DatabaseModule, JwtAuthModule],
  controllers: [ConfigController],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}
