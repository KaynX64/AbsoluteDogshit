import { pool } from '../../db/pool.js';
import { authenticateToken, authenticateAttachmentDownload, issueAttachmentDownloadToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import multer from 'multer';
import { uploadToS3, getFromS3 } from '../../utils/s3Vault.js';
import { logPhiAccess } from '../../utils/phiLogger.js';

export function registerAttachmentRoutes(router) {
  // =============================================================================
  // 6. EMR DIAGNOSTIC & LAB ATTACHMENTS (MINIO S3)
  // =============================================================================

  // ── SEC-04 Remediation: strict upload whitelist ──────────────────────
  // Diagnostic attachments are restricted to passive clinical formats.
  // Active content types (text/html, image/svg+xml, application/xhtml+xml,
  // …) are rejected BEFORE the file is buffered, so stored-XSS payloads
  // never reach MinIO storage.
  const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'application/pdf', 'application/dicom'];

  // Magic-byte signatures for the allowed formats. The client-declared MIME
  // type is not trusted alone: the handler re-verifies the actual buffer
  // content, so a renamed or spoofed HTML/SVG upload is rejected too.
  function detectMagicMime(buffer) {
    if (!buffer || buffer.length < 4) return null;
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) return 'image/png';
    if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buffer.length >= 132 && buffer.subarray(128, 132).toString('latin1') === 'DICM') return 'application/dicom';
    return null;
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 15 * 1024 * 1024 },
    // SEC-04: whitelist enforced inside Multer so rejected payloads are
    // never buffered. The stashed MIME lets the handler answer with a
    // precise 415 instead of multer's silent "no file" behavior.
    fileFilter: (req, file, cb) => {
      if (!ALLOWED_MIMES.includes(file.mimetype)) {
        req.fileFilterRejection = file.mimetype || 'unknown';
        return cb(null, false);
      }
      cb(null, true);
    },
  });

  // POST /api/documents/emr/:emrId/attachments
  router.post(
    '/emr/:emrId/attachments',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST', 'NURSE'),
    upload.single('file'),
    async (req, res) => {
      const { emrId } = req.params;
      const file = req.file;
      const userId = req.user.user_id;

      // ── SEC-04: whitelist + magic-byte verification ────────────────
      if (!file) {
        if (req.fileFilterRejection) {
          // Active-content upload rejected by the Multer whitelist.
          return res.status(415).json({
            error: `Unsupported file type "${req.fileFilterRejection}". Allowed types: ${ALLOWED_MIMES.join(', ')}.`,
            code: 'UNSUPPORTED_FILE_TYPE',
          });
        }
        return res.status(400).json({ error: 'No file uploaded.' });
      }

      // The declared MIME must match the actual buffer content, so a
      // spoofed content-type (e.g. HTML renamed to .pdf) is rejected too.
      const magicMime = detectMagicMime(file.buffer);
      if (magicMime !== file.mimetype) {
        return res.status(415).json({
          error: 'File content does not match its declared type. Upload rejected.',
          code: 'FILE_CONTENT_MISMATCH',
          declaredType: file.mimetype || null,
        });
      }

      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();

        const [emrRows] = await connection.query(
          'SELECT patient_user_id FROM EMR_RECORDS WHERE emr_id = ? AND deleted_at IS NULL',
          [emrId]
        );
        if (emrRows.length === 0) {
          throw new Error('EMR record not found.');
        }

        const patientUserId = emrRows[0].patient_user_id;
        const sanitizedName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
        const s3Key = `emr-${emrId}/${Date.now()}-${sanitizedName}`;

        await uploadToS3({
          buffer: file.buffer,
          key: s3Key,
          mimeType: file.mimetype,
        });

        const [insertResult] = await connection.query(
          `INSERT INTO EMR_ATTACHMENTS (emr_id, file_name, s3_key, file_size, mime_type, uploaded_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [emrId, file.originalname, s3Key, file.size, file.mimetype, userId]
        );

        await logAudit(connection, {
          userId,
          action: 'CREATE',
          table: 'EMR_ATTACHMENTS',
          recordId: insertResult.insertId,
          oldValue: null,
          newValue: {
            emr_id: Number(emrId),
            file_name: file.originalname,
            s3_key: s3Key,
            file_size: file.size,
            patient_user_id: patientUserId,
          },
          ipAddress: req.ip,
        });

        await connection.commit();

        res.status(201).json({
          message: 'Diagnostic file uploaded to S3 and linked to EMR record.',
          attachmentId: insertResult.insertId,
          fileName: file.originalname,
        });
      } catch (error) {
        await connection.rollback();
        console.error('[Attachment Upload Error]:', error);
        res.status(500).json({ error: error.message || 'Failed to upload attachment.' });
      } finally {
        connection.release();
      }
    }
  );

  // GET /api/documents/attachments/my (Fetch all diagnostic attachments for patient)
  router.get('/attachments/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const userId = req.user.user_id;

      const [rows] = await pool.query(
        `SELECT a.attachment_id, a.emr_id, a.file_name, a.file_size, a.mime_type,
                a.uploaded_at AS created_at,
                e.encounter_date,
                doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
         FROM EMR_ATTACHMENTS a
         JOIN EMR_RECORDS e ON a.emr_id = e.emr_id
         JOIN USERS doc ON e.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
         ORDER BY a.uploaded_at DESC`,
        [userId]
      );

      logPhiAccess({
        viewerUserId: userId,
        patientUserId: userId,
        table: 'EMR_ATTACHMENTS',
        recordId: userId,
        purpose: 'Patient Mobile Lab Results Review',
        ipAddress: req.ip,
      });

      res.json(rows);
    } catch (error) {
      console.error('[Documents] Error fetching patient attachments:', error);
      res.status(500).json({ error: 'Failed to retrieve diagnostic attachments.' });
    }
  });

  // POST /api/documents/attachments/:attachmentId/download-token   (SEC-06)
  // Issues a single-use, 60-second download token so clients (e.g. the mobile
  // app's "Open & View File") can hand the file to an external browser
  // WITHOUT exposing the primary 24-hour JWT in a URL query parameter.
  router.post(
    '/attachments/:attachmentId/download-token',
    authenticateToken,
    async (req, res) => {
      const attachmentId = Number(req.params.attachmentId);
      if (!attachmentId) {
        return res.status(400).json({ error: 'Invalid attachment id.' });
      }

      try {
        // Only issue tokens for attachments the caller may already download
        // (patient owner / clinical staff) — the same rule the download
        // route itself enforces.
        const [rows] = await pool.query(
          `SELECT a.attachment_id, e.patient_user_id
             FROM EMR_ATTACHMENTS a
             JOIN EMR_RECORDS e ON a.emr_id = e.emr_id
            WHERE a.attachment_id = ?`,
          [attachmentId]
        );

        if (rows.length === 0) {
          return res.status(404).json({ error: 'Attachment not found.' });
        }

        const att = rows[0];
        const userRoles = req.user.roles || [];
        const isClinicalStaff = userRoles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));
        const isOwner = Number(req.user.user_id) === Number(att.patient_user_id);

        if (!isClinicalStaff && !isOwner) {
          return res.status(403).json({ error: 'Unauthorized to access this clinical file.' });
        }

        const downloadToken = issueAttachmentDownloadToken(req.user, attachmentId);
        res.json({
          downloadToken,
          expiresInSeconds: 60,
          downloadUrl: `/api/documents/attachments/${attachmentId}/download?dlToken=${downloadToken}`,
        });
      } catch (error) {
        console.error('[Download Token Issue Error]:', error);
        res.status(500).json({ error: 'Failed to issue download token.' });
      }
    }
  );

  // GET /api/documents/attachments/:attachmentId/download
  router.get('/attachments/:attachmentId/download', authenticateAttachmentDownload, async (req, res) => {
    const { attachmentId } = req.params;

    try {
      const [rows] = await pool.query(
        `SELECT a.attachment_id, a.emr_id, a.file_name, a.s3_key, a.mime_type, e.patient_user_id
         FROM EMR_ATTACHMENTS a
         JOIN EMR_RECORDS e ON a.emr_id = e.emr_id
         WHERE a.attachment_id = ?`,
        [attachmentId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ error: 'Attachment not found.' });
      }

      const att = rows[0];
      const userRoles = req.user.roles || [];
      const isClinicalStaff = userRoles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));
      const isOwner = req.user.user_id === att.patient_user_id;

      if (!isClinicalStaff && !isOwner) {
        return res.status(403).json({ error: 'Unauthorized to access this clinical file.' });
      }

      const s3Object = await getFromS3(att.s3_key);

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: att.patient_user_id,
        table: 'EMR_ATTACHMENTS',
        recordId: Number(attachmentId),
        purpose: 'Lab/Diagnostic Document Review',
        ipAddress: req.ip,
      });

      res.setHeader('X-Content-Type-Options', 'nosniff');
      // ── SEC-04 Remediation: force download — never inline rendering ─────
      // User-uploaded files must not execute in the browser under the app
      // origin (stored XSS). `attachment` prevents inline rendering, nosniff
      // prevents MIME sniffing, and a stored MIME outside the whitelist
      // (legacy uploads predating this fix) is served as a neutral
      // octet-stream instead of being trusted.
      const safeMimeType = ALLOWED_MIMES.includes(att.mime_type)
        ? att.mime_type
        : 'application/octet-stream';
      res.setHeader('Content-Type', safeMimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(att.file_name)}"`);
      s3Object.Body.pipe(res);
    } catch (error) {
      console.error('[Attachment Download Error]:', error);
      res.status(500).json({ error: 'Failed to retrieve document from storage.' });
    }
  });
}
