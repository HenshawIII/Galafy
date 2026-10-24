import { buildBrandedEmailHtml } from './email-branding.util.js';

export type RiskAlertSeverity = 'SOFT_FREEZE' | 'HARD_FREEZE';

export type RiskThresholdCompliancePayload = {
  severity: RiskAlertSeverity;
  walletId: string;
  customerId?: string | null;
  user: {
    id: string;
    email?: string | null;
    username?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  finalScore: number;
  softThreshold: number;
  hardThreshold: number;
  velocity: number;
  amountSize: number;
  frequency: number;
  deviceRisk: number;
  timeWindowHours: number;
  calculatedAt: string;
  reviewUrl: string;
};

export function buildAdminUserReviewUrl(userId: string): string {
  const base = (
    process.env.ADMIN_PORTAL_URL ||
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  return `${base}/users?userId=${encodeURIComponent(userId)}`;
}

export function buildRiskThresholdComplianceEmailSubject(
  payload: RiskThresholdCompliancePayload,
): string {
  const label = payload.severity === 'HARD_FREEZE' ? 'HIGH' : 'ELEVATED';
  const userLabel = payload.user.email?.trim() || payload.user.id;
  return `[Risk ${label}] Wallet threshold alert — ${userLabel} — score ${payload.finalScore.toFixed(2)}`;
}

export function buildRiskThresholdComplianceEmailHtml(
  payload: RiskThresholdCompliancePayload,
): string {
  const isHard = payload.severity === 'HARD_FREEZE';
  const severityTitle = isHard
    ? 'High severity (hard-freeze threshold)'
    : 'Elevated severity (soft-freeze threshold)';
  const intro = isHard
    ? 'A wallet risk score crossed the <strong>hard-freeze</strong> threshold. The account was <strong>not</strong> frozen automatically — please review and restrict in the admin portal if needed.'
    : 'A wallet risk score crossed the <strong>soft-freeze</strong> threshold. The account was <strong>not</strong> frozen automatically — please review and restrict in the admin portal if needed.';

  return buildBrandedEmailHtml(`
    <h1 style="color: #333333; font-size: 22px; font-weight: bold; margin: 0 0 12px 0;">${escapeHtml(severityTitle)}</h1>
    <p style="color: #333333; font-size: 14px; line-height: 1.6; margin: 0 0 20px 0;">
      ${intro}
    </p>
    <p style="margin: 0 0 20px 0;">
      <a href="${escapeHtml(payload.reviewUrl)}"
         style="display: inline-block; background: #0d2a68; color: #ffffff; text-decoration: none; padding: 12px 18px; border-radius: 6px; font-size: 14px; font-weight: 600;">
        Review user in admin portal
      </a>
    </p>
    <p style="color: #666; font-size: 12px; margin: 0 0 20px 0; word-break: break-all;">
      ${escapeHtml(payload.reviewUrl)}
    </p>
    <h2 style="color: #333; font-size: 16px; margin: 0 0 10px 0;">Score breakdown</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${row('Final score', payload.finalScore.toFixed(2))}
      ${row('Soft threshold', String(payload.softThreshold))}
      ${row('Hard threshold', String(payload.hardThreshold))}
      ${row('Velocity (0–100)', payload.velocity.toFixed(2))}
      ${row('Amount size (0–100)', payload.amountSize.toFixed(2))}
      ${row('Frequency (0–100)', payload.frequency.toFixed(2))}
      ${row('Device risk (0–100)', payload.deviceRisk.toFixed(2))}
      ${row('Time window (hours)', String(payload.timeWindowHours))}
      ${row('Calculated at', payload.calculatedAt)}
    </table>
    <h2 style="color: #333; font-size: 16px; margin: 24px 0 10px 0;">Account</h2>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
      ${row('User id', payload.user.id)}
      ${row('Email', payload.user.email)}
      ${row('Username', payload.user.username)}
      ${row('First name', payload.user.firstName)}
      ${row('Last name', payload.user.lastName)}
      ${row('Customer id', payload.customerId)}
      ${row('Wallet id', payload.walletId)}
    </table>
  `);
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
  const display = value != null && String(value).trim() !== '' ? String(value).trim() : '—';
  return `<tr><td style="padding: 6px 8px; color: #555; vertical-align: top; width: 180px;">${escapeHtml(label)}</td><td style="padding: 6px 8px; color: #111;">${escapeHtml(display)}</td></tr>`;
}
