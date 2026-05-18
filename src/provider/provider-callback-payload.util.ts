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
