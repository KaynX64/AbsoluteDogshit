import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { logPhiAccess } from '../../utils/phiLogger.js';

export function registerSyncBootstrap(router) {
  /**
   * GET /api/sync/bootstrap
   * Pre-populates the Electron clinic workstation's embedded SQLite database.
   * Supports Delta Sync via the `lastSyncedAt` query parameter to minimize payload size.
   */
  router.get('/bootstrap', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    try {
      // 1. Parse optional delta sync timestamp
      const lastSyncedAt = req.query.lastSyncedAt ? new Date(req.query.lastSyncedAt) : null;

      // 2. Fetch active students & faculty (Always fetch full active roster as they rarely change)
      const [patients] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS student_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS course,
                sp.year_level, hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.sex, hp.date_of_birth
         FROM USERS u
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.is_active = TRUE AND u.deleted_at IS NULL
         LIMIT 500`
      );

      const decryptedPatients = patients.map((p) => ({
        ...p,
        allergies: decrypt(p.allergies) || 'None reported',
        chronic_conditions: decrypt(p.chronic_conditions) || 'None reported',
      }));

      // 3. Fetch EMR records (Delta Sync: only fetch records updated/created since last sync)
      let emrQuery = `
        SELECT e.emr_id, e.patient_user_id, e.doctor_user_id, e.encounter_date,
               e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes, e.version,
               CONCAT('Dr. ', d.first_name, ' ', d.last_name) AS doctor_name
        FROM EMR_RECORDS e
        JOIN USERS d ON e.doctor_user_id = d.user_id
        WHERE e.deleted_at IS NULL
      `;

      const queryParams = [];
      if (lastSyncedAt && !isNaN(lastSyncedAt.getTime())) {
        emrQuery += ` AND (e.encounter_date >= ? OR e.updated_at >= ?) `;
        queryParams.push(lastSyncedAt, lastSyncedAt);
      } else {
        // Fallback to 90 days if no timestamp provided (initial sync)
        emrQuery += ` AND e.encounter_date >= DATE_SUB(CURDATE(), INTERVAL 90 DAY) `;
      }

      emrQuery += ` ORDER BY e.encounter_date DESC LIMIT 500`;

      const [emrs] = await pool.query(emrQuery, queryParams);

      const decryptedEmrs = emrs.map((e) => ({
        ...e,
        chief_complaint: decrypt(e.chief_complaint) || '',
        diagnosis: decrypt(e.diagnosis) || '',
        treatment_plan: decrypt(e.treatment_plan) || '',
        notes: decrypt(e.notes) || '',
      }));

      // Statutory read log under R.A. 10173
      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: null,   // bulk read — not tied to a single patient
        table: 'EMR_RECORDS',
        recordId: 0,
        purpose: 'Clinic Workstation Offline Cache Bootstrap',
        ipAddress: req.ip,
      });

      // 4. Return data with server timestamp for the next delta sync
      res.json({
        patients: decryptedPatients,
        emrRecords: decryptedEmrs,
        serverTime: new Date().toISOString(), // Client saves this for the next request
        bootstrappedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[Sync Bootstrap Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve bootstrap cache.' });
    }
  });
}
