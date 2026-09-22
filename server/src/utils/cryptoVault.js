// server/src/utils/cryptoVault.js
import crypto from 'crypto';

// 32-byte secret key for AES-256
const MASTER_KEY_RAW = process.env.ENCRYPTION_KEY || 'valetudo_healthlink_aes256_secret_key_32bytes!!';
const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

// Ensure key is exactly 32 bytes
const ENCRYPTION_KEY = crypto.createHash('sha256').update(MASTER_KEY_RAW).digest();

/**
 * Encrypts sensitive clinical plain text using AES-256-GCM
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encrypt(plainText) {
  if (plainText === null || plainText === undefined) return plainText;
  const stringVal = String(plainText);
  if (!stringVal.trim()) return stringVal;

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, ENCRYPTION_KEY, iv);

    let encrypted = cipher.update(stringVal, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `enc:v1:${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('[AES-256 Encryption Error]:', error);
    throw new Error('Failed to encrypt medical field.');
  }
}

/**
 * Decrypts AES-256-GCM ciphertext. If text is unencrypted (legacy/seed), returns original.
 */
export function decrypt(cipherText) {
  if (cipherText === null || cipherText === undefined) return cipherText;
  const stringVal = String(cipherText);

  // If not encrypted with our vault prefix, return plaintext as fallback
  if (!stringVal.startsWith('enc:v1:')) {
    return stringVal;
  }

  try {
    const parts = stringVal.split(':');
    if (parts.length !== 5) return stringVal;

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedText = parts[4];

    const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[AES-256 Decryption Error]:', error.message);
    return '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';
  }
}