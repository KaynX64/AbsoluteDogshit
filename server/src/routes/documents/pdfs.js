import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { getBufferFromS3 } from '../../utils/s3Vault.js';
import {
  generateAndStorePrescriptionPDF,
  generateAndStoreClearancePDF,
  generateAndStoreIncidentReportPDF,
} from '../../documents/documentService.js';
import { logPhiAccess } from '../../utils/phiLogger.js';

export function registerPdfRoutes(router) {
  // =============================================================================
  // 7. SIGNED PDF DOWNLOADS
  // =============================================================================

  // GET /api/documents/prescriptions/:id/pdf
  router.get('/prescriptions/:id/pdf', authenticateToken, async (req, res) => {
    const prescriptionId = Number(req.params.id);
    if (!prescriptionId) return res.status(400).json({ error: 'Invalid prescription id.' });

    try {
      const [rows] = await pool.query(
        `SELECT prescription_id, patient_user_id, doctor_user_id, pdf_s3_key, qr_token
         FROM PRESCRIPTIONS
         WHERE prescription_id = ? AND deleted_at IS NULL`,
        [prescriptionId]
      );

      if (rows.length === 0) return res.status(404).json({ error: 'Prescription not found.' });
      const rx = rows[0];

      const roles = req.user.roles || [];
      const isOwner = Number(req.user.user_id) === Number(rx.patient_user_id);
      const isIssuer = Number(req.user.user_id) === Number(rx.doctor_user_id);
      const isAdmin = roles.includes('ADMIN');

      // Only the patient, the doctor/dentist who issued it, or an admin.
      if (!isOwner && !isIssuer && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to access this document.' });
      }

      let key = rx.pdf_s3_key;
      if (!key) {
        key = await generateAndStorePrescriptionPDF(prescriptionId);
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
        patientUserId: rx.patient_user_id,
        table: 'PRESCRIPTIONS',
        recordId: prescriptionId,
        purpose: 'Prescription PDF download',
        ipAddress: req.ip,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="prescription-${prescriptionId}.pdf"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('[Prescription PDF Download Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve prescription PDF.' });
    }
  });

  // GET /api/documents/clearances/:id/pdf
  router.get('/clearances/:id/pdf', authenticateToken, async (req, res) => {
    const clearanceId = Number(req.params.id);
    if (!clearanceId) return res.status(400).json({ error: 'Invalid clearance id.' });

    try {
      const [rows] = await pool.query(
        `SELECT clearance_id, user_id, issued_by, pdf_s3_key, status
         FROM MEDICAL_CLEARANCES
         WHERE clearance_id = ? AND deleted_at IS NULL`,
        [clearanceId]
      );

      if (rows.length === 0) return res.status(404).json({ error: 'Clearance not found.' });
      const clr = rows[0];

      const roles = req.user.roles || [];
      const isOwner = Number(req.user.user_id) === Number(clr.user_id);
      const isIssuer = Number(req.user.user_id) === Number(clr.issued_by);
      const isAdmin = roles.includes('ADMIN');

      // Only the patient, the doctor/dentist who issued it, or an admin.
      if (!isOwner && !isIssuer && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to access this document.' });
      }

      let key = clr.pdf_s3_key;
      if (!key) {
        key = await generateAndStoreClearancePDF(clearanceId);
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
        patientUserId: clr.user_id,
        table: 'MEDICAL_CLEARANCES',
        recordId: clearanceId,
        purpose: 'Clearance PDF download',
        ipAddress: req.ip,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="clearance-${clearanceId}.pdf"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('[Clearance PDF Download Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve clearance PDF.' });
    }
  });

  // GET /api/documents/incident-reports/:id/pdf
  router.get('/incident-reports/:id/pdf', authenticateToken, async (req, res) => {
    const reportId = Number(req.params.id);
    if (!reportId) return res.status(400).json({ error: 'Invalid incident report id.' });

    try {
      const [rows] = await pool.query(
        'SELECT report_id, alert_id, patient_user_id, documented_by, pdf_s3_key FROM INCIDENT_REPORTS WHERE report_id = ?',
        [reportId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Incident report not found.' });
      const report = rows[0];

      const roles = req.user.roles || [];
      const isOwner = Number(req.user.user_id) === Number(report.patient_user_id);
      const isAdmin = roles.includes('ADMIN');

      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized to access this document.' });
      }

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
      console.error('[Incident Report PDF Download Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve incident report PDF.' });
    }
  });
}
