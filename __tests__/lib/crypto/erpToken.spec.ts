import {
  encryptErpToken,
  decryptErpToken,
} from '@/lib/crypto/erpToken';

describe('ERP Token AES-256-GCM Crypto Module (P4.14)', () => {
  const sampleToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sample-payload.signature';

  it('encrypts plaintext token into enc:v1 format and decrypts back to original', () => {
    const encrypted = encryptErpToken(sampleToken);

    expect(encrypted).not.toEqual(sampleToken);
    expect(encrypted.startsWith('enc:v1:')).toBe(true);

    const parts = encrypted.split(':');
    expect(parts).toHaveLength(5); // ['enc', 'v1', iv, tag, ciphertext]

    const decrypted = decryptErpToken(encrypted);
    expect(decrypted).toEqual(sampleToken);
  });

  it('does not double-encrypt an already encrypted token', () => {
    const encrypted1 = encryptErpToken(sampleToken);
    const encrypted2 = encryptErpToken(encrypted1);

    expect(encrypted2).toEqual(encrypted1);
  });

  it('supports backward compatibility with unencrypted legacy tokens', () => {
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

  it('throws an error when encrypted token is tampered with', () => {
    const encrypted = encryptErpToken(sampleToken);
    const parts = encrypted.split(':');
    // Tamper with ciphertext
    parts[4] = '00' + parts[4].slice(2);
    const tampered = parts.join(':');

    expect(() => decryptErpToken(tampered)).toThrow();
  });

  it('throws an error when encrypted token format has invalid parts', () => {
    const invalidFormat = 'enc:v1:incomplete:parts';
    expect(() => decryptErpToken(invalidFormat)).toThrow('Invalid encrypted token format');
  });
});
