import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';

const ENC_PREFIX = 'enc:v1:';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const BVN_PATTERN = /^\d{11}$/;

@Injectable()
export class BvnCryptoService {
  private readonly encryptionKey: Buffer;
  private readonly hmacPepper: string;

  constructor() {
    this.encryptionKey = this.loadEncryptionKey();
    this.hmacPepper = process.env.BVN_HMAC_PEPPER?.trim() || '';
    if (!this.hmacPepper) {
      throw new InternalServerErrorException('BVN_HMAC_PEPPER is not configured');
    }
  }

  private loadEncryptionKey(): Buffer {
    const raw = process.env.BVN_ENCRYPTION_KEY?.trim();
    if (!raw) {
      throw new InternalServerErrorException('BVN_ENCRYPTION_KEY is not configured');
    }
    const key = Buffer.from(raw, 'base64');
    if (key.length !== 32) {
      throw new InternalServerErrorException('BVN_ENCRYPTION_KEY must be 32 bytes (base64-encoded)');
    }
    return key;
  }

  normalizeBvn(bvn: string): string {
    const normalized = bvn.trim();
    if (!BVN_PATTERN.test(normalized)) {
      throw new BadRequestException('BVN must be exactly 11 digits');
    }
    return normalized;
  }

  isEncrypted(stored: string): boolean {
    return stored.startsWith(ENC_PREFIX);
  }

  isLegacyPlaintext(stored: string): boolean {
    return BVN_PATTERN.test(stored.trim());
  }

  encrypt(plainBvn: string): string {
    const plain = this.normalizeBvn(plainBvn);
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
    if (this.isLegacyPlaintext(value)) {
      return value;
    }
    if (!this.isEncrypted(value)) {
      throw new InternalServerErrorException('Stored BVN format is invalid');
    }
    const payload = Buffer.from(value.slice(ENC_PREFIX.length), 'base64');
    if (payload.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
      throw new InternalServerErrorException('Stored BVN ciphertext is invalid');
    }
    const iv = payload.subarray(0, IV_LENGTH);
    const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv('aes-256-gcm', this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    return this.normalizeBvn(plain);
  }

  hash(plainBvn: string): string {
    const plain = this.normalizeBvn(plainBvn);
    return createHmac('sha256', this.hmacPepper).update(plain, 'utf8').digest('hex');
  }
}
