// server/src/routes/documents.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';

const router = express.Router();

// -----------------------------------------------------------------------------
// 1. PRESCRIPTIONS (Feature 8: Issuance)
// -----------------------------------------------------------------------------

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
          notes ? `Complaint: ${notes}` : 'Clinical Evaluation Order',
          'General Prescription Issuance',
          `Prescribed ${items.length} medication item(s)`,
          'Issued via Digital Prescription Generator'
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

    const [headerResult] = await connection.query(
      `INSERT INTO PRESCRIPTIONS 
       (emr_id, patient_user_id, doctor_user_id, status, notes, qr_token)
       VALUES (?, ?, ?, 'active', ?, ?)`,
      [targetEmrId, patient_user_id, doctorUserId, notes || null, qrToken]
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
          item.instructions || 'Take after meals',
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

    const socketIo = req.app.get('io');
    if (socketIo) {
      socketIo.emit('prescription:issued', {
        patient_user_id, // ✅ Correct variable
        prescriptionId,
        qrToken,
      });
    }
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

// GET /api/documents/prescriptions/my - Patient fetches own prescriptions
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
// 2. MEDICAL CLEARANCES (Feature 8: Issuance)
// -----------------------------------------------------------------------------

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

    // Broadcast real-time event to Flutter
    const socketIo = req.app.get('io');
    if (socketIo) {
      socketIo.emit('clearance:issued', {
        user_id, // ✅ Correct variable
        clearanceId,
        qrToken: token,
      });
    }

    res.status(201).json({
      message: 'Medical clearance issued successfully.',
      clearanceId,
      qrToken: token,
    });
  } catch (error) {
    await connection.rollback();
    console.error('Clearance Issuance Error:', error);
   res.status(500).json({ error: error.message || 'Failed to issue medical clearance.' });
  } finally {
    connection.release();
  }
});

// GET /api/documents/clearances/my - Patient fetches own clearances
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
// 3. UNIVERSAL VERIFICATION & PRINTABLE HTML/PDF
// -----------------------------------------------------------------------------

