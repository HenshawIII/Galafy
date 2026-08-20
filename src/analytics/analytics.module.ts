import { Global, Module } from '@nestjs/common';
import { MixpanelService } from './mixpanel.service.js';
import { MIXPANEL_CLIENT, createMixpanelClientFromEnv } from './mixpanel.client.js';

@Global()
@Module({
  providers: [
    {
      provide: MIXPANEL_CLIENT,
      useFactory: createMixpanelClientFromEnv,
    },
    MixpanelService,
  ],
  exports: [MixpanelService],
})
export class AnalyticsModule {}
