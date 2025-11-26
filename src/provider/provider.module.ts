import { Module } from '@nestjs/common';
import { ProviderService } from './provider.service.js';
import { ProviderController } from './provider.controller.js';

@Module({
  controllers: [ProviderController],
  providers: [ProviderService],
  exports: [ProviderService], // Export so other modules can use it
})
export class ProviderModule {}
