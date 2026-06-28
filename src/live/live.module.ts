import { Module, Logger, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module.js';
import { CacheModule } from '../cache/cache.module.js';
import { LiveGateway } from './live.gateway.js';
import { EventSprayLiveBroadcastService } from './event-spray-live-broadcast.service.js';
import { EventsModule } from '../events/events.module.js';

@Module({
  imports: [
    DatabaseModule,
    CacheModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
    forwardRef(() => EventsModule),
  ],
  providers: [LiveGateway, EventSprayLiveBroadcastService],
  exports: [LiveGateway, EventSprayLiveBroadcastService],
})
export class LiveModule {
  private readonly logger = new Logger(LiveModule.name);

  constructor() {
    this.logger.log('LiveModule loaded and LiveGateway should be initialized');
  }
}
