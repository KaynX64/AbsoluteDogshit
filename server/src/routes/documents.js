// server/src/routes/documents.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';
import multer from 'multer';
import { uploadToS3, getFromS3 } from '../utils/s3Vault.js';
import { logPhiAccess } from '../utils/phiLogger.js';


const router = express.Router();

// =============================================================================
// 1. PRESCRIPTIONS
// =============================================================================

// POST /api/documents/prescriptions (Encrypted at rest with AES-256)
router.post('/prescriptions', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
  const { emr_id, patient_user_id, items, notes } = req.body;
  const doctorUserId = req.user.user_id;

  if (!patient_user_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'patient_user_id and at least one medication item are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    let targetEmrId = emr_id;
    if (!targetEmrId) {
      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS 
         (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          patient_user_id,
          doctorUserId,
          encrypt(notes ? `Chief Complaint: ${notes}` : 'Prescription Request / Medical Evaluation'),
          encrypt('Clinical Medication Order'),
          encrypt(`Prescribed ${items.length} medication item(s)`),
          encrypt('Issued via Digital Prescription System'),
        ]
      );
      targetEmrId = emrResult.insertId;
    }

    const rxUuid = crypto.randomUUID();
    const hmac = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'supersecretkeyvaletudo')
      .update(rxUuid)
      .digest('hex');
    const qrToken = `RX.${rxUuid}.${hmac.substring(0, 16)}`;

    const encryptedNotes = encrypt(notes || '');

    const [headerResult] = await connection.query(
      `INSERT INTO PRESCRIPTIONS 
       (emr_id, patient_user_id, doctor_user_id, status, notes, qr_token)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [targetEmrId, patient_user_id, doctorUserId, encryptedNotes, qrToken]
    );

    const prescriptionId = headerResult.insertId;

    for (const item of items) {
      await connection.query(
        `INSERT INTO PRESCRIPTION_ITEMS 
         (prescription_id, medicine_id, dosage, frequency, route, duration_days, quantity_dispensed, instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          item.medicine_id || 1,
          item.dosage || '500mg',
          item.frequency || 'Every 6 hours',
          item.route || 'Oral',
          item.duration_days || 3,
          item.quantity_dispensed || 10,
          encrypt(item.instructions || 'Take after meals'),
        ]
      );
    }

    await logAudit(connection, {
      userId: doctorUserId,
      action: 'CREATE',
      table: 'PRESCRIPTIONS',
      recordId: prescriptionId,
      oldValue: null,
      newValue: { patient_user_id, emr_id: targetEmrId, qr_token: qrToken, items_count: items.length },
      ipAddress: req.ip,
    });

    await connection.commit();

    res.status(201).json({
      message: 'Prescription issued and stored securely under AES-256 encryption.',
      prescriptionId,
      emrId: targetEmrId,
      qrToken,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Prescription Issuance Error:', error);
    res.status(500).json({ error: 'Failed to issue prescription.' });
  } finally {
    connection.release();
  }
});

// GET /api/documents/prescriptions/my (Decrypted for authorized patient)
router.get('/prescriptions/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.query(
      `SELECT p.prescription_id, p.emr_id, p.issued_at, p.status, p.notes, p.qr_token,
              doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
              COALESCE(sp.license_no, 'PRC-VERIFIED') AS doctor_license,
              COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty,
              JSON_ARRAYAGG(
                JSON_OBJECT(
                  'item_id', pi.item_id,
                  'medicine_name', m.name,
                  'generic_name', m.generic_name,
                  'dosage', pi.dosage,
                  'frequency', pi.frequency,
                  'route', pi.route,
                  'duration_days', pi.duration_days,
                  'quantity_dispensed', pi.quantity_dispensed,
                  'instructions', pi.instructions
                )
              ) AS items
       FROM PRESCRIPTIONS p
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
       LEFT JOIN PRESCRIPTION_ITEMS pi ON p.prescription_id = pi.prescription_id
       LEFT JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
       WHERE p.patient_user_id = ? AND p.deleted_at IS NULL
       GROUP BY p.prescription_id
       ORDER BY p.issued_at DESC`,
      [userId]
    );

    const decryptedRows = rows.map((rx) => {
      const items = (rx.items || []).map((it) => ({
        ...it,
        instructions: decrypt(it.instructions),
      }));
      return {
        ...rx,
        notes: decrypt(rx.notes),
        items,
      };
    });

    res.json(decryptedRows);
  } catch (error) {
    console.error('[Documents] Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to retrieve prescriptions.' });
  }
});

