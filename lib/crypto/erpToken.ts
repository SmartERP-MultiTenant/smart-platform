import crypto from 'crypto';
import env from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const PREFIX = 'enc:v1:';
const DEFAULT_DEV_KEY = 'smart-platform-default-dev-encryption-key-32b';

function getKeyBuffer(): Buffer {
  const secretKey = env.erp.tokenEncryptionKey || process.env.NEXTAUTH_SECRET || DEFAULT_DEV_KEY;
  return crypto.createHash('sha256').update(secretKey).digest();
}

/**
 * Encrypts an ERP access token using AES-256-GCM.
 * Output format: enc:v1:<iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptErpToken(plainText: string | null | undefined): string {
  if (!plainText) {
    return plainText ?? '';
  }

  // If already encrypted, do not double-encrypt
  if (plainText.startsWith(PREFIX)) {
    return plainText;
  }

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plainText, 'utf8'),
    cipher.final(),
  ]);

  const tag = cipher.getAuthTag();

  return `${PREFIX}${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts an ERP access token using AES-256-GCM.
 * Returns the raw string directly if it was not encrypted with enc:v1 (backward compatibility).
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
  if (parts.length !== 5) {
    throw new Error('Invalid encrypted token format');
  }

  const [, , ivHex, tagHex, dataHex] = parts;
  const key = getKeyBuffer();
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encryptedData = Buffer.from(dataHex, 'hex');

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([
    decipher.update(encryptedData),
    decipher.final(),
  ]);

  return decrypted.toString('utf8');
}
