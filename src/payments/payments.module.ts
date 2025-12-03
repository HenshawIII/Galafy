import { Module } from '@nestjs/common';
import { PaymentsService } from './payments.service.js';
import { PaymentsController } from './payments.controller.js';
import { WebhooksService } from './webhooks.service.js';
import { WebhooksController } from './webhooks.controller.js';
import { DatabaseModule } from '../database/database.module.js';
import { ProviderModule } from '../provider/provider.module.js';

@Module({
  imports: [DatabaseModule, ProviderModule],
  controllers: [PaymentsController, WebhooksController],
  providers: [PaymentsService, WebhooksService],
  exports: [PaymentsService, WebhooksService],
})
export class PaymentsModule {}
