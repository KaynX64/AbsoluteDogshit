// Records protected health information access in the dedicated read-access ledger.
// server/src/utils/phiLogger.js
import { pool } from '../db/pool.js';

/**
 * Logs read/view access of Protected Health Information (PHI).
 *
 * `patientUserId` is nullable in the schema so bulk/system reads
 * (offline sync bootstrap, admin DB Studio paging, etc.) can still
 * be audited without violating the fk_phi_patient FK. Any falsy or
 * non-positive value is coerced to NULL here so callers can pass 0,
 * undefined, or omit the field entirely without crashing.
 */
export async function logPhiAccess({
  viewerUserId,
  patientUserId,
  table,
  recordId,
  purpose,
  ipAddress,
}) {
  const patientRef =
    patientUserId === null ||
    patientUserId === undefined ||
    Number.isNaN(Number(patientUserId)) ||
    Number(patientUserId) <= 0
      ? null
      : Number(patientUserId);

  // ── SEC-03 hardening: surface incomplete audit payloads loudly ──
  // `table_affected` and `record_id` are NOT NULL in PHI_ACCESS_LOGS with no
  // fallback in this utility. A caller that omits them makes the INSERT below
  // fail with ER_BAD_NULL_ERROR — previously visible only as a generic
  // console error, so the lost statutory audit entry went unnoticed (SEC-03).
  // This pre-flight diagnostic names the missing fields so future call-site
  // regressions are immediately identifiable. Behavior is unchanged: the
  // INSERT is still attempted exactly as before. (recordId: 0 is legal — bulk
  // reads — so only null/undefined/'' are treated as missing.)
  if (
    table === null ||
    table === undefined ||
    table === '' ||
    recordId === null ||
    recordId === undefined
  ) {
    console.error(
      `[PHI Logger]: mandatory audit field(s) missing — table=${table ?? 'MISSING'}, ` +
        `recordId=${recordId === undefined ? 'MISSING' : recordId}. ` +
        'INSERT into PHI_ACCESS_LOGS will be rejected (NOT NULL) and the statutory ' +
        'audit entry will be LOST. Fix the calling code. (SEC-03)'
    );
  }

  try {
    await pool.query(
      `INSERT INTO PHI_ACCESS_LOGS 
       (user_id, patient_user_id, table_affected, record_id, purpose, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        viewerUserId,
        patientRef,
        table,
        recordId,
        purpose || 'Clinical Review',
        ipAddress || 'Unknown',
      ]
    );
  } catch (err) {
    console.error('[PHI Logger Error]:', err.message);
  }
}