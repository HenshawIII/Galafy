import {
  DEFAULT_COMPLIANCE_EMAIL,
  buildKycFailureComplianceEmailHtml,
  getComplianceEmailTo,
  redactIdentityNumbers,
} from './kyc-failure-compliance-email.util.js';

describe('kyc failure compliance email', () => {
  const previousIcon = process.env.APP_ICON_URL;
  const previousCompliance = process.env.COMPLIANCE_EMAIL;

  afterEach(() => {
    if (previousIcon === undefined) {
      delete process.env.APP_ICON_URL;
    } else {
      process.env.APP_ICON_URL = previousIcon;
    }

    if (previousCompliance === undefined) {
      delete process.env.COMPLIANCE_EMAIL;
    } else {
      process.env.COMPLIANCE_EMAIL = previousCompliance;
    }
  });

  it('defaults to complaince@galafy.co when COMPLIANCE_EMAIL is unset', () => {
    delete process.env.COMPLIANCE_EMAIL;
    expect(getComplianceEmailTo()).toBe(DEFAULT_COMPLIANCE_EMAIL);
  });

  it('includes the reason and user id in HTML and does not contain a raw 11-digit BVN', () => {
    process.env.APP_ICON_URL = 'https://example.com/logo.png';
    const userId = 'user-abc-123';
    const leakedBvn = '22123456789';

    const html = buildKycFailureComplianceEmailHtml({
      tier: 1,
      reason: 'provider_error',
      user: {
        id: userId,
        email: 'member@example.com',
        username: 'member',
        firstName: 'Ada',
        lastName: 'Lovelace',
        phone: '08012345678',
      },
      customerId: 'cust-1',
      currentTier: 'Tier_0',
      maskedNuban: '******4321',
      httpStatus: 400,
      providerMessage: `BVN rejected ${leakedBvn}`,
      correlationId: 'corr-1',
      extra: { bvn: leakedBvn },
    });

    expect(html).toContain('provider_error');
    expect(html).toContain(userId);
    expect(html).not.toContain(leakedBvn);
    expect(html).toContain(redactIdentityNumbers(leakedBvn));
  });
});
