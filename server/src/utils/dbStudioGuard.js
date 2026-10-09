// server/src/utils/dbStudioGuard.js
//
// Pure helpers for the Admin "Database Studio" (Audit Issue #3).
// Kept free of DB access so they can be unit-tested (see server/tests/dbStudioGuard.test.js).
import crypto from 'crypto';
import { encrypt, decrypt } from './cryptoVault.js';

export const REDACTED = '[REDACTED]';
export const DECRYPT_FAILED_MARKER = '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';

// Tables DB Studio may display but never modify. AUDIT_LOGS / PHI_ACCESS_LOGS are the
// statutory ledgers; INVENTORY_LOGS is the immutable stock-movement trail (see ERD §3.5).
export const READ_ONLY_TABLES = ['AUDIT_LOGS', 'PHI_ACCESS_LOGS', 'INVENTORY_LOGS'];

// Columns the application stores as AES-256-GCM ciphertext (enc:v1:...) via cryptoVault.
// Keep in sync with every encrypt() call site in server/src/routes/*.
export const ENCRYPTED_COLUMNS = {
  EMR_RECORDS: ['chief_complaint', 'diagnosis', 'treatment_plan', 'notes'],
  HEALTH_PROFILES: ['allergies', 'chronic_conditions'],
  PRESCRIPTIONS: ['notes'],
  PRESCRIPTION_ITEMS: ['instructions'],
  DENTAL_CHARTS: ['chart_data'],
};

// Columns that must hold a bcrypt hash and are never displayed in DB Studio.
export const SECRET_COLUMNS = {
  USERS: ['password_hash'],
};

// How to find "whose record is this?" for PHI read-logging when browsing a table.
//   { col }            -> the row itself carries the patient's user_id in `col`
//   { col, via }       -> the row only has a parent key; resolve the patient through `via`
export const PHI_PATIENT_SOURCE = {
  USERS: { col: 'user_id' },
  STUDENT_PROFILES: { col: 'user_id' },
  FACULTY_PROFILES: { col: 'user_id' },
  HEALTH_PROFILES: { col: 'user_id' },
  CONSENT_RECORDS: { col: 'user_id' },
  MEDICAL_CLEARANCES: { col: 'user_id' },
  EMERGENCY_ALERTS: { col: 'user_id' },
  APPOINTMENTS: { col: 'patient_user_id' },
  QUEUE: { col: 'patient_user_id' },
  EMR_RECORDS: { col: 'patient_user_id' },
  DENTAL_CHARTS: { col: 'patient_user_id' },
  PRESCRIPTIONS: { col: 'patient_user_id' },
  VITAL_SIGNS: { col: 'emr_id', via: { table: 'EMR_RECORDS', key: 'emr_id', patient: 'patient_user_id' } },
  EMR_ATTACHMENTS: { col: 'emr_id', via: { table: 'EMR_RECORDS', key: 'emr_id', patient: 'patient_user_id' } },
  PRESCRIPTION_ITEMS: {
    col: 'prescription_id',
    via: { table: 'PRESCRIPTIONS', key: 'prescription_id', patient: 'patient_user_id' },
  },
};

const BCRYPT_RE = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;
const CIPHERTEXT_RE = /^enc:v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/;

export const isReadOnlyTable = (table) => READ_ONLY_TABLES.includes(table);
export const isEncryptedCol = (table, col) => (ENCRYPTED_COLUMNS[table] || []).includes(col);
export const isSecretCol = (table, col) => (SECRET_COLUMNS[table] || []).includes(col);
export const phiPatientSource = (table) => PHI_PATIENT_SOURCE[table] || null;

export function readOnlyMessage(table) {
  return `Statutory compliance violation: ${table} is an append-only ledger and cannot be modified from DB Studio.`;
}

export function fail(message, status = 400) {
  const err = new Error(message);
  err.status = status;
  return err;
}

export function isValidCiphertext(value) {
  return typeof value === 'string' && CIPHERTEXT_RE.test(value) && decrypt(value) !== DECRYPT_FAILED_MARKER;
}

