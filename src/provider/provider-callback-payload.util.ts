import { TransactionStatus } from '../../generated/prisma/enums.js';

/**
 * Map ALAT debit-wallet settlement status strings to internal TransactionStatus.
 * Provider uses "Success" (callback) and sometimes "SUCCESSFUL" in docs/samples.
 */
export function mapProviderStatusToTransactionStatus(providerStatus: string | undefined): TransactionStatus {
  const normalized = (providerStatus ?? '').toString().trim().toUpperCase();
  if (normalized === 'PENDING' || normalized === 'PROCESSING') {
    return TransactionStatus.PENDING;
  }
  if (
    normalized === 'SUCCESSFUL' ||
    normalized === 'SUCCESS' ||
    normalized === 'COMPLETED' ||
    normalized === 'APPROVED'
  ) {
    return TransactionStatus.SUCCESS;
  }
  if (normalized === 'FAILED' || normalized === 'FAILURE' || normalized === 'REJECTED') {
    return TransactionStatus.FAILED;
  }
  return TransactionStatus.PENDING;
}

/**
 * Sanitize provider webhook bodies for logs (never log securityInfo / full account numbers).
 */
export function sanitizeProviderCallbackForLog(raw: unknown, maxLen = 8000): string {
  const redactKeys = new Set([
    'securityinfo',
    'securityinfohash',
    'access',
    'authorization',
    'password',
    'pin',
    'otp',
  ]);

  const walk = (value: unknown, depth: number): unknown => {
    if (depth > 12) return '[max depth]';
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') {
      if (value.length > 500) return `${value.slice(0, 200)}...[truncated ${value.length} chars]`;
      return value;
    }
    if (typeof value !== 'object') return value;
    if (Array.isArray(value)) return value.map((v) => walk(v, depth + 1));

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (redactKeys.has(k.toLowerCase())) {
        out[k] = '[REDACTED]';
        continue;
      }
      if (k.toLowerCase().includes('accountnumber') && typeof v === 'string' && v.length > 4) {
        out[k] = `******${v.slice(-4)}`;
        continue;
      }
      out[k] = walk(v, depth + 1);
    }
    return out;
  };

  try {
    const sanitized = walk(raw, 0);
    const json = JSON.stringify(sanitized);
    return json.length > maxLen ? `${json.slice(0, maxLen)}...[truncated]` : json;
  } catch {
    return String(raw);
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function pickString(obj: unknown, ...keys: string[]): string | undefined {
  if (!isRecord(obj)) return undefined;
  for (const key of keys) {
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === key.toLowerCase()) {
        const v = obj[k];
        if (typeof v === 'string' && v.trim()) return v.trim();
        if (typeof v === 'number' && !Number.isNaN(v)) return String(v);
      }
    }
  }
  return undefined;
}

/** Extract settlement callback fields from varying ALAT envelope shapes. */
export function extractTransactionCallbackFields(raw: unknown): {
  transactionReference?: string;
  platformTransactionReference?: string;
  status?: string;
  message?: string;
  narration?: string;
  transactionStan?: string;
  orinalTxnTransactionDate?: string;
  dataSource: string;
} {
  const sources: { label: string; node: unknown }[] = [
    { label: 'data', node: isRecord(raw) ? raw.data : undefined },
    { label: 'result.data', node: isRecord(raw) && isRecord(raw.result) ? raw.result.data : undefined },
    { label: 'result', node: isRecord(raw) ? raw.result : undefined },
    { label: 'root', node: raw },
  ];

  for (const { label, node } of sources) {
    const transactionReference = pickString(node, 'transactionReference', 'TransactionReference', 'clientReference');
    const platformTransactionReference = pickString(
      node,
      'platformTransactionReference',
      'PlatformTransactionReference',
      'platformReference',
    );
    const status = pickString(node, 'status', 'Status', 'transactionStatus');
    if (transactionReference && platformTransactionReference) {
      return {
        transactionReference,
        platformTransactionReference,
        status,
        message: pickString(node, 'message', 'Message'),
        narration: pickString(node, 'narration', 'Narration'),
        transactionStan: pickString(node, 'transactionStan', 'TransactionStan'),
        orinalTxnTransactionDate: pickString(
          node,
          'orinalTxnTransactionDate',
          'originalTxnTransactionDate',
          'OriginalTxnTransactionDate',
        ),
        dataSource: label,
      };
    }
  }

  // Partial match: at least client ref (log will show what's missing)
  for (const { label, node } of sources) {
    const transactionReference = pickString(node, 'transactionReference', 'TransactionReference', 'clientReference');
    if (transactionReference) {
      return {
        transactionReference,
        platformTransactionReference: pickString(
          node,
          'platformTransactionReference',
          'PlatformTransactionReference',
          'platformReference',
        ),
        status: pickString(node, 'status', 'Status'),
        dataSource: label,
      };
    }
  }

  return { dataSource: 'none' };
}

