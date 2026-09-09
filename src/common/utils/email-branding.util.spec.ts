import {
  DEFAULT_EMAIL_FROM_ADDRESS,
  DEFAULT_EMAIL_FROM_NAME,
  DEFAULT_EMAIL_SUPPORT_PHONE,
  buildBrandedEmailHtml,
  getEmailFrom,
  getEmailSupportPhone,
} from './email-branding.util.js';

describe('email branding', () => {
  const previousIcon = process.env.APP_ICON_URL;
  const previousPhone = process.env.SUPPORT_PHONE;
  const previousFromName = process.env.SENDGRID_FROM_NAME;
  const previousSmtpUser = process.env.SMTP_USER;
  const previousSendgridFrom = process.env.SENDGRID_FROM;

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

    if (previousFromName === undefined) {
      delete process.env.SENDGRID_FROM_NAME;
    } else {
      process.env.SENDGRID_FROM_NAME = previousFromName;
    }

    if (previousSmtpUser === undefined) {
      delete process.env.SMTP_USER;
    } else {
      process.env.SMTP_USER = previousSmtpUser;
    }

    if (previousSendgridFrom === undefined) {
      delete process.env.SENDGRID_FROM;
    } else {
      process.env.SENDGRID_FROM = previousSendgridFrom;
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

  it('returns The Galafy Team as the default From display name', () => {
    delete process.env.SENDGRID_FROM_NAME;
    delete process.env.SMTP_USER;
    process.env.SENDGRID_FROM = 'hello@galafy.com';

    expect(getEmailFrom()).toEqual({
      email: 'hello@galafy.com',
      name: DEFAULT_EMAIL_FROM_NAME,
    });
  });

  it('falls back to the default From address when no sender env is set', () => {
    delete process.env.SENDGRID_FROM_NAME;
    delete process.env.SMTP_USER;
    delete process.env.SENDGRID_FROM;

    expect(getEmailFrom()).toEqual({
      email: DEFAULT_EMAIL_FROM_ADDRESS,
      name: DEFAULT_EMAIL_FROM_NAME,
    });
  });
});
