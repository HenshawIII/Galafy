import { Body, Controller, Logger, Post } from '@nestjs/common';
import { Public } from '../auth/public.decorator.js';
import { ProviderTxnCallbackService } from './provider-txn-callback.service.js';

@Controller('provider')
export class ProviderTxnCallbackController {
  private readonly logger = new Logger(ProviderTxnCallbackController.name);

  constructor(private readonly providerTxnCallbackService: ProviderTxnCallbackService) {}

  /**
   * Auth callback endpoint (bank -> client).
   * Accept raw body since provider payload may include extra fields.
   */
  @Public()
  @Post('transaction-auth-callback')
  async transactionAuthCallback(@Body() raw: any) {
    this.logger.debug(`transaction-auth-callback called`);
    return this.providerTxnCallbackService.handleTransactionAuthCallback(raw);
  }

  /**
   * Transaction callback endpoint (bank -> client).
   */
  @Public()
  @Post('transaction-callback')
  async transactionCallback(@Body() raw: any) {
    return this.providerTxnCallbackService.handleTransactionCallback(raw);
  }

  /**
   * Transaction notification endpoint (bank -> client).
   */
  @Public()
  @Post('transaction-notification')
  async transactionNotification(@Body() raw: any) {
    return this.providerTxnCallbackService.handleTransactionNotification(raw);
  }
}

