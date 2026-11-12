import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { isCalendarDate } from '../../config/appointmentRules.js';
import { stripLegacyOdontogram, readDentalChart } from './clinicalHistory.js';

export function registerPatientHistoryRoutes(router) {
  // ===========================================================================
  // 8. PATIENT EMR HISTORY & SEARCH DIRECTORY
  // ===========================================================================

  router.get('/patient/:patientId/history', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), requirePrivacyConsent, async (req, res) => {
    const patientId = Number(req.params.patientId);
    const canViewDental = (req.user.roles || []).includes('DENTIST');
    const { limit, before, view } = req.query;
    if (!Number.isSafeInteger(patientId) || patientId < 1) {
      return res.status(400).json({ error: 'Supply a valid patient ID.' });
    }
    const pageSize = limit === undefined ? null : Number(limit);
    const cursor = typeof before === 'string'
      ? /^([1-9]\d{3}-\d{2}-\d{2} (?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d),([1-9]\d{0,18})$/.exec(before)
      : null;
    if (limit !== undefined && (typeof limit !== 'string' || !/^\d{1,2}$/.test(limit) || pageSize < 1 || pageSize > 50)) {
      return res.status(400).json({ error: 'limit must be an integer from 1 to 50.' });
    }
    if (before !== undefined && (!pageSize || !cursor || !isCalendarDate(cursor[1].slice(0, 10)))) {
      return res.status(400).json({ error: 'Use a valid history cursor with a page limit.' });
    }

    try {
      if (view === 'attachments') {
        const [attachments] = await pool.query(
          `SELECT a.attachment_id, a.file_name, a.file_size, a.mime_type, e.encounter_date
           FROM EMR_RECORDS e
           JOIN EMR_ATTACHMENTS a ON a.emr_id = e.emr_id
           WHERE e.patient_user_id = ? AND e.deleted_at IS NULL AND a.deleted_at IS NULL
           ORDER BY e.encounter_date DESC, e.emr_id DESC, a.attachment_id`,
          [patientId]
        );
        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: patientId,
          table: 'EMR_ATTACHMENTS',
          recordId: patientId,
          purpose: 'Prior Diagnostic Records Review',
          ipAddress: req.ip,
        });
        return res.json(attachments);
      }

      const params = [patientId];
      if (cursor) params.push(cursor[1], cursor[1], cursor[2]);
      if (pageSize) params.push(pageSize + 1);
      const [emrs] = await pool.query(
        `SELECT e.emr_id, e.encounter_date, e.chief_complaint, e.diagnosis, e.treatment_plan, e.notes,
                doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
                COALESCE(sp.license_no, 'PRC-VERIFIED') AS doctor_license,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
                ${canViewDental ? ', dc.chart_data' : ''}
                ${pageSize ? ", CONCAT(e.encounter_date, ',', e.emr_id) AS history_cursor" : ''}
         FROM EMR_RECORDS e
         JOIN USERS doc ON e.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         ${canViewDental ? 'LEFT JOIN DENTAL_CHARTS dc ON dc.emr_id = e.emr_id' : ''}
         WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
         ${cursor ? 'AND (e.encounter_date < ? OR (e.encounter_date = ? AND e.emr_id < CAST(? AS UNSIGNED)))' : ''}
         ORDER BY e.encounter_date DESC, e.emr_id DESC
         ${pageSize ? 'LIMIT ?' : ''}`,
        params
      );

      const hasMore = pageSize !== null && emrs.length > pageSize;
      if (hasMore) emrs.pop();
      const nextCursor = hasMore ? emrs.at(-1).history_cursor : null;
      const history = new Map(emrs.map(({ chart_data, history_cursor, ...emr }) => [emr.emr_id, {
        ...emr,
        chief_complaint: decrypt(emr.chief_complaint) || '',
        diagnosis: decrypt(emr.diagnosis) || '',
        treatment_plan: stripLegacyOdontogram(decrypt(emr.treatment_plan)),
        notes: decrypt(emr.notes) || '',
        dental_chart: canViewDental ? readDentalChart(chart_data) : null,
        vitals: [],
        attachments: [],
        prescriptions: [],
      }]));

      if (history.size) {
        const ids = [...history.keys()];
        const [vitals] = await pool.query('SELECT emr_id, metric, value, unit FROM VITAL_SIGNS WHERE emr_id IN (?)', [ids]);
        const [attachments] = await pool.query(
          'SELECT emr_id, attachment_id, file_name, file_size, mime_type FROM EMR_ATTACHMENTS WHERE emr_id IN (?)',
          [ids]
        );
        const [prescriptions] = await pool.query(
          'SELECT emr_id, prescription_id, status, notes FROM PRESCRIPTIONS WHERE emr_id IN (?)',
          [ids]
        );
        for (const { emr_id, ...vital } of vitals) history.get(emr_id).vitals.push(vital);
        for (const { emr_id, ...attachment } of attachments) history.get(emr_id).attachments.push(attachment);
        for (const { emr_id, ...rx } of prescriptions) {
          history.get(emr_id).prescriptions.push({ ...rx, notes: decrypt(rx.notes) || '' });
        }
      }

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: patientId,
        table: 'EMR_RECORDS',
        recordId: patientId,
        purpose: 'Clinical Encounter History Review',
        ipAddress: req.ip,
      });

      const records = [...history.values()];
      res.json(pageSize ? { records, nextCursor } : records);
    } catch (error) {
      console.error('[Appointments] Error fetching patient history:', error.code || error.name);
      res.status(500).json({ error: 'Failed to retrieve patient medical history.' });
    }
  });

  router.get('/patients/search', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'), async (req, res) => {
    const rawQuery = req.query.query ? String(req.query.query).trim() : '';
    if (!rawQuery) return res.json([]);

    const queryPattern = `%${rawQuery}%`;

    try {
      const [rows] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email, u.phone,
                COALESCE(sp.student_no, st.license_no, fp.position, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, st.department, fp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies
         FROM USERS u
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.deleted_at IS NULL
           AND (
             sp.student_no LIKE ? OR
             u.first_name LIKE ? OR
             u.last_name LIKE ? OR
             u.email LIKE ? OR
             CONCAT(u.first_name, ' ', u.last_name) LIKE ?
           )
         ORDER BY u.last_name ASC
         LIMIT 30`,
        [queryPattern, queryPattern, queryPattern, queryPattern, queryPattern]
      );

      const decrypted = rows.map((p) => ({
        ...p,
        allergies: decrypt(p.allergies) || 'None reported',
      }));

      res.json(decrypted);
    } catch (error) {
      console.error('[Appointments] Patient search error:', error);
      res.status(500).json({ error: 'Patient search failed.' });
    }
  });
}
