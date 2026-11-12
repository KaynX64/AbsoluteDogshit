import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { logPhiAccess } from '../../../utils/phiLogger.js';
import { generateAndStoreIncidentReportPDF } from '../../../documents/documentService.js';
import { getBufferFromS3 } from '../../../utils/s3Vault.js';
import { roleLabelFor } from '../../../utils/responderAccess.js';

export function registerIncidentArchiveRoutes(router) {
  // ===========================================================================
  // 3d. GET /api/emergency/incident-reports
  // Returns documented incident reports for resolved emergencies (ADMIN only).
  // ===========================================================================
  router.get('/incident-reports', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      let query = `
        SELECT ir.report_id, ir.alert_id, ir.resolved_at, ir.incident_details,
               ir.treatment_notes, ir.created_at, ir.pdf_s3_key,
               a.created_at AS alert_created_at, a.acknowledged_at, a.resolved_at AS alert_resolved_at,
               a.response_time_seconds, a.notes AS alert_notes,
               a.latitude, a.longitude,
               pt.user_id AS patient_user_id,
               CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
               pt.phone AS patient_phone,
               COALESCE((SELECT r.code FROM USER_ROLES ur
                         INNER JOIN ROLES r ON ur.role_id = r.role_id
                         WHERE ur.user_id = pt.user_id LIMIT 1), 'STUDENT') AS patient_role,
               COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                        (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                        (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                        (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                        'PSU Member') AS identifier_no,
               COALESCE((SELECT sp.course FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                        (SELECT fp.department FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                        (SELECT st.department FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                        (SELECT ntp.department FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                        'PSU Lingayen') AS patient_affiliation,
               CONCAT(du.first_name, ' ', du.last_name) AS documented_by_name,
               CONCAT(ru.first_name, ' ', ru.last_name) AS responder_name
        FROM INCIDENT_REPORTS ir
        JOIN EMERGENCY_ALERTS a ON ir.alert_id = a.alert_id
        JOIN USERS pt ON ir.patient_user_id = pt.user_id
        JOIN USERS du ON ir.documented_by = du.user_id
        LEFT JOIN USERS ru ON a.assigned_responder_id = ru.user_id
      `;

      const params = [];
      if (search) {
        query += `
          WHERE (
            pt.first_name LIKE ? OR pt.last_name LIKE ?
            OR CONCAT(pt.first_name, ' ', pt.last_name) LIKE ?
            OR ir.incident_details LIKE ?
            OR ir.treatment_notes LIKE ?
            OR ir.report_id = ?
            OR ir.alert_id = ?
          )
        `;
        const like = `%${search}%`;
        const num = Number(search) || 0;
        params.push(like, like, like, like, like, num, num);
      }

      query += ` ORDER BY ir.created_at DESC LIMIT 200`;

      const [rows] = await pool.query(query, params);

      res.json(
        rows.map((row) => ({
          reportId: Number(row.report_id),
          alertId: Number(row.alert_id),
          resolvedAt: new Date(row.resolved_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString(),
          incidentDetails: row.incident_details,
          treatmentNotes: row.treatment_notes,
          pdfAvailable: Boolean(row.pdf_s3_key),
          pdfS3Key: row.pdf_s3_key,
          patient: {
            userId: Number(row.patient_user_id),
            name: row.patient_name,
            studentNo: row.identifier_no,
            phone: row.patient_phone,
            roleLabel: roleLabelFor(row.patient_role),
            affiliation: row.patient_affiliation,
          },
          alert: {
            createdAt: new Date(row.alert_created_at).toISOString(),
            acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
            resolvedAt: row.alert_resolved_at ? new Date(row.alert_resolved_at).toISOString() : null,
            responseTimeSeconds: row.response_time_seconds,
            notes: row.alert_notes,
            latitude: row.latitude !== null ? Number(row.latitude) : null,
            longitude: row.longitude !== null ? Number(row.longitude) : null,
          },
          documentedByName: row.documented_by_name,
          responderName: row.responder_name,
        }))
      );
    } catch (error) {
      console.error('[Incident Records Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to fetch incident records.' });
    }
  });

  // ===========================================================================
  // 3e. GET /api/emergency/incident-reports/:reportId/pdf
  // Serves the official incident report PDF from MinIO (ADMIN only). Generates on-demand if null.
  // ===========================================================================
  router.get('/incident-reports/:reportId/pdf', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
    const reportId = Number(req.params.reportId);
    if (!reportId) return res.status(400).json({ error: 'Invalid report id.' });

    try {
      const [rows] = await pool.query(
        'SELECT report_id, alert_id, patient_user_id, pdf_s3_key FROM INCIDENT_REPORTS WHERE report_id = ?',
        [reportId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Incident report not found.' });
      const report = rows[0];

      let key = report.pdf_s3_key;
      if (!key) {
        key = await generateAndStoreIncidentReportPDF(reportId);
        if (!key) {
          return res.status(503).json({
            error: 'Document is being generated. Please try again shortly.',
            retryAfterSeconds: 5,
          });
        }
      }

      const buffer = await getBufferFromS3(key);

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: report.patient_user_id,
        table: 'INCIDENT_REPORTS',
        recordId: reportId,
        purpose: 'Incident Report PDF download / view',
        ipAddress: req.ip,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="incident-report-${reportId}.pdf"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('[Incident Report PDF Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve incident report PDF.' });
    }
  });
}
