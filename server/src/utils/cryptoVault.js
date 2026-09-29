// server/src/utils/cryptoVault.js
import 'dotenv/config'; // Ensures process.env is populated before this module evaluates
import crypto from 'crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM

const MASTER_KEY_RAW = process.env.ENCRYPTION_KEY;
if (!MASTER_KEY_RAW || MASTER_KEY_RAW.length < 32) {
  throw new Error(
    '[cryptoVault] ENCRYPTION_KEY is missing or shorter than 32 characters. ' +
    'Set a unique, random value in server/.env (generate with: openssl rand -hex 32). ' +
    'Refusing to start with a hard-coded fallback key.'
  );
}

// Derive a 32-byte key using scrypt (memory-hard) instead of single SHA-256 (S-04)
const ENCRYPTION_KEY = crypto.scryptSync(MASTER_KEY_RAW, 'valetudo-healthlink-v1', 32);

/**
 * Encrypts sensitive clinical plain text using AES-256-GCM
 * Output format: enc:v1:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encrypt(plainText) {
  // Fix B-05: return explicit null, never undefined
  if (plainText === null || plainText === undefined) return null;
  const stringVal = String(plainText);
  if (!stringVal.trim()) return '';

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

    // S-04: Validate IV and AuthTag lengths to avoid unhandled open failures
    if (iv.length !== IV_LENGTH || authTag.length !== 16) {
      console.error('[AES-256 Decryption Error]: malformed envelope');
      return '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';
    }

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