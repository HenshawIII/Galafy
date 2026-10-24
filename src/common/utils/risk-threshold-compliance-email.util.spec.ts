import {
  buildAdminUserReviewUrl,
  buildRiskThresholdComplianceEmailHtml,
  buildRiskThresholdComplianceEmailSubject,
} from './risk-threshold-compliance-email.util.js';

describe('risk threshold compliance email', () => {
  const previousAdmin = process.env.ADMIN_PORTAL_URL;
  const previousIcon = process.env.APP_ICON_URL;

  afterEach(() => {
    if (previousAdmin === undefined) delete process.env.ADMIN_PORTAL_URL;
    else process.env.ADMIN_PORTAL_URL = previousAdmin;
    if (previousIcon === undefined) delete process.env.APP_ICON_URL;
    else process.env.APP_ICON_URL = previousIcon;
  });

  it('builds admin user review deep link', () => {
    process.env.ADMIN_PORTAL_URL = 'https://ops.galafy.co/';
    expect(buildAdminUserReviewUrl('user-1')).toBe('https://ops.galafy.co/users?userId=user-1');
  });

  it('uses HIGH subject for hard severity and includes score breakdown in HTML', () => {
    process.env.APP_ICON_URL = 'https://example.com/logo.png';
    const payload = {
      severity: 'HARD_FREEZE' as const,
      walletId: 'wallet-1',
      customerId: 'cust-1',
      user: { id: 'user-1', email: 'a@b.com', username: 'ayo' },
      finalScore: 88.5,
      softThreshold: 70,
      hardThreshold: 85,
      velocity: 90,
      amountSize: 80,
      frequency: 95,
      deviceRisk: 0,
      timeWindowHours: 24,
      calculatedAt: '2026-10-24T12:00:00.000Z',
      reviewUrl: 'https://ops.galafy.co/users?userId=user-1',
    };

    expect(buildRiskThresholdComplianceEmailSubject(payload)).toContain('[Risk HIGH]');
    const html = buildRiskThresholdComplianceEmailHtml(payload);
    expect(html).toContain('hard-freeze');
    expect(html).toContain('88.50');
    expect(html).toContain('Velocity');
    expect(html).toContain('Review user in admin portal');
    expect(html).toContain('not</strong> frozen automatically');
  });
});
