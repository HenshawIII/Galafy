import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

@Injectable()
export class AdminSecretCryptoService {
  private readonly encryptionKey: Buffer;

  constructor() {
    this.encryptionKey = this.loadEncryptionKey();
  }

  private loadEncryptionKey(): Buffer {
    const raw = process.env.ADMIN_2FA_ENCRYPTION_KEY?.trim();
    if (raw) {
      const key = Buffer.from(raw, 'base64');
      if (key.length !== 32) {
        throw new InternalServerErrorException(
          'ADMIN_2FA_ENCRYPTION_KEY must be 32 bytes (base64-encoded)',
        );
      }
      return key;
    }

    const fallback = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
    if (!fallback) {
      throw new InternalServerErrorException('ADMIN_2FA_ENCRYPTION_KEY or ADMIN_JWT_SECRET is required');
    }

    return createHash('sha256').update(fallback, 'utf8').digest();
  }

  encrypt(plain: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv('aes-256-gcm', this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const payload = Buffer.concat([iv, authTag, encrypted]);
    return `${ENC_PREFIX}${payload.toString('base64')}`;
  }

  decrypt(stored: string | null | undefined): string | null {
    if (!stored?.trim()) return null;
    const value = stored.trim();
    if (!value.startsWith(ENC_PREFIX)) {
      throw new InternalServerErrorException('Stored secret format is invalid');
    }

    const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new InternalServerErrorException('Stored secret ciphertext is invalid');
    }

    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
  }
}
