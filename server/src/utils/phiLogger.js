// server/src/utils/phiLogger.js
import { pool } from '../db.js';

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