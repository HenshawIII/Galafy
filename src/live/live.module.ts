import { Module, Logger } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { DatabaseModule } from '../database/database.module.js';
import { LiveGateway } from './live.gateway.js';

@Module({
  imports: [
    DatabaseModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'your-secret-key',
    }),
  ],
  providers: [LiveGateway],
  exports: [LiveGateway],
})
export class LiveModule {
  private readonly logger = new Logger(LiveModule.name);

  constructor() {
    this.logger.log('LiveModule loaded and LiveGateway should be initialized');
  }
}

