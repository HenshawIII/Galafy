import { Decimal } from '@prisma/client/runtime/library';
import { normalizeToKobo } from './money.util.js';

export type WithdrawalPushPayload = {
  notification: { title: string; body: string };
  data: Record<string, string>;
};

export type WithdrawalNotificationKind = 'WITHDRAWAL_SUBMITTED' | 'WITHDRAWAL_SUCCESS' | 'WITHDRAWAL_FAILED';

export type WithdrawalNotificationInput = {
  kind: WithdrawalNotificationKind;
  amountFormatted: string;
  transactionReference: string;
  destinationAccountNumber?: string | null;
};

export function resolveWithdrawalDisplayAmount(
  recordAmount: Decimal | string | number,
  metadata: unknown,
): string {
  const meta = typeof metadata === 'object' && metadata !== null ? (metadata as Record<string, unknown>) : null;
  const gross = meta?.payoutGrossAmount;
  if (typeof gross === 'string' && gross.trim()) {
    return normalizeToKobo(gross).toFixed(2);
  }
  if (typeof gross === 'number') {
    return normalizeToKobo(gross).toFixed(2);
  }
  return normalizeToKobo(recordAmount).toFixed(2);
}

export function buildWithdrawalPushNotification(input: WithdrawalNotificationInput): WithdrawalPushPayload {
  const destination = input.destinationAccountNumber?.trim() || 'Recipient';
  const amount = input.amountFormatted;

  switch (input.kind) {
    case 'WITHDRAWAL_SUBMITTED':
      return {
        notification: {
          title: 'Transfer submitted',
          body: `Your transfer of ₦${amount} to ${destination} was submitted`,
        },
        data: {
          type: 'WITHDRAWAL_SUBMITTED',
          legacyType: 'TRANSFER_SUBMITTED',
          amount,
          reference: input.transactionReference,
          destinationAccountNumber: destination,
        },
      };
    case 'WITHDRAWAL_SUCCESS':
      return {
        notification: {
          title: 'Transfer successful',
          body: `Your transfer of ₦${amount} completed`,
        },
        data: {
          type: 'WITHDRAWAL_SUCCESS',
          legacyType: 'TRANSFER_SUCCESS',
          amount,
          reference: input.transactionReference,
          destinationAccountNumber: destination,
        },
      };
    case 'WITHDRAWAL_FAILED':
      return {
        notification: {
          title: 'Transfer failed',
          body: `Your transfer of ₦${amount} to ${destination} failed`,
        },
        data: {
          type: 'WITHDRAWAL_FAILED',
          legacyType: 'TRANSFER_FAILED',
          amount,
          reference: input.transactionReference,
          destinationAccountNumber: destination,
        },
      };
  }
}
