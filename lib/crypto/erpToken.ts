import crypto from 'crypto';
import env from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const KEY_ID_LENGTH = 8;

// DEV-ONLY fallback. Never used when NODE_ENV=production: encrypt/decrypt throw
// unless ERP_TOKEN_ENCRYPTION_KEY is set, so this published value can never
// silently "protect" production data.
const DEV_FALLBACK_KEY = 'smart-platform-default-dev-encryption-key-32b';

let warnedDevFallback = false;

interface ResolvedKeyMaterial {
  key: Buffer;
  keyId: string;
}

/**
 * Resolves the ERP token encryption key material.
 *
 * Key governance (P4.14 fix):
 * - `ERP_TOKEN_ENCRYPTION_KEY` set → used (sha256 → 32 bytes, AES-256-GCM).
 * - Unset + NODE_ENV=production → throws. Never silently encrypt production
 *   secrets with a published fallback key.
 * - Unset + any other environment → dev-only fallback key + one-time warning.
 * - `NEXTAUTH_SECRET` is deliberately NOT part of the chain: rotating the
 *   session secret must never corrupt data-at-rest, and the two secrets serve
 *   different purposes (key separation).
 *
 * The returned keyId is content-addressed (first 8 hex chars of the sha256
 * digest) and is embedded in every token envelope (`enc:v1:<keyId>:...`), so
 * a future multi-key rotation/re-encryption migration stays backward
 * compatible without any extra configuration.
 */
function resolveKeyMaterial(): ResolvedKeyMaterial {
  const secretKey = env.erp.tokenEncryptionKey;

  if (!secretKey) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ERP_TOKEN_ENCRYPTION_KEY is required in production');
    }

    if (!warnedDevFallback) {
      warnedDevFallback = true;
      console.warn(
        '[erpToken] ERP_TOKEN_ENCRYPTION_KEY is not set — using the DEV-ONLY ' +
          'fallback key. Set ERP_TOKEN_ENCRYPTION_KEY in any non-local environment.'
      );
    }
  }

  const keyMaterial = secretKey || DEV_FALLBACK_KEY;
  const key = crypto.createHash('sha256').update(keyMaterial).digest();
  const keyId = key.toString('hex').slice(0, KEY_ID_LENGTH);

  return { key, keyId };
}

/**
 * Encrypts an ERP access token using AES-256-GCM.
 * Output format: enc:v1:<key_id_hex>:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptErpToken(plainText: string | null | undefined): string {
  if (!plainText) {
    return plainText ?? '';
  }

  // If already encrypted, do not double-encrypt
  if (plainText.startsWith(PREFIX)) {
    return plainText;
  }

  const { key, keyId } = resolveKeyMaterial();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${PREFIX}${keyId}:${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an ERP access token using AES-256-GCM.
 *
 * Accepts:
 * - 6-part `enc:v1:<keyId>:<iv>:<tag>:<ct>` (current format) — verifies the
 *   embedded keyId matches the current key.
 * - legacy 5-part `enc:v1:<iv>:<tag>:<ct>` (pre-keyId format, PR #55 dev
 *   databases only) — decrypted with the current key.
 * - plaintext without the `enc:v1:` prefix → returned as-is (backward
 *   compatibility with legacy unencrypted tokens).
 */
export function decryptErpToken(cipherText: string | null | undefined): string {
  if (!cipherText) {
    return cipherText ?? '';
  }

  // Backward compatibility: If not in enc:v1 format, assume legacy plaintext
  if (!cipherText.startsWith(PREFIX)) {
    return cipherText;
  }

  const parts = cipherText.split(':');
  const isKeyIdFormat = parts.length === 6;
  const isLegacyFormat = parts.length === 5;

  if (!isKeyIdFormat && !isLegacyFormat) {
    throw new Error('Invalid encrypted token format');
  }

  const { key, keyId } = resolveKeyMaterial();

  let ivHex: string;
  let tagHex: string;
  let dataHex: string;

  if (isKeyIdFormat) {
    const [, , tokenKeyId, iv, tag, data] = parts;
    if (tokenKeyId !== keyId) {
      throw new Error('Unknown ERP token key id');
    }
    ivHex = iv;
    tagHex = tag;
    dataHex = data;
  } else {
    const [, , iv, tag, data] = parts;
    ivHex = iv;
    tagHex = tag;
    dataHex = data;
  }

  const ivBuffer = Buffer.from(ivHex, 'hex');
  const tagBuffer = Buffer.from(tagHex, 'hex');
  const encryptedData = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, ivBuffer);
  decipher.setAuthTag(tagBuffer);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
