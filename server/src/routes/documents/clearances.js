// Handles clearance issuance, patient and issuer history, and revocation.

import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { isCalendarDate } from '../../config/appointmentRules.js';
import { issueClearance, revokeClearance } from '../../documents/clearanceMutations.js';
import { parseMetadata } from './signatureMetadata.js';

function respondToClearanceError(res, error, message) {
  if (error.status) {
    return res.status(error.status).json({ error: error.message, code: error.code });
  }
  console.error('[Clearance Mutation Error]:', error.code ?? error.name);
  return res.status(500).json({ error: message });
}

export function registerClearanceRoutes(router) {
  // =============================================================================
  // 2. MEDICAL CLEARANCES
  // =============================================================================

  router.post('/clearances', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
    const { user_id, purpose: rawPurpose, expires_at, remarks: rawRemarks, appointment_id } = req.body;
    const purpose = typeof rawPurpose === 'string' ? rawPurpose.trim() : '';
    const remarks = typeof rawRemarks === 'string' ? rawRemarks.trim() : '';
    const issuerId = req.user.user_id;

    if (!user_id || !purpose || purpose.length > 100) {
      return res.status(400).json({ error: 'Select a patient and enter a purpose of at most 100 characters.' });
    }
    if (!isCalendarDate(expires_at)) {
      return res.status(400).json({ error: 'Enter a valid clearance expiry date.' });
    }
    if (!remarks) {
      return res.status(400).json({ error: 'Clinical remarks are required before a clearance can be signed.' });
    }

    try {
      const issued = await issueClearance({ user_id, appointment_id, purpose, remarks, expires_at, issuerId, ipAddress: req.ip });
      return res.status(201).json(issued);
    } catch (error) {
      return respondToClearanceError(res, error, 'Failed to issue medical clearance.');
    }
  });

  router.get('/clearances/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const userId = req.user.user_id;

      const [clearances] = await pool.query(
        `SELECT mc.clearance_id, mc.purpose, mc.status, mc.issued_at, mc.expires_at,
                mc.qr_token, mc.signature_metadata, mc.pdf_s3_key,
                doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
                COALESCE(sp.license_no, 'Not on file') AS doctor_license,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
         FROM MEDICAL_CLEARANCES mc
         JOIN USERS doc ON mc.issued_by = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE mc.user_id = ? AND mc.deleted_at IS NULL
         ORDER BY mc.issued_at DESC`,
        [userId]
      );

      res.json(clearances.map((row) => ({ ...row, pdfAvailable: Boolean(row.pdf_s3_key) })));
    } catch (error) {
      console.error('[Documents] Error fetching clearances:', error);
      res.status(500).json({ error: 'Failed to retrieve medical clearances.' });
    }
  });

  // GET /api/documents/clearances/patient/:patientId
  // Clearances for one patient, limited to those issued by the logged-in
  // doctor/dentist. The issuer comes from the JWT, never from the request.
  router.get(
    '/clearances/patient/:patientId',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST'),
    async (req, res) => {
      const patientId = Number(req.params.patientId);
      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({ error: 'A valid patient id is required.' });
      }

      try {
        const [rows] = await pool.query(
          `SELECT clearance_id, purpose, status, issued_at, expires_at,
                  signature_metadata, pdf_s3_key
           FROM MEDICAL_CLEARANCES
           WHERE user_id = ?
             AND issued_by = ?
             AND deleted_at IS NULL
           ORDER BY issued_at DESC, clearance_id DESC`,
          [patientId, req.user.user_id]
        );

        const history = rows.map((row) => {
          const meta = parseMetadata(row.signature_metadata);
          return {
            clearance_id: row.clearance_id,
            purpose: row.purpose,
            status: row.status,
            issued_at: row.issued_at,
            expires_at: row.expires_at,
            remarks: meta.clinical_remarks || null,
            revoked_at: meta.revoked_at || null,
            revocation_reason: meta.revocation_reason || null,
            pdfAvailable: Boolean(row.pdf_s3_key),
          };
        });

        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: patientId,
          table: 'MEDICAL_CLEARANCES',
          recordId: patientId,
          purpose: 'Clearance history review (issuer only)',
          ipAddress: req.ip,
        });

        res.json(history);
      } catch (error) {
        console.error('[Documents] Error fetching issuer clearance history:', error);
        res.status(500).json({ error: 'Failed to retrieve clearance history.' });
      }
    }
  );

  router.patch(
    '/clearances/:id/revoke',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'),
    async (req, res) => {
      const clearanceId = Number(req.params.id);
      const { reason } = req.body;

      if (!clearanceId || Number.isNaN(clearanceId)) {
        return res.status(400).json({ error: 'A valid clearance id is required.' });
      }

      try {
        return res.json(await revokeClearance({ clearanceId, reason, user: req.user, ipAddress: req.ip }));
      } catch (error) {
        return respondToClearanceError(res, error, 'Failed to revoke clearance.');
      }
    }
  );
}
