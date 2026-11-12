import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { generateAndStoreIncidentReportPDF } from '../../../documents/documentService.js';
import { requireResponderAccess, getResponderAudience, roleLabelFor } from '../../../utils/responderAccess.js';

export function registerIncidentWorkflowRoutes(router, io) {
  // ===========================================================================
  // 3a. GET /api/emergency/incident-reports/pending
  // Resolved alerts (last 24h) that still need a console operator's incident
  // report. Consoles call this on mount so the documentation popup still
  // appears when the status_change event fired while nobody was connected.
  // ===========================================================================
  router.get('/incident-reports/pending', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const [pending] = await pool.query(
        `SELECT a.alert_id, a.status, a.created_at, a.resolved_at, a.notes,
                CONCAT(u.first_name, ' ', u.last_name) AS patient_name,
                u.phone,
                COALESCE((SELECT r.code FROM USER_ROLES ur
                          INNER JOIN ROLES r ON ur.role_id = r.role_id
                          WHERE ur.user_id = u.user_id LIMIT 1), 'STUDENT') AS primary_role,
                COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Member') AS identifier_no
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         WHERE a.status = 'resolved'
           AND a.resolved_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND NOT EXISTS (SELECT 1 FROM INCIDENT_REPORTS ir WHERE ir.alert_id = a.alert_id)
         ORDER BY a.resolved_at DESC`
      );

      res.json(
        pending.map((p) => ({
          alertId: Number(p.alert_id),
          status: p.status,
          createdAt: new Date(p.created_at).toISOString(),
          resolvedAt: p.resolved_at ? new Date(p.resolved_at).toISOString() : null,
          notes: p.notes,
          patientName: p.patient_name,
          studentNo: p.identifier_no,
          phone: p.phone,
          roleLabel: roleLabelFor(p.primary_role),
        }))
      );
    } catch (error) {
      console.error('[Pending Incident Reports Error]:', error);
      res.status(500).json({ error: 'Failed to fetch pending incident reports.' });
    }
  });

  // ===========================================================================
  // 3b. GET /api/emergency/:alertId/incident-report
  // Pre-fill payload for the desktop console documentation popup: patient
  // identity (name, ID number, contact number) fetched live from the server,
  // plus the alert timeline and any already-filed report.
  // ===========================================================================
  router.get('/:alertId/incident-report', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const { alertId } = req.params;

      const [alertRows] = await pool.query(
        `SELECT a.alert_id, a.user_id, a.status, a.created_at, a.resolved_at, a.notes,
                a.latitude, a.longitude,
                CONCAT(u.first_name, ' ', u.last_name) AS patient_name,
                u.phone,
                COALESCE((SELECT r.code FROM USER_ROLES ur
                          INNER JOIN ROLES r ON ur.role_id = r.role_id
                          WHERE ur.user_id = u.user_id LIMIT 1), 'STUDENT') AS primary_role,
                COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Member') AS identifier_no,
                COALESCE((SELECT sp.course FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.department FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.department FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.department FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Lingayen') AS affiliation
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         WHERE a.alert_id = ?`,
        [alertId]
      );

      if (alertRows.length === 0) {
        return res.status(404).json({ error: 'Alert not found.' });
      }

      const [reportRows] = await pool.query(
        `SELECT ir.report_id, ir.alert_id, ir.resolved_at, ir.incident_details,
                ir.treatment_notes, ir.created_at,
                CONCAT(du.first_name, ' ', du.last_name) AS documented_by_name
         FROM INCIDENT_REPORTS ir
         JOIN USERS du ON ir.documented_by = du.user_id
         WHERE ir.alert_id = ?`,
        [alertId]
      );

      const a = alertRows[0];
      const report = reportRows.length > 0
        ? {
            reportId: Number(reportRows[0].report_id),
            resolvedAt: new Date(reportRows[0].resolved_at).toISOString(),
            incidentDetails: reportRows[0].incident_details,
            treatmentNotes: reportRows[0].treatment_notes,
            documentedByName: reportRows[0].documented_by_name,
            createdAt: new Date(reportRows[0].created_at).toISOString(),
          }
        : null;

      res.json({
        patient: {
          userId: Number(a.user_id),
          name: a.patient_name,
          studentNo: a.identifier_no,
          phone: a.phone,
          roleLabel: roleLabelFor(a.primary_role),
          affiliation: a.affiliation,
        },
        alert: {
          alertId: Number(a.alert_id),
          status: a.status,
          createdAt: new Date(a.created_at).toISOString(),
          resolvedAt: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
          notes: a.notes,
          latitude: a.latitude !== null ? Number(a.latitude) : null,
          longitude: a.longitude !== null ? Number(a.longitude) : null,
        },
        report,
      });
    } catch (error) {
      console.error('[Incident Report Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to fetch incident report data.' });
    }
  });

  // ===========================================================================
  // 3c. POST /api/emergency/:alertId/incident-report
  // File the post-resolution documentation typed into the desktop console
  // popup. One report per alert (UNIQUE alert_id) — the first console to
  // submit wins; others are told it is already documented.
  // ===========================================================================
  router.post('/:alertId/incident-report', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const { alertId } = req.params;
      const responderId = req.user.user_id;
      const raw = req.body || {};

      const incidentDetails = typeof raw.incident_details === 'string' ? raw.incident_details.trim() : '';
      if (incidentDetails.length < 5 || incidentDetails.length > 4000) {
        return res.status(400).json({ error: 'Incident details must be between 5 and 4000 characters.' });
      }

      let treatmentNotes = null;
      if (raw.treatment_notes !== undefined && raw.treatment_notes !== null && String(raw.treatment_notes).trim() !== '') {
        treatmentNotes = String(raw.treatment_notes).trim();
        if (treatmentNotes.length > 4000) {
          return res.status(400).json({ error: 'Treatment notes must be 4000 characters or fewer.' });
        }
      }

      const [alertRows] = await pool.query(
        'SELECT user_id, status, created_at, resolved_at FROM EMERGENCY_ALERTS WHERE alert_id = ?',
        [alertId]
      );
      if (alertRows.length === 0) {
        return res.status(404).json({ error: 'Alert not found.' });
      }
      if (alertRows[0].status !== 'resolved') {
        return res.status(409).json({
          error: `Incident reports are filed for resolved incidents only (current status: ${alertRows[0].status}).`,
          code: 'ALERT_NOT_RESOLVED',
        });
      }

      // Date & time the incident was resolved. The popup pre-fills this from
      // the stored resolved_at; the operator may correct it, bounded by the
      // alert lifetime (never before it was triggered, never in the future).
      let resolvedAt;
      if (raw.resolved_at === undefined || raw.resolved_at === null || String(raw.resolved_at).trim() === '') {
        resolvedAt = new Date(alertRows[0].resolved_at);
      } else {
        resolvedAt = new Date(String(raw.resolved_at));
      }
      if (isNaN(resolvedAt.getTime())) {
        return res.status(400).json({ error: 'Invalid resolved_at — provide an ISO 8601 date-time.' });
      }
      if (resolvedAt.getTime() < new Date(alertRows[0].created_at).getTime() - 60000) {
        return res.status(400).json({ error: 'resolved_at cannot be before the alert was triggered.' });
      }
      if (resolvedAt.getTime() > Date.now() + 5 * 60 * 1000) {
        return res.status(400).json({ error: 'resolved_at cannot be in the future.' });
      }

      const connection = await pool.getConnection();
      let reportId;
      try {
        await connection.beginTransaction();

        const [insertResult] = await connection.query(
          `INSERT INTO INCIDENT_REPORTS (alert_id, patient_user_id, resolved_at, incident_details, treatment_notes, documented_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [alertId, alertRows[0].user_id, resolvedAt, incidentDetails, treatmentNotes, responderId]
        );
        reportId = insertResult.insertId;

        await logAudit(connection, {
          userId: responderId,
          action: 'CREATE',
          table: 'INCIDENT_REPORTS',
          recordId: Number(reportId),
          oldValue: null,
          newValue: {
            operation: 'SOS_INCIDENT_REPORT',
            alertId: Number(alertId),
            patientUserId: Number(alertRows[0].user_id),
            resolvedAt: resolvedAt.toISOString(),
          },
          ipAddress: req.ip,
        });

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        // UNIQUE(alert_id): another console filed the report first.
        if (err && err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            error: 'This incident has already been documented by another console.',
            code: 'REPORT_ALREADY_FILED',
          });
        }
        throw err;
      } finally {
        connection.release();
      }

      // Tell every connected console the documentation is in — popups for
      // this alert dismiss themselves instead of asking for a second report.
      if (io) {
        const [authorRows] = await pool.query(
          'SELECT CONCAT(first_name, " ", last_name) AS full_name FROM USERS WHERE user_id = ?',
          [responderId]
        ).catch(() => [[]]);
        const documentedByName =
          Array.isArray(authorRows) && authorRows.length > 0 ? authorRows[0].full_name : null;
        const audience = await getResponderAudience({}).catch(() => []);
        for (const recipient of audience) {
          io.to(`user:${recipient.userId}`).emit('emergency:incident_reported', {
            alertId: Number(alertId),
            reportId: Number(reportId),
            documentedBy: Number(responderId),
            documentedByName,
          });
        }
      }

      // Asynchronously generate PDF and upload to MinIO file server
      generateAndStoreIncidentReportPDF(reportId).catch((err) => {
        console.error(`[Incident Report PDF Generation] Report #${reportId} failed:`, err.message);
      });

      res.status(201).json({
        message: 'Incident report filed.',
        reportId: Number(reportId),
      });
    } catch (error) {
      console.error('[Incident Report Save Error]:', error);
      res.status(500).json({ error: 'Failed to save the incident report.' });
    }
  });
}
