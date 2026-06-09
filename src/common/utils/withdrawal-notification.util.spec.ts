import { Decimal } from '@prisma/client/runtime/library';
import {
  buildWithdrawalPushNotification,
  resolveWithdrawalDisplayAmount,
} from './withdrawal-notification.util.js';

describe('withdrawal-notification.util', () => {
  it('resolveWithdrawalDisplayAmount prefers payoutGrossAmount metadata', () => {
    const amount = resolveWithdrawalDisplayAmount(new Decimal(970), {
      payoutGrossAmount: '1000.00',
    });
    expect(amount).toBe('1000.00');
  });

  it('buildWithdrawalPushNotification includes legacy type aliases', () => {
    const payload = buildWithdrawalPushNotification({
      kind: 'WITHDRAWAL_SUCCESS',
      amountFormatted: '1000.00',
      transactionReference: 'TXN-ABC',
      destinationAccountNumber: '0123456789',
    });

    expect(payload.data.type).toBe('WITHDRAWAL_SUCCESS');
    expect(payload.data.legacyType).toBe('TRANSFER_SUCCESS');
    expect(payload.notification.title).toBe('Transfer successful');
  });
});
