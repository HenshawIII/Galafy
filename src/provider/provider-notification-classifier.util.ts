import { isInflowAdminFeeDebitNarration } from '../common/utils/inflow-admin-fee-notification.util.js';

export type ProviderNotificationKind =
  | 'bank_inflow'
  | 'nip_commission'
  | 'nip_vat'
  | 'nip_reversal'
  | 'inflow_admin_fee'
  | 'unclassified_debit'
  | 'unknown_notification';

export function normalizeNotificationNarration(narration: unknown): string {
  return typeof narration === 'string' ? narration.trim().toUpperCase() : '';
}

export function normalizeTransactionType(transactionType: unknown): string {
  return typeof transactionType === 'string' ? transactionType.trim().toLowerCase() : '';
}

/**
 * Classify ALAT transaction-notification payloads by narration + direction.
 */
export function classifyTransactionNotification(raw: {
  transactionType?: unknown;
  narration?: unknown;
}): ProviderNotificationKind {
  const direction = normalizeTransactionType(raw?.transactionType);
  const narration = normalizeNotificationNarration(raw?.narration);

  if (direction === 'debit') {
    if (narration.includes('COMM ALAT NIP TRANSFER')) {
      return 'nip_commission';
    }
    if (narration.includes('VAT ALAT NIP TRANSFER')) {
      return 'nip_vat';
    }
    if (isInflowAdminFeeDebitNarration(raw?.narration)) {
      return 'inflow_admin_fee';
    }
    return 'unclassified_debit';
  }

  if (direction === 'credit') {
    if (narration.includes('ALAT NIP TRANSFER REVERSAL')) {
      return 'nip_reversal';
    }
    return 'bank_inflow';
  }

  return 'unknown_notification';
}
