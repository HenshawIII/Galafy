import {
  PROVIDER_TX_REF_MAX_LENGTH,
  buildStableProviderRef,
  buildUniqueProviderRef,
  toProviderTransactionReference,
} from './provider-transaction-reference.util.js';

describe('provider-transaction-reference.util', () => {
  it('buildStableProviderRef stays within max length', () => {
    const ref = buildStableProviderRef('NOTIF', 'account|amount|date|narration');
    expect(ref.length).toBeLessThanOrEqual(PROVIDER_TX_REF_MAX_LENGTH);
    expect(ref.startsWith('NOTIF-')).toBe(true);
  });

  it('buildStableProviderRef is deterministic for the same seed', () => {
    const a = buildStableProviderRef('FEE', 'NOTIF-abc123');
    const b = buildStableProviderRef('FEE', 'NOTIF-abc123');
    expect(a).toBe(b);
  });

  it('buildUniqueProviderRef stays within max length', () => {
    expect(buildUniqueProviderRef('TXN').length).toBeLessThanOrEqual(PROVIDER_TX_REF_MAX_LENGTH);
  });

  it('toProviderTransactionReference shortens long refs', () => {
    const long = `FEE-NOTIF-${'a'.repeat(64)}`;
    const short = toProviderTransactionReference(long, 'FEE');
    expect(short.length).toBeLessThanOrEqual(PROVIDER_TX_REF_MAX_LENGTH);
    expect(short).not.toBe(long);
  });

  it('toProviderTransactionReference preserves short refs', () => {
    expect(toProviderTransactionReference('TXN-abc123', 'TXN')).toBe('TXN-abc123');
  });
});
