import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LiveModule } from '../live/live.module.js';
import { ProviderModule } from '../provider/provider.module.js';
import { SpraysController } from './sprays.controller.js';
import { SpraysService } from './sprays.service.js';

@Module({
  imports: [DatabaseModule, LiveModule, ProviderModule],
  controllers: [SpraysController],
  providers: [SpraysService],
  exports: [SpraysService],
})
export class SpraysModule {}

