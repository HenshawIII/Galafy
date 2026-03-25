import { Body, Controller, Logger, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ProviderCallbackService } from './provider-callback.service.js';

@Controller('provider')
export class ProviderCallbackController {
  private readonly logger = new Logger(ProviderCallbackController.name);

  constructor(private readonly providerCallbackService: ProviderCallbackService) {}

  /**
   * Provider webhook/callback endpoint for account creation (nuban) results.
   * We keep this `Public` because provider systems won't send our auth JWT.
   */
  @Public()
  @Post('account-creation-callback')
  async accountCreationCallback(@Body() raw: any) {
    // Important: provider callbacks may contain extra fields.
    // Your global ValidationPipe is strict (`forbidNonWhitelisted: true`), so we accept raw payloads
    // and validate only the fields we actually use inside the service.
    this.logger.debug(
      `Account creation callback received: email=${raw?.data?.email}, phone=${raw?.data?.phoneNumber}, requestType=${raw?.requestType}`,
    );
    return this.providerCallbackService.handleAccountCreationCallback(raw);
  }
}

