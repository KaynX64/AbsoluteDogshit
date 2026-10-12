// server/src/utils/cryptoVault.js
//
// AES-256-GCM field encryption for PHI.
//
// Envelope format
//   enc:v2:<iv_hex>:<tag_hex>:<ciphertext_hex>
//   key = scrypt(ENCRYPTION_KEY, ENCRYPTION_SALT)   (per-deployment salt)
//
// The legacy enc:v1 format (hardcoded salt) was migrated to v2 and is no longer supported.
// A leftover enc:v1 value is NOT decrypted: it returns the DECRYPT_FAILED marker. To read an
// old pre-migration backup, restore it with the previous version of this file.
//
// BACK UP BOTH ENCRYPTION_KEY AND ENCRYPTION_SALT. Losing either one makes the data unrecoverable.
import 'dotenv/config'; // Ensures process.env is populated before this module evaluates
import crypto from 'crypto';

const CIPHER_ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96-bit IV recommended for GCM
const AUTH_TAG_LENGTH = 16;
const MIN_SALT_LENGTH = 16;
const LEGACY_SALT = 'valetudo-healthlink-v1'; // only used to reject it as a configured salt
const VERSION = 'v2';
const PREFIX = `enc:${VERSION}:`;
const DECRYPT_FAILED = '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';

const MASTER_KEY_RAW = process.env.ENCRYPTION_KEY;
if (!MASTER_KEY_RAW || MASTER_KEY_RAW.length < 32) {
  throw new Error(
    '[cryptoVault] ENCRYPTION_KEY is missing or shorter than 32 characters. ' +
    'Set a unique, random value in server/.env (generate with: openssl rand -hex 32). ' +
    'Refusing to start with a hard-coded fallback key.'
  );
}

const SALT_RAW = process.env.ENCRYPTION_SALT;
if (!SALT_RAW) {
  throw new Error(
    '[cryptoVault] ENCRYPTION_SALT is not set. It is required: all stored data is enc:v2. ' +
    'Use the same value this database was migrated with (do NOT generate a new one).'
  );
}
if (SALT_RAW.length < MIN_SALT_LENGTH) {
  throw new Error(
    `[cryptoVault] ENCRYPTION_SALT must be at least ${MIN_SALT_LENGTH} characters ` +
    '(generate with: openssl rand -hex 16).'
  );
}
if (SALT_RAW === LEGACY_SALT) {
  throw new Error('[cryptoVault] ENCRYPTION_SALT must not be the legacy hardcoded salt.');
}

// Derive a 32-byte key using scrypt (memory-hard) instead of single SHA-256 (S-04)
const KEY = crypto.scryptSync(MASTER_KEY_RAW, SALT_RAW, 32);

/**
 * Encrypts sensitive clinical plain text using AES-256-GCM
 * Output format: enc:v2:<iv_hex>:<tag_hex>:<ciphertext_hex>
 */
export function encrypt(plainText) {
  // Fix B-05: return explicit null, never undefined
  if (plainText === null || plainText === undefined) return null;
  const stringVal = String(plainText);
  if (!stringVal.trim()) return '';

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, KEY, iv);

    let encrypted = cipher.update(stringVal, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (error) {
    console.error('[AES-256 Encryption Error]:', error);
    throw new Error('Failed to encrypt medical field.');
  }
}

/** True if the value is vault ciphertext (enc:v2). */
export const isEncryptedValue = (value) => typeof value === 'string' && value.startsWith(PREFIX);

/**
 * Decrypts AES-256-GCM ciphertext (enc:v2).
 *  - null/undefined are returned as-is
 *  - values without an enc: prefix are returned unchanged (seed/legacy plaintext fallback)
 *  - enc:v1 or any other enc: version returns the DECRYPT_FAILED marker
 */
export function decrypt(cipherText) {
  if (cipherText === null || cipherText === undefined) return cipherText;
  const stringVal = String(cipherText);

  // Not vault ciphertext at all: return as-is (plaintext fallback)
  if (!stringVal.startsWith('enc:')) return stringVal;

  if (!stringVal.startsWith(PREFIX)) {
    console.error('[AES-256 Decryption Error]: unsupported envelope version (legacy enc:v1 is no longer supported)');
    return DECRYPT_FAILED;
  }

  try {
    const parts = stringVal.split(':');
    if (parts.length !== 5) {
      console.error('[AES-256 Decryption Error]: malformed envelope');
      return DECRYPT_FAILED;
    }

    const iv = Buffer.from(parts[2], 'hex');
    const authTag = Buffer.from(parts[3], 'hex');
    const encryptedText = parts[4];

    // S-04: Validate IV and AuthTag lengths to avoid unhandled open failures
    if (iv.length !== IV_LENGTH || authTag.length !== AUTH_TAG_LENGTH) {
      console.error('[AES-256 Decryption Error]: malformed envelope');
      return DECRYPT_FAILED;
    }

    const decipher = crypto.createDecipheriv(CIPHER_ALGORITHM, KEY, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (error) {
    console.error('[AES-256 Decryption Error]:', error.message);
    return DECRYPT_FAILED;
  }
}