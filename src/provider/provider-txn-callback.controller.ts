import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { ProviderTxnCallbackService } from './provider-txn-callback.service.js';
import {
  extractTransactionCallbackFields,
  sanitizeProviderCallbackForLog,
} from './provider-callback-payload.util.js';

@ApiExcludeController()
@Controller('provider')
export class ProviderTxnCallbackController {
  private readonly logger = new Logger(ProviderTxnCallbackController.name);

  constructor(private readonly providerTxnCallbackService: ProviderTxnCallbackService) {}

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
  }

  private pick(obj: unknown, key: string): unknown {
    if (!this.isRecord(obj)) return undefined;
    return obj[key];
  }

  private mask(value: unknown, visibleTail = 4): string {
    const str =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number' || typeof value === 'boolean'
          ? String(value).trim()
          : '';
    if (!str) return 'n/a';
    if (str.length <= visibleTail) return '*'.repeat(str.length);
    return `${'*'.repeat(str.length - visibleTail)}${str.slice(-visibleTail)}`;
  }

  /**
   * Auth callback endpoint (bank -> client).
   * Accept raw body since provider payload may include extra fields.
   */
  @Public()
  @Post('transaction-auth-callback')
  @HttpCode(HttpStatus.OK)
  async transactionAuthCallback(@Body() raw: unknown) {
    this.logger.log(
      `Provider callback payload [transaction-auth-callback]: ${sanitizeProviderCallbackForLog(raw)}`,
    );
    const txRef = this.pick(raw, 'transactionReference') ?? this.pick(this.pick(raw, 'data'), 'transactionReference');
    this.logger.log(`Provider callback entry: transaction-auth-callback txRef=${this.mask(txRef)}`);
    const result = await this.providerTxnCallbackService.handleTransactionAuthCallback(raw);
    this.logger.log(
      `Provider callback exit: transaction-auth-callback txRef=${this.mask(result.transactionReference)} authorized=${result.authorized}`,
    );
    return result;
  }

  /**
   * Transaction callback endpoint (bank -> client).
   */
  @Public()
  @Post('transaction-callback')
  @HttpCode(HttpStatus.OK)
  async transactionCallback(@Body() raw: unknown) {
    this.logger.log(`Provider callback payload [transaction-callback]: ${sanitizeProviderCallbackForLog(raw)}`);
    const extracted = extractTransactionCallbackFields(raw);
    const txRef = extracted.transactionReference;
    const platformRef = extracted.platformTransactionReference;
    this.logger.log(
      `Provider callback entry: transaction-callback txRef=${this.mask(txRef)} platformRef=${this.mask(platformRef)} dataSource=${extracted.dataSource}`,
    );
    const result = await this.providerTxnCallbackService.handleTransactionCallback(raw);
    this.logger.log(
      `Provider callback exit: transaction-callback txRef=${this.mask(txRef)} received=${result.received}`,
    );
    return result;
  }

  /**
   * Transaction notification endpoint (bank -> client).
   */
  @Public()
  @Post('transaction-notification')
  @HttpCode(HttpStatus.OK)
  async transactionNotification(@Body() raw: unknown) {
    this.logger.log(
      `Provider callback payload [transaction-notification]: ${sanitizeProviderCallbackForLog(raw)}`,
    );
    const accountNumber = this.pick(raw, 'accountNumber');
    const txnType = this.pick(raw, 'transactionType');
    this.logger.log(
      `Provider callback entry: transaction-notification account=${this.mask(accountNumber)} transactionType=${typeof txnType === 'string' ? txnType : 'n/a'}`,
    );
    const result = await this.providerTxnCallbackService.handleTransactionNotification(raw);
    this.logger.log(
      `Provider callback exit: transaction-notification account=${this.mask(accountNumber)} received=${result.received}`,
    );
    return result;
  }
}
