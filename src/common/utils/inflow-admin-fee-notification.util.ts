/**
 * Detect and parse provider debit notifications for Gala inflow admin fee sweeps.
 * These must not debit the wallet again (net inflow already excluded the fee).
 */

const INFLOW_ADMIN_FEE_NARRATION = /ADMIN\s+FUNDING\s+FEE/i;
const FEE_SWEEP_REF_IN_TEXT = /\b(FEE-[A-F0-9]+)\b/i;

export function isInflowAdminFeeDebitNarration(narration: unknown): boolean {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  return INFLOW_ADMIN_FEE_NARRATION.test(n);
}

/** Extract ProcessClientTransfer fee reference (Transaction.reference) from notification text. */
export function parseFeeSweepReferenceFromText(text: unknown): string | null {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return null;
  const match = s.match(FEE_SWEEP_REF_IN_TEXT);
  return match?.[1] ?? null;
}

export function parseFeeSweepReferenceFromNotification(raw: {
  narration?: unknown;
  reference?: unknown;
  transactionReference?: unknown;
  platformTransactionReference?: unknown;
}): string | null {
  const fromNarration = parseFeeSweepReferenceFromText(raw.narration);
  if (fromNarration) return fromNarration;

  for (const field of [raw.reference, raw.transactionReference, raw.platformTransactionReference]) {
    if (typeof field !== 'string') continue;
    const trimmed = field.trim();
    if (/^FEE-[A-F0-9]+$/i.test(trimmed)) {
      return trimmed;
    }
    const parsed = parseFeeSweepReferenceFromText(trimmed);
    if (parsed) return parsed;
  }

  return null;
}
