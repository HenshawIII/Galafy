import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType } from '../../../generated/prisma/enums.js';
import {
  isPayoutAdminFeeDebitNarration,
  isPayoutSettlementDebitNarration,
  parsePayoutFeeSweepReferenceFromNotification,
  parsePayoutTransactionReferenceFromNotification,
  resolvePayoutSourceWalletDebitAmount,
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

  it('resolves gross wallet debit for inclusive payout rows', () => {
    expect(
      resolvePayoutSourceWalletDebitAmount({
        amount: new Decimal(970),
        type: TransactionType.PAYOUT,
        metadata: { payoutGrossAmount: '1000.00', payoutNetAmount: '970.00' },
      }).toString(),
    ).toBe('1000');
    expect(
      resolvePayoutSourceWalletDebitAmount({
        amount: new Decimal(500),
        type: TransactionType.SPRAY,
        metadata: {},
      }).toString(),
    ).toBe('500');
  });

  it('parses FEEP and transfer references from notification payload', () => {
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
    expect(
      parsePayoutTransactionReferenceFromNotification({
        narration: 'Event spray payment SPRAY-deadbeef',
      }),
    ).toBe('SPRAY-deadbeef');
  });
});