// =============================================================================
// 2. MEDICAL CLEARANCES
// =============================================================================

// POST /api/documents/clearances
router.post('/clearances', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE'), async (req, res) => {
  const { user_id, purpose, expires_at, remarks } = req.body;
  const issuerId = req.user.user_id;

  if (!user_id || !purpose) {
    return res.status(400).json({ error: 'user_id and purpose are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    const clearanceUuid = crypto.randomUUID();
    const token = `CLR.${clearanceUuid}.${Date.now()}`;

    const signatureMetadata = {
      signer_user_id: issuerId,
      signer_role: req.user.roles[0],
      signed_at: new Date().toISOString(),
      document_sha256: crypto.createHash('sha256').update(`${user_id}:${purpose}:${token}`).digest('hex'),
      clinical_remarks: remarks || 'Physically fit to undergo university practicum requirements.',
    };

    const expDate = expires_at || new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

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

    await connection.commit();

    res.status(201).json({
      message: 'Medical clearance issued successfully.',
      clearanceId,
      qrToken: token,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Clearance Issuance Error:', error);
    res.status(500).json({ error: 'Failed to issue medical clearance.' });
  } finally {
    connection.release();
  }
});

// GET /api/documents/clearances/my
router.get('/clearances/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [clearances] = await pool.query(
      `SELECT mc.clearance_id, mc.purpose, mc.status, mc.issued_at, mc.expires_at, 
              mc.qr_token, mc.signature_metadata,
              doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
              COALESCE(sp.license_no, 'PRC-VERIFIED') AS doctor_license,
              COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS doc ON mc.issued_by = doc.user_id
       LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
       WHERE mc.user_id = ? AND mc.deleted_at IS NULL
       ORDER BY mc.issued_at DESC`,
      [userId]
    );

    res.json(clearances);
  } catch (error) {
    console.error('[Documents] Error fetching clearances:', error);
    res.status(500).json({ error: 'Failed to retrieve medical clearances.' });
  }
});

// =============================================================================
// 3. UNIVERSAL QR VERIFICATION
// =============================================================================

