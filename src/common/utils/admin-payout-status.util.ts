import { PayoutStatus, TransactionStatus } from '../../../generated/prisma/enums.js';

const STALE_PAYOUT_STATUSES: PayoutStatus[] = [PayoutStatus.PENDING, PayoutStatus.PROCESSING];

const TERMINAL_TRANSACTION_STATUSES: TransactionStatus[] = [
  TransactionStatus.SUCCESS,
  TransactionStatus.FAILED,
  TransactionStatus.REVERSED,
];

/** Derive display status when PayoutTransaction.status lags linked Transaction.status. */
export function deriveEffectivePayoutStatus(
  payoutStatus: PayoutStatus,
  transactionStatus?: TransactionStatus | null,
): PayoutStatus {
  if (
    transactionStatus &&
    STALE_PAYOUT_STATUSES.includes(payoutStatus) &&
    TERMINAL_TRANSACTION_STATUSES.includes(transactionStatus)
  ) {
    if (transactionStatus === TransactionStatus.SUCCESS) return PayoutStatus.SUCCESS;
    if (transactionStatus === TransactionStatus.FAILED) return PayoutStatus.FAILED;
    if (transactionStatus === TransactionStatus.REVERSED) return PayoutStatus.REVERSED;
  }

  return payoutStatus;
}

/** Prisma where clause matching effective payout status for admin list filters. */
export function buildEffectivePayoutStatusWhere(
  status: PayoutStatus,
): Record<string, unknown> {
  if (status === PayoutStatus.SUCCESS) {
    return {
      OR: [
        { status: PayoutStatus.SUCCESS },
        {
          status: { in: STALE_PAYOUT_STATUSES },
          transaction: { status: TransactionStatus.SUCCESS },
        },
      ],
    };
  }

  if (status === PayoutStatus.FAILED) {
    return {
      OR: [
        { status: PayoutStatus.FAILED },
        {
          status: { in: STALE_PAYOUT_STATUSES },
          transaction: { status: TransactionStatus.FAILED },
        },
      ],
    };
  }

  if (status === PayoutStatus.REVERSED) {
    return {
      OR: [
        { status: PayoutStatus.REVERSED },
        {
          status: { in: STALE_PAYOUT_STATUSES },
          transaction: { status: TransactionStatus.REVERSED },
        },
      ],
    };
  }

  if (status === PayoutStatus.PROCESSING) {
    return {
      status: PayoutStatus.PROCESSING,
      NOT: {
        transaction: { status: { in: TERMINAL_TRANSACTION_STATUSES } },
      },
    };
  }

  if (status === PayoutStatus.PENDING) {
    return {
      status: PayoutStatus.PENDING,
      NOT: {
        transaction: { status: { in: TERMINAL_TRANSACTION_STATUSES } },
      },
    };
  }

  return { status };
}
