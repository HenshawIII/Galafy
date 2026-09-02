import {
  DEFAULT_EMAIL_SUPPORT_PHONE,
  buildBrandedEmailHtml,
  getEmailSupportPhone,
} from './email-branding.util.js';

describe('email branding', () => {
  const previousIcon = process.env.APP_ICON_URL;
  const previousPhone = process.env.SUPPORT_PHONE;

  afterEach(() => {
    if (previousIcon === undefined) {
      delete process.env.APP_ICON_URL;
    } else {
      process.env.APP_ICON_URL = previousIcon;
    }

    if (previousPhone === undefined) {
      delete process.env.SUPPORT_PHONE;
    } else {
      process.env.SUPPORT_PHONE = previousPhone;
    }
  });

  it('uses the default support phone when SUPPORT_PHONE is unset', () => {
    delete process.env.SUPPORT_PHONE;
    expect(getEmailSupportPhone()).toBe(DEFAULT_EMAIL_SUPPORT_PHONE);
  });

  it('includes the support number as a tel link in branded HTML', () => {
    process.env.APP_ICON_URL = 'https://example.com/logo.png';
    delete process.env.SUPPORT_PHONE;

    const html = buildBrandedEmailHtml('<p>Hello</p>');

    expect(html).toContain(DEFAULT_EMAIL_SUPPORT_PHONE);
    expect(html).toContain(`tel:${DEFAULT_EMAIL_SUPPORT_PHONE}`);
    expect(html).toContain('Contact support:');
  });
});
