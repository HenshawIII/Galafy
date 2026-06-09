import { normalizeProviderAccountStatus, isProviderOutboundBlocked } from './provider-account-status.util.js';

describe('provider-account-status.util', () => {
  it('normalizeProviderAccountStatus maps ACTIVE and INACTIVE', () => {
    expect(normalizeProviderAccountStatus('active')).toBe('ACTIVE');
    expect(normalizeProviderAccountStatus(' INACTIVE ')).toBe('INACTIVE');
    expect(normalizeProviderAccountStatus(null)).toBeNull();
    expect(normalizeProviderAccountStatus('unknown')).toBeNull();
  });

  it('isProviderOutboundBlocked blocks non-ACTIVE statuses', () => {
    expect(isProviderOutboundBlocked('ACTIVE')).toBe(false);
    expect(isProviderOutboundBlocked('INACTIVE')).toBe(true);
    expect(isProviderOutboundBlocked(null)).toBe(true);
  });
});
