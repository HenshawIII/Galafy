import { buildStableProviderRef } from './provider-transaction-reference.util.js';

/**
 * Stable idempotency key for provider transaction-notification when no unique ref is sent.
 */
export function buildTransactionNotificationProviderReference(raw: {
  reference?: unknown;
  transactionId?: unknown;
  platformTransactionReference?: unknown;
  accountNumber?: unknown;
  amount?: unknown;
  transactionDate?: unknown;
  narration?: unknown;
}): string {
  const explicit = raw?.reference ?? raw?.transactionId ?? raw?.platformTransactionReference;
  if (explicit != null && String(explicit).trim() !== '') {
    const trimmed = String(explicit).trim();
    if (trimmed.length <= 24) {
      return `TN-${trimmed}`;
    }
    return buildStableProviderRef('TN', trimmed);
  }
  const accountNumber = String(raw?.accountNumber ?? '').trim();
  const amount = String(raw?.amount ?? '');
  let td = '';
  if (raw?.transactionDate != null && raw?.transactionDate !== '') {
    const d = new Date(raw.transactionDate as string);
    td = isNaN(d.getTime()) ? String(raw.transactionDate) : d.toISOString();
  }
  const narration = String(raw?.narration ?? '').trim();
  return buildStableProviderRef('NOTIF', `${accountNumber}|${amount}|${td}|${narration}`);
}