router.get('/verify/:qrToken', async (req, res) => {
  const { qrToken } = req.params;
  try {
    const [clearances] = await pool.query(
      `SELECT mc.*, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no, sp.course, doc.first_name AS doc_first_name, doc.last_name AS doc_last_name
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS u ON mc.user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON mc.issued_by = doc.user_id
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
        issuedBy: `Dr. ${c.doc_first_name} ${c.doc_last_name}`,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
      });
    }

    const [prescriptions] = await pool.query(
      `SELECT p.*, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no, doc.first_name AS doc_first_name, doc.last_name AS doc_last_name
       FROM PRESCRIPTIONS p
       JOIN USERS u ON p.patient_user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
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
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// Printable HTML / Save-as-PDF service (Feature 5)
router.get('/print/:qrToken', async (req, res) => {
  const { qrToken } = req.params;
  try {
    const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrToken)}`;

    // 1. Check if Clearance
    const [clearances] = await pool.query(
      `SELECT mc.*, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no, sp.course, doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no
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
      const meta = typeof c.signature_metadata === 'string' ? JSON.parse(c.signature_metadata) : c.signature_metadata;

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>PSU Medical Clearance - ${c.patient_last_name}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 750px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
              .header h2 { margin: 0; color: #0f766e; font-size: 18px; }
              .title { text-align: center; font-size: 16px; font-weight: bold; margin: 20px 0; text-decoration: underline; }
              .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; line-height: 1.6; }
              .seal { display: flex; align-items: center; gap: 16px; border: 1px solid #99f6e4; background: #f0fdfa; padding: 14px; border-radius: 8px; margin-top: 20px; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
              .sig { border-top: 1px solid #000; width: 220px; text-align: center; font-weight: bold; padding-top: 4px; }
              .print-bar { margin-bottom: 20px; text-align: right; }
              .btn { background: #0f766e; color: #fff; padding: 8px 16px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
              @media print { .print-bar { display: none; } body { padding: 0; } }
            </style>
          </head>
          <body>
            <div class="print-bar">
              <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
            </div>
            <div class="header">
              <h2>PANGASINAN STATE UNIVERSITY INFIRMARY</h2>
              <small>Lingayen Campus Medical Services • Republic Act No. 10173 Verified E-Clearance</small>
            </div>
            <div class="title">OFFICIAL MEDICAL CLEARANCE CERTIFICATE</div>
            <div class="card">
              <b>Patient:</b> ${c.patient_first_name} ${c.patient_last_name} &nbsp;|&nbsp; <b>ID:</b> ${c.student_no || 'N/A'}<br/>
              <b>Course / Department:</b> ${c.course || 'PSU Lingayen'}<br/>
              <b>Issued:</b> ${new Date(c.issued_at).toLocaleDateString()} &nbsp;|&nbsp; <b>Valid Until:</b> <span style="color:#0f766e;font-weight:bold;">${new Date(c.expires_at).toLocaleDateString()}</span>
            </div>
            <p style="font-size: 14px; line-height: 1.8;">
              This certifies that the patient indicated above has undergone clinical evaluation and is declared fit for:
              <br/><br/>
              <b>Purpose:</b> ${c.purpose}<br/>
              <b>Clinical Assessment:</b> ${meta?.clinical_remarks || 'Physically fit.'}
            </p>
            <div class="seal">
              <img src="${qrImageUrl}" width="100" height="100" alt="QR Seal" />
              <div>
                <b style="color: #0f766e;">Digital Cryptographic Seal</b>
                <p style="margin: 2px 0 6px 0; font-size: 11px; color: #64748b;">Scan to verify validity against university health ledger.</p>
                <code style="font-size: 10px; background: #fff; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px;">${c.qr_token}</code>
              </div>
            </div>
            <div class="footer">
              <div><small>Ref: CLR-${c.clearance_id}</small></div>
              <div class="sig">
                Dr. ${c.doc_first_name} ${c.doc_last_name}<br/>
                <small>License: ${c.license_no || 'PRC-MD-VERIFIED'}</small>
              </div>
            </div>
            <script>
              window.onload = () => { setTimeout(() => window.print(), 400); };
            </script>
          </body>
        </html>
      `);
    }

    // 2. Check if Prescription
    const [prescriptions] = await pool.query(
      `SELECT p.*, u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              sp.student_no, sp.course, doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no,
              JSON_ARRAYAGG(
                JSON_OBJECT('name', m.name, 'dosage', pi.dosage, 'freq', pi.frequency, 'qty', pi.quantity_dispensed, 'ins', pi.instructions)
              ) as items
       FROM PRESCRIPTIONS p
       JOIN USERS u ON p.patient_user_id = u.user_id
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
       LEFT JOIN PRESCRIPTION_ITEMS pi ON p.prescription_id = pi.prescription_id
       LEFT JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
       WHERE p.qr_token = ?
       GROUP BY p.prescription_id`,
      [qrToken]
    );

    if (prescriptions.length > 0) {
      const p = prescriptions[0];
      const items = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;

      return res.send(`
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <title>PSU Prescription - ${p.patient_last_name}</title>
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; padding: 24px; color: #1e293b; max-width: 750px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
              .header h2 { margin: 0; color: #0f766e; font-size: 18px; }
              .rx { font-size: 36px; font-weight: 900; color: #0f766e; margin: 12px 0 6px; }
              .card { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 14px; margin: 16px 0; font-size: 13px; line-height: 1.6; }
              .item { background: #fff; border-left: 4px solid #0f766e; padding: 10px 14px; margin-bottom: 10px; border-radius: 4px; }
              .seal { display: flex; align-items: center; gap: 16px; border: 1px solid #cbd5e1; padding: 14px; border-radius: 8px; margin-top: 20px; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
              .sig { border-top: 1px solid #000; width: 220px; text-align: center; font-weight: bold; padding-top: 4px; }
              .print-bar { margin-bottom: 20px; text-align: right; }
              .btn { background: #0f766e; color: #fff; padding: 8px 16px; border: none; border-radius: 6px; font-weight: bold; cursor: pointer; }
              @media print { .print-bar { display: none; } body { padding: 0; } }
            </style>
          </head>
          <body>
            <div class="print-bar">
              <button class="btn" onclick="window.print()">🖨️ Print / Save as PDF</button>
            </div>
            <div class="header">
              <h2>PANGASINAN STATE UNIVERSITY INFIRMARY</h2>
              <small>Lingayen Campus Medical Services • Digital Prescription</small>
            </div>
            <div class="card">
              <b>Patient:</b> ${p.patient_first_name} ${p.patient_last_name} &nbsp;|&nbsp; <b>ID:</b> ${p.student_no || 'N/A'}<br/>
              <b>Issued:</b> ${new Date(p.issued_at).toLocaleString()}
            </div>
            <div class="rx">℞</div>
            ${items.map((i) => `
              <div class="item">
                <b>${i.name} - ${i.dosage}</b> &nbsp;|&nbsp; Quantity: <b>${i.qty}</b><br/>
                <small>Sig: ${i.ins} (${i.freq})</small>
              </div>
            `).join('')}
            ${p.notes ? `<p style="font-size:12px;color:#64748b;"><b>Doctor Notes:</b> ${p.notes}</p>` : ''}
            <div class="seal">
              <img src="${qrImageUrl}" width="90" height="90" alt="QR" />
              <div>
                <b style="color:#0f766e;">Verifiable Prescription Seal</b><br/>
                <code style="font-size:10px;">${p.qr_token}</code>
              </div>
            </div>
            <div class="footer">
              <div><small>Prescription #${p.prescription_id}</small></div>
              <div class="sig">
                Dr. ${p.doc_first_name} ${p.doc_last_name}<br/>
                <small>PRC License: ${p.license_no || 'PRC-MD-VERIFIED'}</small>
              </div>
            </div>
            <script>
              window.onload = () => { setTimeout(() => window.print(), 400); };
            </script>
          </body>
        </html>
      `);
    }

    res.status(404).send('Document not found.');
  } catch (err) {
    res.status(500).send('Print generation failed: ' + err.message);
  }
});

export default router;