function pickNumber(obj: unknown, ...keys: string[]): number | undefined {
  if (!isRecord(obj)) return undefined;
  for (const key of keys) {
    for (const k of Object.keys(obj)) {
      if (k.toLowerCase() === key.toLowerCase()) {
        const v = obj[k];
        if (typeof v === 'number' && !Number.isNaN(v)) return v;
        if (typeof v === 'string' && v.trim() && !Number.isNaN(Number(v))) return Number(v);
      }
    }
  }
  return undefined;
}

export type TransactionNotificationFields = {
  accountNumber?: string;
  transactionType?: string;
  amount?: number;
  narration?: string;
  reference?: string;
  referenceId?: string;
  transactionReference?: string;
  platformTransactionReference?: string;
  transactionDate?: string;
  dataSource: string;
};

/** Flatten ALAT transaction-notification payloads from nested envelopes. */
export function extractTransactionNotificationFields(raw: unknown): TransactionNotificationFields {
  const sources: { label: string; node: unknown }[] = [
    { label: 'data', node: isRecord(raw) ? raw.data : undefined },
    { label: 'result.data', node: isRecord(raw) && isRecord(raw.result) ? raw.result.data : undefined },
    { label: 'result', node: isRecord(raw) ? raw.result : undefined },
    { label: 'root', node: raw },
  ];

  for (const { label, node } of sources) {
    const accountNumber = pickString(node, 'accountNumber', 'AccountNumber');
    const transactionType = pickString(node, 'transactionType', 'TransactionType');
    if (accountNumber || transactionType) {
      return {
        accountNumber,
        transactionType,
        amount: pickNumber(node, 'amount', 'Amount'),
        narration: pickString(node, 'narration', 'Narration'),
        reference: pickString(node, 'reference', 'Reference'),
        referenceId: pickString(node, 'referenceId', 'ReferenceId'),
        transactionReference: pickString(node, 'transactionReference', 'TransactionReference'),
        platformTransactionReference: pickString(
          node,
          'platformTransactionReference',
          'PlatformTransactionReference',
          'platformReference',
        ),
        transactionDate: pickString(node, 'transactionDate', 'TransactionDate'),
        dataSource: label,
      };
    }
  }

  return { dataSource: 'none' };
}

/** Merge extracted notification fields onto the raw webhook body for downstream handlers. */
export function normalizeTransactionNotificationPayload(raw: unknown): Record<string, unknown> {
  const extracted = extractTransactionNotificationFields(raw);
  const base = isRecord(raw) ? { ...raw } : {};
  const merged: Record<string, unknown> = { ...base };

  if (extracted.accountNumber) merged.accountNumber = extracted.accountNumber;
  if (extracted.transactionType) merged.transactionType = extracted.transactionType;
  if (extracted.amount !== undefined) merged.amount = extracted.amount;
  if (extracted.narration) merged.narration = extracted.narration;
  if (extracted.reference) merged.reference = extracted.reference;
  if (extracted.referenceId) merged.referenceId = extracted.referenceId;
  if (extracted.transactionReference) merged.transactionReference = extracted.transactionReference;
  if (extracted.platformTransactionReference) {
    merged.platformTransactionReference = extracted.platformTransactionReference;
  }
  if (extracted.transactionDate) merged.transactionDate = extracted.transactionDate;

  return merged;
}