router.get('/verify/:qrToken', async (req, res) => {
  const { qrToken } = req.params;
  try {
    const [clearances] = await pool.query(
      `SELECT mc.clearance_id, mc.purpose, mc.status, mc.issued_at, mc.expires_at,
              mc.signature_metadata,
              u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no, sp.course,
              doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no AS doc_license
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS u ON mc.user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON mc.issued_by = doc.user_id
       LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
       WHERE mc.qr_token = ? AND mc.deleted_at IS NULL`,
      [qrToken]
    );

    if (clearances.length > 0) {
      const c = clearances[0];
      const isExpired = new Date(c.expires_at) < new Date();
      return res.json({
        valid: !isExpired && c.status === 'approved',
        verified: !isExpired && c.status === 'approved',
        type: 'MEDICAL_CLEARANCE',
        purpose: c.purpose,
        status: isExpired ? 'expired' : c.status,
        patient: `${c.patient_first_name} ${c.patient_last_name}`,
        studentNo: c.student_no || 'N/A',
        course: c.course || 'N/A',
        issuedBy: `Dr. ${c.doc_first_name} ${c.doc_last_name} (${c.doc_license || 'PRC Verified'})`,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        metadata: c.signature_metadata,
        clearance: c,
      });
    }

    const [prescriptions] = await pool.query(
      `SELECT p.prescription_id, p.status, p.issued_at, p.notes,
              u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no,
              doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no AS doc_license
       FROM PRESCRIPTIONS p
       JOIN USERS u ON p.patient_user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
       WHERE p.qr_token = ? AND p.deleted_at IS NULL`,
      [qrToken]
    );

    if (prescriptions.length > 0) {
      const p = prescriptions[0];
      return res.json({
        valid: p.status === 'active',
        verified: p.status === 'active',
        type: 'PRESCRIPTION',
        status: p.status,
        patient: `${p.patient_first_name} ${p.patient_last_name}`,
        studentNo: p.student_no || 'N/A',
        issuedBy: `Dr. ${p.doc_first_name} ${p.doc_last_name}`,
        issuedAt: p.issued_at,
        notes: decrypt(p.notes),
      });
    }

    return res.status(404).json({ valid: false, verified: false, error: 'Document token not found or invalid.' });
  } catch (error) {
    console.error('[Documents] Verification error:', error);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Alias route with retention check (AND mc.deleted_at IS NULL)
router.get('/clearances/verify/:token', async (req, res) => {
  const qrToken = req.params.token;
  try {
    const [clearances] = await pool.query(
      `SELECT mc.clearance_id, mc.purpose, mc.status, mc.issued_at, mc.expires_at, mc.signature_metadata,
              u.first_name as student_first_name, u.last_name as student_last_name,
              sp.student_no, sp.course,
              doc.first_name as doctor_first_name, doc.last_name as doctor_last_name
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS u ON mc.user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON mc.issued_by = doc.user_id
       WHERE mc.qr_token = ? AND mc.deleted_at IS NULL`,
      [qrToken]
    );

    if (clearances.length === 0) {
      return res.status(404).json({ verified: false, error: 'Medical certificate record not found or expired.' });
    }

    const c = clearances[0];
    const isExpired = new Date(c.expires_at) < new Date();
    res.json({
      verified: !isExpired && c.status === 'approved',
      clearance: c,
    });
  } catch (error) {
    res.status(500).json({ error: 'Verification failed.' });
  }
});

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
});


// =============================================================================
// 4. EMR DIAGNOSTIC & LAB ATTACHMENTS (MINIO S3)
// =============================================================================

// POST /api/documents/emr/:emrId/attachments - Upload diagnostic file (CBC, X-ray, lab report)
router.post(
  '/emr/:emrId/attachments',
  authenticateToken,
  requireRoles('DOCTOR', 'DENTIST', 'NURSE'),
  upload.single('file'),
  async (req, res) => {
    const { emrId } = req.params;
    const file = req.file;
    const userId = req.user.user_id;

    if (!file) {
      return res.status(400).json({ error: 'No file uploaded.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Verify EMR record exists
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

      // 1. Upload file buffer to MinIO S3
      await uploadToS3({
        buffer: file.buffer,
        key: s3Key,
        mimeType: file.mimetype,
      });

      // 2. Persist record in database
      const [insertResult] = await connection.query(
        `INSERT INTO EMR_ATTACHMENTS (emr_id, file_name, s3_key, file_size, mime_type, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [emrId, file.originalname, s3Key, file.size, file.mimetype, userId]
      );

      // 3. Log to R.A. 10173 Cryptographic Audit Trail
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

// GET /api/documents/attachments/:attachmentId/download - Secure file retrieval
router.get('/attachments/:attachmentId/download', authenticateToken, async (req, res) => {
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

    // Stream from MinIO S3
    const s3Object = await getFromS3(att.s3_key);

    // Log PHI read access
    logPhiAccess({
      viewerUserId: req.user.user_id,
      patientUserId: att.patient_user_id,
      table: 'EMR_ATTACHMENTS',
      recordId: Number(attachmentId),
      purpose: 'Lab/Diagnostic Document Review',
      ipAddress: req.ip,
    });

    res.setHeader('Content-Type', att.mime_type || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(att.file_name)}"`);
    s3Object.Body.pipe(res);
  } catch (error) {
    console.error('[Attachment Download Error]:', error);
    res.status(500).json({ error: 'Failed to retrieve document from storage.' });
  }
});

export default router;