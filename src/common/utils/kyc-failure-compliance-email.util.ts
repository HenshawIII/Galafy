import { HttpException } from '@nestjs/common';
import { buildBrandedEmailHtml } from './email-branding.util.js';

/** Default compliance inbox (env override: COMPLIANCE_EMAIL). */
export const DEFAULT_COMPLIANCE_EMAIL = 'compliance@galafy.co';

const FORBIDDEN_FIELD_KEYS = new Set([
  'bvn',
  'nin',
  'encryptedbvn',
  'tier1pendingbvn',
  'tier1bvnhash',
  'liveimageofface',
  'liveimage',
  'image',
  'face',
  'password',
]);

export type KycFailureReason =
  | 'face_failed'
  | 'provider_error'
  | 'duplicate_identity'
  | 'account_creation_failed';

export type KycFailureCompliancePayload = {
  tier: 1 | 2 | 3;
  reason: KycFailureReason | string;
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    phone?: string | null;
  };
  customerId?: string | null;
  currentTier?: string | number | null;
  maskedNuban?: string | null;
  httpStatus?: number | null;
  providerMessage?: string | null;
  correlationId?: string | null;
  trackingId?: string | null;
  addressFields?: Record<string, string | undefined | null> | null;
  extra?: Record<string, string | number | boolean | null | undefined>;
};

export function getComplianceEmailTo(): string {
  const override = process.env.COMPLIANCE_EMAIL?.trim();
  return override || DEFAULT_COMPLIANCE_EMAIL;
}

/** Mask 11-digit identity numbers (BVN/NIN) if they leak into investigation text. */
export function redactIdentityNumbers(text: string): string {
  return text.replace(/\b\d{11}\b/g, (match) => `*******${match.slice(-4)}`);
}

export function describeCaughtProviderError(err: unknown): { httpStatus?: number; message: string } {
  if (err instanceof HttpException) {
    return {
      httpStatus: err.getStatus(),
      message: redactIdentityNumbers(extractHttpMessage(err.getResponse())).slice(0, 800),
    };
  }
  if (err instanceof Error) {
    return { message: redactIdentityNumbers(err.message).slice(0, 800) };
  }
  return { message: redactIdentityNumbers(String(err)).slice(0, 800) };
}

export function buildKycFailureComplianceEmailHtml(payload: KycFailureCompliancePayload): string {
  const user = payload.user;
  const addressRows = Object.entries(payload.addressFields ?? {})
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => row(key, String(value)))
    .join('');

  const extraRows = Object.entries(payload.extra ?? {})
    .filter(([key]) => !FORBIDDEN_FIELD_KEYS.has(key.toLowerCase().replace(/[^a-z0-9]/g, '')))
    .filter(([, value]) => value != null && String(value).trim() !== '')
    .map(([key, value]) => row(key, String(value)))
    .join('');

  return buildBrandedEmailHtml(`
    <h1 style="color: #333333; font-size: 22px; font-weight: bold; margin: 0 0 12px 0;">KYC verification failed</h1>
    <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      A Tier ${escapeHtml(String(payload.tier))} verification failed and needs investigation. This message does not include BVN, NIN, or face images.
    </p>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${row('Reason', payload.reason)}
      ${row('User id', user.id)}
      ${row('Email', user.email)}
      ${row('Username', user.username)}
      ${row('First name', user.firstName)}
      ${row('Last name', user.lastName)}
      ${row('Phone', user.phone)}
      ${row('Customer id', payload.customerId)}
      ${row('Current tier', payload.currentTier != null ? String(payload.currentTier) : null)}
      ${row('NUBAN (masked)', payload.maskedNuban)}
      ${row('HTTP / status', payload.httpStatus != null ? String(payload.httpStatus) : null)}
      ${row('Provider message', payload.providerMessage)}
      ${payload.tier === 1 ? row('correlationId', payload.correlationId) : ''}
      ${payload.tier === 1 ? row('trackingId', payload.trackingId) : ''}
      ${addressRows}
      ${extraRows}
    </table>
  `);
}

function extractHttpMessage(res: string | object): string {
  if (typeof res === 'string') return res.slice(0, 800);
  if (!res || typeof res !== 'object') return '';

  const obj = res as Record<string, unknown>;
  if (typeof obj.message === 'string') return obj.message.slice(0, 800);
  if (Array.isArray(obj.message)) return obj.message.map(String).join('; ').slice(0, 800);

  const sanitized: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const normalized = key.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (FORBIDDEN_FIELD_KEYS.has(normalized)) continue;
    if (typeof value === 'string' && value.length > 400) continue;
    sanitized[key] = value;
  }
  return JSON.stringify(sanitized).slice(0, 800);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function row(label: string, value: string | null | undefined): string {
  const display = value != null && String(value).trim() !== '' ? redactIdentityNumbers(String(value).trim()) : '—';
  return `<tr><td style="padding: 6px 8px; color: #555; vertical-align: top; width: 180px;">${escapeHtml(label)}</td><td style="padding: 6px 8px; color: #111;">${escapeHtml(display)}</td></tr>`;
}
