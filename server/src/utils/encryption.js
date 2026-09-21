// server/src/utils/encryption.js
import crypto from 'crypto';
import 'dotenv/config'; // Ensure dotenv is loaded to read the key

const ALGORITHM = 'aes-256-gcm';
const rawKey = process.env.ENCRYPTION_KEY;

// 1. STRICT SECURITY ENFORCEMENT: Fail completely if the key is missing
if (!rawKey) {
  console.error("FATAL ERROR: ENCRYPTION_KEY is not defined in .env");
  console.error("Halting application to prevent unencrypted PHI storage fallback.");
  process.exit(1);
}

// 2. Format the key (expects a 64-character hex string in .env to make 32 bytes)
const ENCRYPTION_KEY = Buffer.from(rawKey, 'hex');

// 3. Ensure the key is exactly 32 bytes for AES-256
if (ENCRYPTION_KEY.length !== 32) {
  console.error("FATAL ERROR: ENCRYPTION_KEY must be exactly 64 hex characters (32 bytes).");
  process.exit(1);
}

export function encryptPHI(text) {
  if (!text || typeof text !== 'string') return text;
  
  const iv = crypto.randomBytes(12); // 96-bit IV for GCM
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  const authTag = cipher.getAuthTag().toString('hex');
  
  // Format: iv:authTag:encryptedText (Matches your database schema)
  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

export function decryptPHI(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) {
    return cipherText; // Return unencrypted raw fallback if unencrypted legacy data exists
  }

  try {
    const [ivHex, authTagHex, encryptedText] = cipherText.split(':');
    if (!ivHex || !authTagHex || !encryptedText) return cipherText;

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    console.error('[Crypto] Decryption failed:', error.message);
    return '[ENCRYPTED_PHI_RESTRICTED]';
  }
}