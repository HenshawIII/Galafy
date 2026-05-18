import { Body, Controller, HttpCode, HttpStatus, Logger, Post } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import { Public } from '../auth/public.decorator.js';
import { ProviderCallbackService } from './provider-callback.service.js';

@ApiExcludeController()
@Controller('provider')
export class ProviderCallbackController {
  private readonly logger = new Logger(ProviderCallbackController.name);

  constructor(private readonly providerCallbackService: ProviderCallbackService) {}

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
   * Provider webhook/callback endpoint for account creation (nuban) results.
   * We keep this `Public` because provider systems won't send our auth JWT.
   */
  @Public()
  @Post('account-creation-callback')
  @HttpCode(HttpStatus.OK)
  async accountCreationCallback(@Body() raw: unknown) {
    // Important: provider callbacks may contain extra fields.
    // Your global ValidationPipe is strict (`forbidNonWhitelisted: true`), so we accept raw payloads
    // and validate only the fields we actually use inside the service.
    const data = this.pick(raw, 'data');
    const email = this.pick(data, 'email');
    const phoneNumber = this.pick(data, 'phoneNumber');
    const nuban = this.pick(data, 'nuban');
    const requestType = this.pick(raw, 'requestType');
    this.logger.log(
      `Provider callback entry: account-creation-callback email=${this.mask(email)} phone=${this.mask(phoneNumber)} nuban=${this.mask(nuban)} requestType=${this.mask(requestType)}`,
    );
    const result = await this.providerCallbackService.handleAccountCreationCallback(raw);
    this.logger.log(
      `Provider callback exit: account-creation-callback email=${this.mask(email)} phone=${this.mask(phoneNumber)} received=${result.received}`,
    );
    return result;
  }
}
