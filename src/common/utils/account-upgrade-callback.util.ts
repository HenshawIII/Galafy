export type AccountUpgradeOutcome = 'success' | 'failure' | 'unknown';

export type AccountUpgradeCallbackFields = {
  title: string | null;
  message: string | null;
  email: string | null;
  nuban: string | null;
  nubanName: string | null;
  phoneNumber: string | null;
  nubanStatus: string | null;
  requestType: number | null;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  return null;
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Extract documented account-upgrade webhook fields from a raw provider payload. */
export function extractAccountUpgradeCallbackFields(raw: unknown): AccountUpgradeCallbackFields {
  const root = isRecord(raw) ? raw : {};
  const data = isRecord(root.data) ? root.data : {};

  return {
    title: asTrimmedString(root.title),
    message: asTrimmedString(root.message),
    email: asTrimmedString(data.email)?.toLowerCase() ?? null,
    nuban: asTrimmedString(data.nuban),
    nubanName: asTrimmedString(data.nubanName),
    phoneNumber: asTrimmedString(data.phoneNumber),
    nubanStatus: asTrimmedString(data.nubanStatus),
    requestType: asNumber(root.requestType),
  };
}

/**
 * Classify upgrade webhook outcome from inbound title/message.
 * Failure checked first so "Address verification failed" is not treated as success.
 */
export function classifyAccountUpgradeOutcome(
  title?: string | null,
  message?: string | null,
): AccountUpgradeOutcome {
  const text = `${title ?? ''} ${message ?? ''}`.toLowerCase();

  if (
    text.includes('address verification failed') ||
    text.includes('verification failed')
  ) {
    return 'failure';
  }

  if (
    text.includes('upgraded successfully') ||
    text.includes('address has been verified')
  ) {
    return 'success';
  }

  return 'unknown';
}
