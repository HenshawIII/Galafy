import { formatUtcDateOnly, resolveWalletHistoryDateRange } from './wallet-history-date-range.util.js';

describe('resolveWalletHistoryDateRange', () => {
  const walletCreated = new Date('2024-06-15T10:00:00.000Z');

  it('defaults end to today and start to wallet creation when omitted', () => {
    const today = formatUtcDateOnly(new Date());
    expect(resolveWalletHistoryDateRange(undefined, undefined, walletCreated)).toEqual({
      startDate: '2024-06-15',
      endDate: today,
    });
  });

  it('uses provided dates when both are set', () => {
    expect(resolveWalletHistoryDateRange('2025-01-01', '2025-01-31', walletCreated)).toEqual({
      startDate: '2025-01-01',
      endDate: '2025-01-31',
    });
  });

  it('defaults only missing start to wallet creation', () => {
    expect(resolveWalletHistoryDateRange(undefined, '2025-12-01', walletCreated)).toEqual({
      startDate: '2024-06-15',
      endDate: '2025-12-01',
    });
  });

  it('defaults only missing end to today', () => {
    const today = formatUtcDateOnly(new Date());
    expect(resolveWalletHistoryDateRange('2025-01-01', undefined, walletCreated)).toEqual({
      startDate: '2025-01-01',
      endDate: today,
    });
  });
});
