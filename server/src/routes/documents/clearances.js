import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import { generateAndStoreClearancePDF } from '../../documents/documentService.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { isCalendarDate } from '../../config/appointmentRules.js';
import {
  SignerError,
  assertValidSigner,
  assertSignatureEnrolled,
  assertValidPatient,
  assertAppointmentInQueue,
  resolveExpiryDate,
} from '../../documents/signing/signatory.js';
import { parseMetadata } from './signatureMetadata.js';

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

    const connection = await pool.getConnection();
    let issued;

    try {
      await connection.beginTransaction();

      // Re-verify signer, recipient and expiry against the database
      const signer = await assertValidSigner(connection, issuerId);
      const sg = await assertSignatureEnrolled(connection, issuerId);
      await assertValidPatient(connection, user_id, issuerId);
      await assertAppointmentInQueue(connection, appointment_id, user_id, issuerId);
      const expDate = resolveExpiryDate(expires_at);

      const clearanceUuid = crypto.randomUUID();
      const token = `CLR.${clearanceUuid}.${Date.now()}`;

      const signatureMetadata = {
        signer_user_id: issuerId,
        signer_role: signer.role,
        signer_license_no: signer.license_no,
        signed_at: new Date().toISOString(),
        algorithm: 'SHA-256',
        document_sha256: crypto.createHash('sha256').update(`${user_id}:${purpose}:${token}`).digest('hex'),
        clinical_remarks: remarks,
        signature_s3_key: sg?.signature_s3_key || null,
        signature_sha256: sg?.signature_sha256 || null,
      };

      const [insertResult] = await connection.query(
        `INSERT INTO MEDICAL_CLEARANCES 
         (user_id, purpose, status, issued_by, expires_at, qr_token, signature_metadata)
         VALUES (?, ?, 'approved', ?, ?, ?, ?)`,
        [user_id, purpose, issuerId, expDate, token, JSON.stringify(signatureMetadata)]
      );

      const clearanceId = insertResult.insertId;

      await logAudit(connection, {
        userId: issuerId,
        action: 'CREATE',
        table: 'MEDICAL_CLEARANCES',
        recordId: clearanceId,
        oldValue: null,
        newValue: { user_id, purpose, expires_at: expDate, token },
        ipAddress: req.ip,
      });

      await logAudit(connection, {
        userId: issuerId,
        action: 'SIGN',
        table: 'MEDICAL_CLEARANCES',
        recordId: clearanceId,
        oldValue: null,
        newValue: {
          document_sha256: signatureMetadata.document_sha256,
          signer_role: signatureMetadata.signer_role,
          qr_token: token,
          algorithm: signatureMetadata.algorithm,
        },
        ipAddress: req.ip,
      });

      issued = {
        message: 'Medical clearance issued successfully.',
        clearanceId,
        qrToken: token,
        signer: signer.display,
      };
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      if (error instanceof SignerError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('Clearance Issuance Error:', error);
      return res.status(500).json({ error: 'Failed to issue medical clearance.' });
    } finally {
      connection.release();
    }

    const pdfKey = await generateAndStoreClearancePDF(issued.clearanceId);
    return res.status(201).json({ ...issued, pdfAvailable: Boolean(pdfKey) });
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

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [rows] = await connection.query(
          'SELECT * FROM MEDICAL_CLEARANCES WHERE clearance_id = ? AND deleted_at IS NULL FOR UPDATE',
          [clearanceId]
        );

        if (rows.length === 0) {
          await connection.rollback();
          return res.status(404).json({ error: 'Clearance not found.' });
        }

        const clearance = rows[0];

        if (clearance.status === 'revoked') {
          await connection.rollback();
          return res.status(409).json({ error: 'Clearance is already revoked.', code: 'ALREADY_REVOKED' });
        }

        if (clearance.status === 'expired') {
          await connection.rollback();
          return res.status(409).json({ error: 'Cannot revoke an already-expired clearance.', code: 'ALREADY_EXPIRED' });
        }

        const revokedAt = new Date().toISOString();
        const revocationPatch = {
          revoked_at: revokedAt,
          revoked_by: req.user.user_id,
          revoked_by_role: req.user.roles[0],
          revocation_reason: reason || 'Revoked by clinical staff',
        };

        const existingMetadata =
          typeof clearance.signature_metadata === 'string'
            ? JSON.parse(clearance.signature_metadata)
            : clearance.signature_metadata || {};

        const mergedMetadata = { ...existingMetadata, ...revocationPatch };

        await connection.query(
          `UPDATE MEDICAL_CLEARANCES SET status = 'revoked', signature_metadata = ? WHERE clearance_id = ?`,
          [JSON.stringify(mergedMetadata), clearanceId]
        );

        await logAudit(connection, {
          userId: req.user.user_id,
          action: 'REVOKE',
          table: 'MEDICAL_CLEARANCES',
          recordId: clearanceId,
          oldValue: { status: clearance.status },
          newValue: {
            status: 'revoked',
            reason: reason || 'Revoked by clinical staff',
            revoked_by_role: req.user.roles[0],
            revoked_at: revokedAt,
          },
          ipAddress: req.ip,
        });

        await connection.commit();

        res.json({
          message: 'Medical clearance revoked successfully.',
          clearanceId,
          status: 'revoked',
          revokedAt,
        });
      } catch (error) {
        await connection.rollback();
        console.error('[Clearance Revoke Error]:', error);
        res.status(400).json({ error: error.message || 'Failed to revoke clearance.' });
      } finally {
        connection.release();
      }
    }
  );
}
