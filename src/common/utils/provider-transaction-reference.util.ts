import { createHash, randomBytes } from 'crypto';

/**
 * ALAT ProcessClientTransfer `transactionReference` length limit (partner guidance).
 * Keep at or below this for auth callbacks and settlement.
 */
export const PROVIDER_TX_REF_MAX_LENGTH = 30;

function shortDigestHex(seed: string, hexLen: number): string {
  return createHash('sha256').update(seed, 'utf8').digest('hex').slice(0, hexLen);
}

/**
 * Deterministic provider-safe reference from a seed (idempotency / fee sweeps).
 */
export function buildStableProviderRef(prefix: string, seed: string): string {
  const p = prefix.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  const dash = p.length > 0 ? 1 : 0;
  const bodyLen = Math.max(8, PROVIDER_TX_REF_MAX_LENGTH - p.length - dash);
  const body = shortDigestHex(seed, bodyLen);
  const ref = p ? `${p}-${body}` : body;
  return ref.length <= PROVIDER_TX_REF_MAX_LENGTH ? ref : ref.slice(0, PROVIDER_TX_REF_MAX_LENGTH);
}

/**
 * Unique provider-safe reference (new transfer).
 */
export function buildUniqueProviderRef(prefix: string): string {
  return buildStableProviderRef(prefix, `${prefix}-${randomBytes(12).toString('hex')}-${Date.now()}`);
}

/**
 * Normalize an existing reference for provider APIs (truncate via stable hash if too long).
 */
export function toProviderTransactionReference(existing: string, prefix = 'TX'): string {
  const trimmed = existing.trim();
  if (!trimmed) return buildUniqueProviderRef(prefix);
  if (trimmed.length <= PROVIDER_TX_REF_MAX_LENGTH) return trimmed;
  return buildStableProviderRef(prefix, trimmed);
}
