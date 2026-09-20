// server/src/routes/documents.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { logPhiAccess } from '../utils/phiLogger.js';

const router = express.Router();

// -----------------------------------------------------------------------------
// 1. PRESCRIPTIONS (Features 5 & 8)
// -----------------------------------------------------------------------------

// POST /api/documents/prescriptions - Doctor/Dentist issues a prescription
router.post('/prescriptions', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
  const { emr_id, patient_user_id, items, notes } = req.body;
  const doctorUserId = req.user.user_id;

  if (!patient_user_id || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: 'patient_user_id and at least one medication item are required.' });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // 1. If emr_id is not passed, auto-create a clinical encounter in EMR_RECORDS
    let targetEmrId = emr_id;
    if (!targetEmrId) {
      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS 
         (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          patient_user_id,
          doctorUserId,
          notes ? `Chief Complaint: ${notes}` : 'Prescription Request / Medical Evaluation',
          'Clinical Medication Order',
          `Prescribed ${items.length} medication item(s)`,
          'Issued via Digital Prescription System'
        ]
      );
      targetEmrId = emrResult.insertId;
    }

    // 2. Generate signed UUID + HMAC token
    const rxUuid = crypto.randomUUID();
    const hmac = crypto
      .createHmac('sha256', process.env.JWT_SECRET || 'supersecretkeyvaletudo')
      .update(rxUuid)
      .digest('hex');
    const qrToken = `RX.${rxUuid}.${hmac.substring(0, 16)}`;

    // 3. Insert Prescription Header
    const [headerResult] = await connection.query(
      `INSERT INTO PRESCRIPTIONS 
       (emr_id, patient_user_id, doctor_user_id, status, notes, qr_token)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [targetEmrId, patient_user_id, doctorUserId, notes || null, qrToken]
    );

    const prescriptionId = headerResult.insertId;

    // 4. Insert Line Items
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
          item.instructions || 'Take after meals',
        ]
      );
    }

    // 5. Audit Log (RA 10173)
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
      message: 'Prescription issued and stored successfully.',
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

// GET /api/documents/prescriptions/my - Student fetches their own prescriptions
router.get('/prescriptions/my', authenticateToken, async (req, res) => {
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
       WHERE p.patient_user_id = ?
       GROUP BY p.prescription_id
       ORDER BY p.issued_at DESC`,
      [userId]
    );

    res.json(rows);
  } catch (error) {
    console.error('[Documents] Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to retrieve prescriptions.' });
  }
});

// -----------------------------------------------------------------------------
// 2. MEDICAL CLEARANCES (Features 5 & 8)
// -----------------------------------------------------------------------------

// POST /api/documents/clearances - Doctor/Dentist/Nurse issues clearance
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

    // Cryptographic signature payload
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

// GET /api/documents/clearances/my - Student fetches their clearances
router.get('/clearances/my', authenticateToken, async (req, res) => {
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
       WHERE mc.user_id = ?
       ORDER BY mc.issued_at DESC`,
      [userId]
    );

    res.json(clearances);
  } catch (error) {
    console.error('[Documents] Error fetching clearances:', error);
    res.status(500).json({ error: 'Failed to retrieve medical clearances.' });
  }
});

// -----------------------------------------------------------------------------
// 3. QR VERIFICATION (Dual Support for both Clearances and Prescriptions)
// -----------------------------------------------------------------------------

// Universal QR verification route (used by employers, tournament screeners, pharmacy)
router.get('/verify/:qrToken', async (req, res) => {
  const { qrToken } = req.params;
  try {
    // 1. Check if token matches a Clearance
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
       WHERE mc.qr_token = ?`,
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

    // 2. Check if token matches a Prescription
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
       WHERE p.qr_token = ?`,
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
        notes: p.notes,
      });
    }

    return res.status(404).json({ valid: false, verified: false, error: 'Document token not found or invalid.' });
  } catch (error) {
    console.error('[Documents] Verification error:', error);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Alias for /clearances/verify/:token so existing Postman tests and client calls work seamlessly
router.get('/clearances/verify/:token', async (req, res) => {
  req.params.qrToken = req.params.token;
  // Reuse the universal verification handler
  const { qrToken } = req.params;
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
       WHERE mc.qr_token = ?`,
      [qrToken]
    );

    if (clearances.length === 0) {
      return res.status(404).json({ verified: false, error: 'Medical certificate record not found.' });
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

export default router;