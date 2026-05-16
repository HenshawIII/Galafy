import { BvnCryptoService } from './bvn-crypto.service.js';
import { randomBytes } from 'crypto';

describe('BvnCryptoService', () => {
  const testKey = randomBytes(32).toString('base64');
  const testPepper = 'test-pepper-for-bvn-hmac';

  beforeAll(() => {
    process.env.BVN_ENCRYPTION_KEY = testKey;
    process.env.BVN_HMAC_PEPPER = testPepper;
  });

  let service: BvnCryptoService;

  beforeEach(() => {
    service = new BvnCryptoService();
  });

  it('encrypts and decrypts BVN round-trip', () => {
    const plain = '12345678901';
    const encrypted = service.encrypt(plain);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);
    expect(service.decrypt(encrypted)).toBe(plain);
  });

  it('produces different ciphertext for same BVN (random IV)', () => {
    const plain = '12345678901';
    expect(service.encrypt(plain)).not.toBe(service.encrypt(plain));
  });

  it('returns legacy plaintext as-is from decrypt', () => {
    expect(service.decrypt('12345678901')).toBe('12345678901');
  });

  it('hash is stable for the same BVN', () => {
    const plain = '12345678901';
    expect(service.hash(plain)).toBe(service.hash(plain));
    expect(service.hash(plain)).not.toBe(service.hash('10987654321'));
  });

  it('rejects invalid BVN on normalize', () => {
    expect(() => service.normalizeBvn('123')).toThrow('BVN must be exactly 11 digits');
  });

  it('rejects invalid stored format on decrypt', () => {
    expect(() => service.decrypt('not-a-bvn')).toThrow('Stored BVN format is invalid');
  });
});
