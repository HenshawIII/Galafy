import {
  isPayoutAdminFeeDebitNarration,
  isPayoutSettlementDebitNarration,
  parsePayoutFeeSweepReferenceFromNotification,
  parsePayoutTransactionReferenceFromNotification,
} from './payout-notification.util.js';

describe('payout-notification.util', () => {
  it('detects payout admin fee narration', () => {
    expect(isPayoutAdminFeeDebitNarration('Admin payout fee FEEP-abc123')).toBe(true);
    expect(isPayoutAdminFeeDebitNarration('Admin funding fee FEE-abc')).toBe(false);
  });

  it('detects payout settlement narration', () => {
    expect(isPayoutSettlementDebitNarration('Wallet payout to 0123456789')).toBe(true);
    expect(isPayoutSettlementDebitNarration('Wallet transfer to 0123456789')).toBe(true);
  });

  it('parses FEEP and TXN references from notification payload', () => {
    expect(
      parsePayoutFeeSweepReferenceFromNotification({
        narration: 'Admin payout fee FEEP-deadbeef',
      }),
    ).toBe('FEEP-deadbeef');
    expect(
      parsePayoutTransactionReferenceFromNotification({
        transactionReference: 'TXN-abc123',
      }),
    ).toBe('TXN-abc123');
  });
});
