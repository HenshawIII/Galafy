import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

export const EMAIL_BRAND_COLOR = '#0C1A66';
export const EMAIL_BRAND_NAME = 'Galafy';

const moduleDir = dirname(fileURLToPath(import.meta.url));

let cachedEmbeddedLogoSrc: string | null = null;

function resolveEmailLogoPath(): string | null {
  const candidates = [
    join(moduleDir, '..', 'assets', 'email-logo.png'),
    join(process.cwd(), 'dist', 'common', 'assets', 'email-logo.png'),
    join(process.cwd(), 'dist', 'src', 'common', 'assets', 'email-logo.png'),
    join(process.cwd(), 'src', 'common', 'assets', 'email-logo.png'),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  return null;
}

export function getEmailLogoSrc(): string {
  if (process.env.APP_ICON_URL) {
    return process.env.APP_ICON_URL;
  }

  if (!cachedEmbeddedLogoSrc) {
    const logoPath = resolveEmailLogoPath();
    if (!logoPath) {
      throw new Error('Email logo asset not found. Expected email-logo.png in common/assets.');
    }

    const buffer = readFileSync(logoPath);
    cachedEmbeddedLogoSrc = `data:image/png;base64,${buffer.toString('base64')}`;
  }

  return cachedEmbeddedLogoSrc;
}

export function buildEmailHeader(options?: { title?: string }): string {
  const logoSrc = getEmailLogoSrc();
  const titleHtml = options?.title
    ? `<p style="color: #ffffff; font-size: 14px; font-weight: 600; margin: 12px 0 0 0; letter-spacing: 0.5px;">${options.title}</p>`
    : '';

  return `
    <div style="background-color: ${EMAIL_BRAND_COLOR}; padding: 30px 20px; text-align: center;">
      <img src="${logoSrc}" alt="${EMAIL_BRAND_NAME}" style="height: 36px; width: auto; display: inline-block;" />
      ${titleHtml}
    </div>
  `;
}

export function buildBrandedEmailHtml(
  bodyHtml: string,
  options?: { headerTitle?: string },
): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f5f5f5;">
      <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff;">
        ${buildEmailHeader(options?.headerTitle ? { title: options.headerTitle } : undefined)}
        <div style="padding: 30px 20px;">
          ${bodyHtml}
        </div>
      </div>
    </body>
    </html>
  `;
}
