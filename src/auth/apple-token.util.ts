import { UnauthorizedException } from '@nestjs/common';
import { createRemoteJWKSet, jwtVerify } from 'jose';

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS = createRemoteJWKSet(new URL('https://appleid.apple.com/auth/keys'));

export function getAppleAudiences(): string[] {
  const audiences = new Set<string>();
  const primary = process.env.APPLE_CLIENT_ID?.trim();
  if (primary) {
    audiences.add(primary);
  }

  for (const extra of (process.env.APPLE_CLIENT_IDS ?? '').split(',')) {
    const id = extra.trim();
    if (id) {
      audiences.add(id);
    }
  }

  return [...audiences];
}

export async function validateAppleIdentityToken(identityToken: string): Promise<{
  sub: string;
  email?: string;
}> {
  const audiences = getAppleAudiences();
  if (audiences.length === 0) {
    throw new UnauthorizedException('Apple Sign In is not properly configured');
  }

  if (!identityToken?.trim()) {
    throw new UnauthorizedException('Invalid Apple token');
  }

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_JWKS, {
      issuer: APPLE_ISSUER,
      audience: audiences,
    });

    const sub = typeof payload.sub === 'string' ? payload.sub.trim() : '';
    if (!sub) {
      throw new UnauthorizedException('Invalid Apple token: subject is missing');
    }

    const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : undefined;

    return { sub, email: email || undefined };
  } catch (error: unknown) {
    if (error instanceof UnauthorizedException) {
      throw error;
    }

    const message = error instanceof Error ? error.message : 'Token verification failed';
    if (/audience|aud/i.test(message)) {
      throw new UnauthorizedException(
        'Invalid Apple token: Client ID mismatch. Ensure APPLE_CLIENT_ID / APPLE_CLIENT_IDS match the app Services ID or bundle ID.',
      );
    }
    if (/expir/i.test(message)) {
      throw new UnauthorizedException('Invalid Apple token: Token has expired');
    }
    if (/issuer|iss/i.test(message)) {
      throw new UnauthorizedException('Invalid Apple token: Invalid issuer');
    }

    throw new UnauthorizedException(`Invalid Apple token: ${message}`);
  }
}
