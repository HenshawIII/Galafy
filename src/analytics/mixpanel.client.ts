import { createRequire } from 'node:module';
import type mixpanel from 'mixpanel';

const require = createRequire(import.meta.url);

export const MIXPANEL_CLIENT = 'MIXPANEL_CLIENT';

export type MixpanelClient = mixpanel.Mixpanel;

export function createMixpanelClientFromEnv(): MixpanelClient | null {
  const token = process.env.MIXPANEL_TOKEN?.trim();
  if (!token) {
    return null;
  }

  const Mixpanel = require('mixpanel') as typeof mixpanel;
  const host = process.env.MIXPANEL_HOST?.trim() || 'api.mixpanel.com';
  const debug = (process.env.MIXPANEL_DEBUG ?? '').toLowerCase() === 'true';

  return Mixpanel.init(token, {
    host,
    debug,
  });
}
