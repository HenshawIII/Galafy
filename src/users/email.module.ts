import { Global, Module } from '@nestjs/common';
import { EmailService } from './email.service.js';

/** Standalone email module to avoid circular imports via UsersModule ↔ ProviderModule. */
@Global()
@Module({
  providers: [EmailService],
  exports: [EmailService],
})
export class EmailModule {}
