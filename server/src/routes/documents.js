// server/src/routes/documents.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';

const router = express.Router();

// 1. GET /api/documents/prescriptions/my - Retrieve patient's digital prescriptions
router.get('/prescriptions/my', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.user_id;

    // Fetch prescription headers
    const [prescriptions] = await pool.query(
      `SELECT p.prescription_id, p.emr_id, p.issued_at, p.status, p.notes, p.qr_token,
              doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
              COALESCE(sp.license_no, 'PRC-VERIFIED') AS doctor_license,
              COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
       FROM PRESCRIPTIONS p
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
       WHERE p.patient_user_id = ?
       ORDER BY p.issued_at DESC`,
      [userId]
    );

    if (prescriptions.length === 0) {
      return res.json([]);
    }

    // Fetch all items for these prescriptions
    const prescriptionIds = prescriptions.map((p) => p.prescription_id);
    const [items] = await pool.query(
      `SELECT pi.prescription_id, pi.item_id, pi.dosage, pi.frequency, 
              pi.route, pi.duration_days, pi.quantity_dispensed, pi.instructions,
              m.name AS medicine_name, m.generic_name, m.form, m.strength
       FROM PRESCRIPTION_ITEMS pi
       JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
       WHERE pi.prescription_id IN (?)`,
      [prescriptionIds]
    );

    // Group items by prescription_id
    const itemsMap = {};
    items.forEach((item) => {
      if (!itemsMap[item.prescription_id]) {
        itemsMap[item.prescription_id] = [];
      }
      itemsMap[item.prescription_id].push(item);
    });

    const enrichedPrescriptions = prescriptions.map((p) => ({
      ...p,
      items: itemsMap[p.prescription_id] || [],
    }));

    res.json(enrichedPrescriptions);
  } catch (error) {
    console.error('[Documents] Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to retrieve digital prescriptions.' });
  }
});

// 2. GET /api/documents/clearances/my - Retrieve patient's medical clearances
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

// 3. GET /api/documents/verify/:qrToken - QR Token Verification for campus offices & pharmacy
router.get('/verify/:qrToken', async (req, res) => {
  const { qrToken } = req.params;
  try {
    // Check clearance tokens
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
      });
    }

    // Check prescription tokens
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
        type: 'PRESCRIPTION',
        status: p.status,
        patient: `${p.patient_first_name} ${p.patient_last_name}`,
        studentNo: p.student_no || 'N/A',
        issuedBy: `Dr. ${p.doc_first_name} ${p.doc_last_name}`,
        issuedAt: p.issued_at,
        notes: p.notes,
      });
    }

    return res.status(404).json({ valid: false, error: 'Document token not found or invalid.' });
  } catch (error) {
    console.error('[Documents] Verification error:', error);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

export default router;