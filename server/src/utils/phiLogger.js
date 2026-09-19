// server/src/utils/phiLogger.js
import { pool } from '../db.js';

/**
 * Logs read/view access of Protected Health Information (PHI)
 */
export async function logPhiAccess({ viewerUserId, patientUserId, table, recordId, purpose, ipAddress }) {
  try {
    await pool.query(
      `INSERT INTO PHI_ACCESS_LOGS 
       (user_id, patient_user_id, table_affected, record_id, purpose, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [viewerUserId, patientUserId, table, recordId, purpose || 'Clinical Review', ipAddress || 'Unknown']
    );
  } catch (err) {
    console.error('[PHI Logger Error]:', err.message);
  }
}