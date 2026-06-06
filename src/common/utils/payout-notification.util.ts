import { Decimal } from '@prisma/client/runtime/library';
import { TransactionType } from '../../../generated/prisma/enums.js';
import { normalizeToKobo } from './money.util.js';

/**
 * Detect and parse provider debit notifications for Gala payout / transfer ProcessClientTransfer legs.
 * Inclusive payout: PAYOUT row stores net (970); callback debits gross (1000) once; fee sweep (30) is a
 * separate visible row and bank leg that must not debit the wallet again.
 */

/**
 * Amount to subtract from the source wallet on payout TXN callback success.
 * DB/display amount is net; wallet debit is gross when payoutGrossAmount metadata is present.
 */
export function resolvePayoutSourceWalletDebitAmount(txn: {
  amount: Decimal;
  type: TransactionType;
  metadata: unknown;
}): Decimal {
  if (txn.type !== TransactionType.PAYOUT) {
    return txn.amount;
  }
  const meta = typeof txn.metadata === 'object' && txn.metadata !== null ? (txn.metadata as Record<string, unknown>) : null;
  const gross = meta?.payoutGrossAmount;
  if (typeof gross === 'string' && gross.trim()) {
    return normalizeToKobo(gross);
  }
  return txn.amount;
}

const PAYOUT_ADMIN_FEE_NARRATION = /ADMIN\s+PAYOUT\s+FEE/i;
const PAYOUT_SETTLEMENT_NARRATION = /WALLET\s+PAYOUT\s+TO/i;
const WALLET_TRANSFER_NARRATION = /WALLET\s+TRANSFER\s+TO/i;
const FEEP_SWEEP_REF_IN_TEXT = /\b(FEEP-[A-F0-9]+)\b/i;
const TXN_REF_IN_TEXT = /\b(TXN-[A-F0-9]+)\b/i;

export function isPayoutAdminFeeDebitNarration(narration: unknown): boolean {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  return PAYOUT_ADMIN_FEE_NARRATION.test(n);
}

export function isPayoutSettlementDebitNarration(narration: unknown): boolean {
  const n = typeof narration === 'string' ? narration.trim() : '';
  if (!n) return false;
  return PAYOUT_SETTLEMENT_NARRATION.test(n) || WALLET_TRANSFER_NARRATION.test(n);
}

export function parsePayoutFeeSweepReferenceFromText(text: unknown): string | null {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return null;
  const match = s.match(FEEP_SWEEP_REF_IN_TEXT);
  return match?.[1] ?? null;
}

export function parsePayoutTransactionReferenceFromText(text: unknown): string | null {
  const s = typeof text === 'string' ? text.trim() : '';
  if (!s) return null;
  const match = s.match(TXN_REF_IN_TEXT);
  return match?.[1] ?? null;
}

function parseRefFromFields(
  raw: {
    narration?: unknown;
    reference?: unknown;
    transactionReference?: unknown;
    platformTransactionReference?: unknown;
  },
  pattern: RegExp,
  parseFromText: (text: unknown) => string | null,
): string | null {
  const fromNarration = parseFromText(raw.narration);
  if (fromNarration) return fromNarration;

  for (const field of [raw.reference, raw.transactionReference, raw.platformTransactionReference]) {
    if (typeof field !== 'string') continue;
    const trimmed = field.trim();
    if (pattern.test(trimmed)) {
      return trimmed;
    }
    const parsed = parseFromText(trimmed);
    if (parsed) return parsed;
  }

  return null;
}

export function parsePayoutFeeSweepReferenceFromNotification(raw: {
  narration?: unknown;
  reference?: unknown;
  transactionReference?: unknown;
  platformTransactionReference?: unknown;
}): string | null {
  return parseRefFromFields(raw, /^FEEP-[A-F0-9]+$/i, parsePayoutFeeSweepReferenceFromText);
}

export function parsePayoutTransactionReferenceFromNotification(raw: {
  narration?: unknown;
  reference?: unknown;
  transactionReference?: unknown;
  platformTransactionReference?: unknown;
}): string | null {
  return parseRefFromFields(raw, /^TXN-[A-F0-9]+$/i, parsePayoutTransactionReferenceFromText);
}
