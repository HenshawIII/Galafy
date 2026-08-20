import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { MIXPANEL_CLIENT, type MixpanelClient } from './mixpanel.client.js';
import type { MixpanelEventName } from './mixpanel.events.js';

@Injectable()
export class MixpanelService {
  private readonly logger = new Logger(MixpanelService.name);

  constructor(
    @Optional()
    @Inject(MIXPANEL_CLIENT)
    private readonly client: MixpanelClient | null,
  ) {}

  track(distinctId: string, event: MixpanelEventName, properties?: Record<string, unknown>): void {
    if (!this.client || !distinctId) {
      return;
    }

    try {
      this.client.track(
        event,
        {
          distinct_id: distinctId,
          source: 'api',
          env: process.env.NODE_ENV ?? 'development',
          ...properties,
        },
        (err) => {
          if (err) {
            this.logger.warn(`Mixpanel track failed event=${event}: ${err.message}`);
          }
        },
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Mixpanel track threw event=${event}: ${message}`);
    }
  }

  identify(distinctId: string, properties: Record<string, unknown>): void {
    if (!this.client || !distinctId) {
      return;
    }

    try {
      this.client.people.set(distinctId, properties, (err) => {
        if (err) {
          this.logger.warn(`Mixpanel people.set failed distinctId=${distinctId}: ${err.message}`);
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Mixpanel people.set threw: ${message}`);
    }
  }

  setOnce(distinctId: string, properties: Record<string, unknown>): void {
    if (!this.client || !distinctId) {
      return;
    }

    try {
      this.client.people.set_once(distinctId, properties, (err) => {
        if (err) {
          this.logger.warn(`Mixpanel people.set_once failed distinctId=${distinctId}: ${err.message}`);
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Mixpanel people.set_once threw: ${message}`);
    }
  }
}
