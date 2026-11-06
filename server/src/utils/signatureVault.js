// server/src/utils/signatureVault.js
//
// Stores each doctor's/dentist's handwritten signature as an IMMUTABLE,
// content-addressed PNG in MinIO:  signatures/user-{id}-{sha12}.png
//
// Re-enrolling never overwrites an old file. STAFF_PROFILES.signature_s3_key
// just points at the newest one, and every signed document freezes the key it
// used inside signature_metadata, so old PDFs keep their original signature.

import crypto from 'crypto';
import { uploadToS3, getBufferFromS3 } from './s3Vault.js';

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
export const MAX_SIGNATURE_BYTES = 300 * 1024; // client sends ~10-40 KB
const MAX_W = 1200;
const MAX_H = 600;

export class SignatureError extends Error {
  constructor(message, status = 400, code = 'INVALID_SIGNATURE') {
    super(message);
    this.name = 'SignatureError';
    this.status = status;
    this.code = code;
  }
}

// Cheap structural check (no image library): magic bytes + IHDR fields.
export function validateSignaturePng(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 33) {
    throw new SignatureError('Signature image is missing or empty.');
  }
  if (buf.length > MAX_SIGNATURE_BYTES) {
    throw new SignatureError('Signature image is too large.', 413, 'SIGNATURE_TOO_LARGE');
  }
  if (!buf.subarray(0, 8).equals(PNG_MAGIC)) {
    throw new SignatureError('Signature must be a PNG image.');
  }
  if (buf.subarray(12, 16).toString('ascii') !== 'IHDR') {
    throw new SignatureError('Malformed PNG.');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const colorType = buf.readUInt8(25);
  if (width < 40 || height < 20 || width > MAX_W || height > MAX_H) {
    throw new SignatureError(`Signature dimensions must be between 40x20 and ${MAX_W}x${MAX_H}.`);
  }
  // 6 = RGBA, 4 = grayscale+alpha. Anything else has no transparency,
  // which would stamp a white box over the PDF.
  if (colorType !== 6 && colorType !== 4) {
    throw new SignatureError('Signature PNG must have a transparent background.');
  }
  return { width, height };
}

export async function storeSignature(userId, buf) {
  const dims = validateSignaturePng(buf);
  const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
  const key = `signatures/user-${userId}-${sha256.slice(0, 12)}.png`;
  await uploadToS3({ buffer: buf, key, mimeType: 'image/png' });
  return { key, sha256, ...dims };
}

// Returns a Buffer, or null if the key is empty / the object is gone.
// Never throws, so a missing signature can't block PDF generation.
export async function loadSignature(key) {
  if (!key) return null;
  try {
    return await getBufferFromS3(key);
  } catch (err) {
    console.warn(`⚠️ [Signature] Could not load ${key}: ${err.message}`);
    return null;
  }
}