// Makes any DB value comparable / loggable as a plain string (or null).
export function normalizeValue(v) {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString('hex');
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

// Secrets are shown as [REDACTED]. Encrypted columns are already ciphertext in the DB.
export function maskRowForDisplay(table, row) {
  const out = { ...row };
  for (const col of SECRET_COLUMNS[table] || []) {
    if (out[col] !== null && out[col] !== undefined) out[col] = REDACTED;
  }
  return out;
}

// ─── Audit fingerprints ──────────────────────────────────────────────────────
// Protected values are never written to AUDIT_LOGS. Instead we log a keyed HMAC
// fingerprint of the PLAINTEXT (ciphertext can't be used: GCM uses a random IV, so the
// same plaintext encrypts differently every time). Reviewers can then see that a field
// changed, and whether two entries hold the same value, without learning the value.
// The key is domain-separated from the encryption key; set AUDIT_FINGERPRINT_KEY to
// override it.
let fingerprintKey = null;
function getFingerprintKey() {
  if (!fingerprintKey) {
    const base = process.env.AUDIT_FINGERPRINT_KEY || process.env.ENCRYPTION_KEY;
    if (!base) throw new Error('[dbStudioGuard] ENCRYPTION_KEY (or AUDIT_FINGERPRINT_KEY) is not set.');
    fingerprintKey = crypto.createHmac('sha256', base).update('db-studio-audit-fingerprint-v1').digest();
  }
  return fingerprintKey;
}

export function fingerprint(plain) {
  return crypto.createHmac('sha256', getFingerprintKey()).update(String(plain)).digest('hex').slice(0, 16);
}

// Value as written to AUDIT_LOGS: never plaintext PHI, ciphertext, or raw hashes.
export function auditSafe(table, col, value) {
  if (isEncryptedCol(table, col) || isSecretCol(table, col)) {
    if (value === null || value === undefined || value === '') return null;
    const plain = isEncryptedCol(table, col) ? decrypt(value) : String(value);
    if (plain === DECRYPT_FAILED_MARKER) return '[PROTECTED unreadable]';
    return `[PROTECTED fp:${fingerprint(plain)}]`;
  }
  const v = normalizeValue(value);
  return typeof v === 'string' && v.length > 500 ? `${v.slice(0, 500)}…` : v;
}

// ─── Request validation ──────────────────────────────────────────────────────
export function assertKnownColumns(keys, names) {
  const unknown = keys.filter((k) => !names.has(k));
  if (unknown.length > 0) throw fail(`Unknown column(s): ${unknown.join(', ')}`);
}

// The key must be exactly the table's primary-key columns, so a request can never
// match (and change) more than one row.
export function assertPrimaryKey(primaryKey, pk) {
  if (pk.length === 0) throw fail('This table has no primary key; row edits are not allowed.');
  const keys = Object.keys(primaryKey);
  if (keys.length !== pk.length || !pk.every((c) => keys.includes(c))) {
    throw fail(`primaryKey must contain exactly: ${pk.join(', ')}`);
  }
}

// Returns the values that will actually be written.
//  - plaintext for an encrypted column is encrypted here (never stored as plaintext)
//  - ciphertext must be well-formed and pass GCM authentication
//  - password_hash must be a bcrypt hash; the masked placeholder is ignored
export function protectValues(table, values) {
  const out = {};
  for (const [col, val] of Object.entries(values)) {
    if (isSecretCol(table, col)) {
      if (val === REDACTED) continue;
      if (typeof val !== 'string' || !BCRYPT_RE.test(val)) {
        throw fail(`${table}.${col} only accepts a bcrypt hash. Use User Management to reset passwords.`);
      }
      out[col] = val;
    } else if (isEncryptedCol(table, col)) {
      if (val === null || val === '') {
        out[col] = val;
      } else if (typeof val === 'string' && val.startsWith('enc:v1:')) {
        if (!isValidCiphertext(val)) throw fail(`${table}.${col} contains malformed or tampered ciphertext.`);
        out[col] = val;
      } else {
        out[col] = encrypt(typeof val === 'object' ? JSON.stringify(val) : val);
      }
    } else {
      out[col] = val;
    }
  }
  return out;
}

// ─── Offline-sync / retention rules ──────────────────────────────────────────
// Tables with a `deleted_at` tombstone are soft-deleted so (a) clinical records keep
// their retention trail and (b) the deletion propagates to offline Electron clients.
export function planDelete(names) {
  return names.has('deleted_at') ? 'soft' : 'hard';
}

// Sync tables carry a `version` used for conflict detection. Any admin edit must bump it,
// unless the admin is explicitly setting `version` themselves.
export function shouldBumpVersion(names, writeData) {
  return names.has('version') && !Object.prototype.hasOwnProperty.call(writeData, 'version');
}