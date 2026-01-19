import { Module } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { DatabaseModule } from '../database/database.module.js';

@Module({
  imports: [DatabaseModule],
  providers: [ConfigService],
  exports: [ConfigService],
})
export class ConfigModule {}

