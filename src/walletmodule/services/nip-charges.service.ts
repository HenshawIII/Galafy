import { Injectable, Logger } from '@nestjs/common';
import { ProviderService } from '../../provider/provider.service.js';
import { CacheService } from '../../cache/cache.service.js';
import type { NipChargesResult } from '../../common/utils/nip-charges.util.js';

const CACHE_KEY = 'provider:nip-charges';
const CACHE_TTL_SEC = 3600;

@Injectable()
export class NipChargesService {
  private readonly logger = new Logger(NipChargesService.name);

  constructor(
    private readonly providerService: ProviderService,
    private readonly cacheService: CacheService,
  ) {}

  async getNipChargesCached(): Promise<NipChargesResult> {
    const cached = await this.cacheService.get<NipChargesResult>(CACHE_KEY);
    if (cached) {
      return cached;
    }

    try {
      const result = await this.providerService.getNIPCharges();
      const payload: NipChargesResult = {
        chargeFees: result.chargeFees ?? [],
        termsAndConditions: result.termsAndConditions,
        termsAndConditionsUrl: result.termsAndConditionsUrl,
      };
      await this.cacheService.set(CACHE_KEY, payload, CACHE_TTL_SEC);
      return payload;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed to fetch NIP charges: ${message}`);
      throw error;
    }
  }
}
