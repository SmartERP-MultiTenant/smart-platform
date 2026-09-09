import crypto from 'crypto';
import { encryptErpToken, decryptErpToken } from '@/lib/crypto/erpToken';

// Deterministic key material: force the module to see an unset
// ERP_TOKEN_ENCRYPTION_KEY (env.ts reads process.env once at load time), so
// every test below exercises the dev-only fallback key regardless of the
// runner's shell environment.
jest.mock('@/lib/env', () => ({
  __esModule: true,
  default: { erp: { tokenEncryptionKey: '' } },
}));

// Must mirror lib/crypto/erpToken.ts DEV_FALLBACK_KEY — the tests build
// expected keyIds and legacy fixtures from it.
const DEV_FALLBACK_KEY = 'smart-platform-default-dev-encryption-key-32b';
const expectedKeyId = crypto
  .createHash('sha256')
  .update(DEV_FALLBACK_KEY)
  .digest()
  .toString('hex')
  .slice(0, 8);

describe('ERP Token AES-256-GCM Crypto Module (P4.14)', () => {
  const sampleToken =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample-payload.signature';

  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    // Silence the dev-fallback warning unless a test asserts on it.
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    warnSpy.mockRestore();
  });

  describe('key governance (H1)', () => {
    it('warns exactly once when ERP_TOKEN_ENCRYPTION_KEY is unset outside production', () => {
      // Fresh module instance via require so the warn-once flag is reset for
      // this assertion regardless of what earlier tests did.
      jest.resetModules();

      /* eslint-disable @typescript-eslint/no-require-imports */
      const fresh =
        require('@/lib/crypto/erpToken') as typeof import('@/lib/crypto/erpToken');
      /* eslint-enable @typescript-eslint/no-require-imports */

      fresh.encryptErpToken('first-token');
      fresh.encryptErpToken('second-token');

      expect(warnSpy).toHaveBeenCalledTimes(1);
    });

    it('throws in production when ERP_TOKEN_ENCRYPTION_KEY is unset', () => {
      const originalNodeEnv = process.env.NODE_ENV;
      (process.env as unknown as { NODE_ENV?: string }).NODE_ENV = 'production';

      try {
        expect(() => encryptErpToken(sampleToken)).toThrow(
          'ERP_TOKEN_ENCRYPTION_KEY is required in production'
        );

        // Decrypting an enc:v1 token must also fail loudly (no silent
        // fallback to a published key).
        expect(() =>
          decryptErpToken(
            `enc:v1:${expectedKeyId}:aa11bb22cc33:dd44ee55:ff00aa11bb22`
          )
        ).toThrow('ERP_TOKEN_ENCRYPTION_KEY is required in production');
      } finally {
        (process.env as unknown as { NODE_ENV?: string }).NODE_ENV =
          originalNodeEnv;
      }
    });

    it('is not influenced by NEXTAUTH_SECRET (key separation regression guard)', () => {
      process.env.NEXTAUTH_SECRET = 'some-session-secret';
      try {
        const encrypted = encryptErpToken(sampleToken);
        expect(encrypted.split(':')[2]).toBe(expectedKeyId);
      } finally {
        delete process.env.NEXTAUTH_SECRET;
      }
    });
  });

  describe('envelope format (enc:v1:<keyId>:<iv>:<tag>:<ct>)', () => {
    it('encrypts plaintext token into a 6-part enc:v1 envelope and decrypts back', () => {
      const encrypted = encryptErpToken(sampleToken);

      expect(encrypted).not.toEqual(sampleToken);
      expect(encrypted.startsWith('enc:v1:')).toBe(true);

      const parts = encrypted.split(':');
      expect(parts).toHaveLength(6); // ['enc', 'v1', keyId, iv, tag, ciphertext]
      expect(parts[2]).toBe(expectedKeyId);

      const decrypted = decryptErpToken(encrypted);
      expect(decrypted).toEqual(sampleToken);
    });

    it('emits a stable content-addressed keyId across encryptions', () => {
      const first = encryptErpToken(sampleToken);
      const second = encryptErpToken(sampleToken);

      expect(first.split(':')[2]).toBe(second.split(':')[2]);
      expect(first.split(':')[2]).toBe(expectedKeyId);
    });

    it('does not double-encrypt an already encrypted token', () => {
      const encrypted1 = encryptErpToken(sampleToken);
      const encrypted2 = encryptErpToken(encrypted1);

      expect(encrypted2).toEqual(encrypted1);
    });

    it('rejects a token whose keyId does not match the current key', () => {
      const encrypted = encryptErpToken(sampleToken);
      const parts = encrypted.split(':');
      parts[2] = 'ffffffff'; // unknown key id
      const foreignToken = parts.join(':');

      expect(() => decryptErpToken(foreignToken)).toThrow(
        'Unknown ERP token key id'
      );
    });

    it('throws an error when encrypted token is tampered with', () => {
      const encrypted = encryptErpToken(sampleToken);
      const parts = encrypted.split(':');
      // Tamper with ciphertext
      parts[5] = '00' + parts[5].slice(2);
      const tampered = parts.join(':');

      expect(() => decryptErpToken(tampered)).toThrow();
    });

    it('throws an error when encrypted token format has invalid parts', () => {
      const tooShort = 'enc:v1:incomplete:parts';
      expect(() => decryptErpToken(tooShort)).toThrow(
        'Invalid encrypted token format'
      );

      const tooLong = 'enc:v1:a:b:c:d:e';
      expect(() => decryptErpToken(tooLong)).toThrow(
        'Invalid encrypted token format'
      );
    });

    it('decrypts legacy 5-part tokens (pre-keyId format) with the current key', () => {
      // Build a legacy `enc:v1:<iv>:<tag>:<ct>` token exactly as PR #55 wrote
      // them (dev databases only — this is the backward-compat path).
      const legacyKey = crypto
        .createHash('sha256')
        .update(DEV_FALLBACK_KEY)
        .digest();
      const iv = crypto.randomBytes(12);
      const cipher = crypto.createCipheriv('aes-256-gcm', legacyKey, iv);
      const ciphertext = Buffer.concat([
        cipher.update('legacy-plain-token'),
        cipher.final(),
      ]);
      const tag = cipher.getAuthTag();
      const legacyToken = `enc:v1:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`;

      expect(legacyToken.split(':')).toHaveLength(5);
      expect(decryptErpToken(legacyToken)).toBe('legacy-plain-token');
    });
  });

  describe('backward compatibility with unencrypted legacy tokens', () => {
    it('passes plaintext through untouched', () => {
      const legacyPlainToken = 'legacy-plain-jwt-token-xyz';
      const result = decryptErpToken(legacyPlainToken);

      expect(result).toEqual(legacyPlainToken);
    });

    it('handles null, undefined, and empty string safely', () => {
      expect(encryptErpToken('')).toEqual('');
      expect(encryptErpToken(null as any)).toEqual('');
      expect(encryptErpToken(undefined as any)).toEqual('');

      expect(decryptErpToken('')).toEqual('');
      expect(decryptErpToken(null as any)).toEqual('');
      expect(decryptErpToken(undefined as any)).toEqual('');
    });
  });
});
