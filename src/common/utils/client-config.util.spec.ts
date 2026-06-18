import { CLIENT_VISIBLE_CONFIG_CATEGORIES, sanitizeConfigForClient } from './client-config.util.js';

describe('client-config.util', () => {
  it('sanitizeConfigForClient strips to client-safe fields', () => {
    expect(
      sanitizeConfigForClient({
        key: 'ADMIN_PAYOUT_FEE',
        category: 'FEES',
        value: '0.03',
        type: 'DECIMAL',
        description: 'Payout fee',
      }),
    ).toEqual({
      key: 'ADMIN_PAYOUT_FEE',
      category: 'FEES',
      value: '0.03',
      type: 'DECIMAL',
      description: 'Payout fee',
    });
  });

  it('CLIENT_VISIBLE_CONFIG_CATEGORIES excludes internal RISK category', () => {
    expect(CLIENT_VISIBLE_CONFIG_CATEGORIES.has('FEES')).toBe(true);
    expect(CLIENT_VISIBLE_CONFIG_CATEGORIES.has('RISK')).toBe(false);
  });
});
