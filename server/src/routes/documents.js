// server/src/routes/documents.js
import express from 'express';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { encrypt, decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';
import multer from 'multer';
import { uploadToS3, getFromS3, getBufferFromS3 } from '../utils/s3Vault.js';
import {
  generateAndStorePrescriptionPDF,
  generateAndStoreClearancePDF,
} from '../utils/documentService.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { VERIFY_LIMIT } from '../config/limits.js';

// Define __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    // ── Build HMAC-signed QR token ─────────────────────────────────────────
    const rxUuid = crypto.randomUUID();
    const hmac = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(rxUuid)
      .digest('hex');
    const qrToken = `RX.${rxUuid}.${hmac.substring(0, 16)}`;

    // ── Build cryptographic signature metadata (R.A. 10173) ────────────────
    const signatureMetadata = {
      signer_user_id: doctorUserId,
      signer_role: req.user.roles[0],
      signed_at: new Date().toISOString(),
      algorithm: 'SHA-256',
      document_sha256: crypto
        .createHash('sha256')
        .update(`${patient_user_id}:${rxUuid}:${targetEmrId}:${items.length}`)
        .digest('hex'),
      items_count: items.length,
    };

    const encryptedNotes = encrypt(notes || '');

    const [headerResult] = await connection.query(
      `INSERT INTO PRESCRIPTIONS 
       (emr_id, patient_user_id, doctor_user_id, status, notes, qr_token, signature_metadata)
       VALUES (?, ?, ?, 'active', ?, ?, ?)`,
      [
        targetEmrId,
        patient_user_id,
        doctorUserId,
        encryptedNotes,
        qrToken,
        JSON.stringify(signatureMetadata),
      ]
    );

const prescriptionId = headerResult.insertId;

// ── DRUG INTERACTION CHECK (before dispensing) ──────────────────
// Collect all medicine IDs from the prescription items
const allMedicineIds = items.map((it) => Number(it.medicine_id)).filter(Boolean);

if (allMedicineIds.length >= 2) {
  const { checkInteractions } = await import('../utils/interactionChecker.js');
  const foundInteractions = await checkInteractions(connection, allMedicineIds);

  // Block if any contraindicated interaction exists
  const contraindicated = foundInteractions.filter(
    (i) => i.severity === 'contraindicated'
  );
  if (contraindicated.length > 0) {
    await connection.rollback();
    return res.status(409).json({
      error: 'CONTRAINDICATED_DRUG_INTERACTION',
      message: 'This prescription contains a contraindicated drug combination and cannot be issued.',
      interactions: contraindicated.map((i) => ({
        severity: i.severity,
        medicine_a: i.medicine_a_name,
        medicine_b: i.medicine_b_name,
        description: i.description,
        recommendation: i.recommendation,
      })),
    });
  }

  // Warn (but allow) for severe interactions — log them in the audit trail
  const severe = foundInteractions.filter((i) => i.severity === 'severe');
  if (severe.length > 0) {
    await logAudit(connection, {
      userId: doctorUserId,
      action: 'CREATE',
      table: 'PRESCRIPTIONS',
      recordId: prescriptionId,
      oldValue: null,
      newValue: {
        event: 'SEVERE_INTERACTION_OVERRIDE',
        interactions: severe.map((i) => ({
          medicine_a: i.medicine_a_name,
          medicine_b: i.medicine_b_name,
          severity: i.severity,
          description: i.description,
        })),
      },
      ipAddress: req.ip,
    });
  }
}
// ── END DRUG INTERACTION CHECK ──────────────────────────────────

// Feature 9: Automated FEFO ...
for (const item of items) {
      const medId = Number(item.medicine_id) || 1;
      const qtyRequested = Number(item.quantity_dispensed) || 1;

      // 1. Verify medicine exists and fetch details
      const [medRows] = await connection.query(
        'SELECT name, generic_name FROM MEDICINES WHERE medicine_id = ? AND is_active = TRUE AND deleted_at IS NULL',
        [medId]
      );
      if (medRows.length === 0) {
        throw new Error(`Medication ID #${medId} is inactive or not found in formulary.`);
      }
      const medName = medRows[0].name;

      // 2. Query available unexpired batches ordered by earliest expiry (FEFO) with row locks
      const [availableBatches] = await connection.query(
        `SELECT batch_id, batch_no, quantity_on_hand, expiry_date
         FROM MEDICINE_BATCHES
         WHERE medicine_id = ? 
           AND quantity_on_hand > 0 
           AND expiry_date > CURDATE() 
           AND deleted_at IS NULL
         ORDER BY expiry_date ASC
         FOR UPDATE`,
        [medId]
      );

   const totalStock = availableBatches.reduce((acc, b) => acc + Number(b.quantity_on_hand), 0);
   if (totalStock < qtyRequested) {
     const stockErr = new Error(
       `Insufficient unexpired stock for "${medName}". Available: ${totalStock} units, Requested: ${qtyRequested} units.`
     );
     stockErr.code = 'INSUFFICIENT_STOCK';
     stockErr.medicine = medName;
     stockErr.available = totalStock;
     stockErr.requested = qtyRequested;
     throw stockErr;
   }

      // 3. Deduct stock across earliest-expiring lots and log each deduction
      let qtyRemainingToDeduct = qtyRequested;
      for (const batch of availableBatches) {
        if (qtyRemainingToDeduct <= 0) break;

        const deductFromThisBatch = Math.min(Number(batch.quantity_on_hand), qtyRemainingToDeduct);
        const newBatchQty = Number(batch.quantity_on_hand) - deductFromThisBatch;

        await connection.query(
          'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
          [newBatchQty, batch.batch_id]
        );

        await connection.query(
          `INSERT INTO INVENTORY_LOGS (batch_id, quantity_change, transaction_type, reason, performed_by)
           VALUES (?, ?, 'dispense', ?, ?)`,
          [
            batch.batch_id,
            -deductFromThisBatch,
            `Automated FEFO prescription dispense (Rx #${prescriptionId}, Lot: ${batch.batch_no})`,
            doctorUserId,
          ]
        );

        qtyRemainingToDeduct -= deductFromThisBatch;
      }

      // 4. Record prescribed item
      await connection.query(
        `INSERT INTO PRESCRIPTION_ITEMS 
         (prescription_id, medicine_id, dosage, frequency, route, duration_days, quantity_dispensed, instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          medId,
          item.dosage || '500mg',
          item.frequency || 'Every 6 hours',
          item.route || 'Oral',
          item.duration_days || 3,
          qtyRequested,
          encrypt(item.instructions || 'Take after meals'),
        ]
      );
    }

    // ── Audit #1: Resource creation ────────────────────────────────────────
    await logAudit(connection, {
      userId: doctorUserId,
      action: 'CREATE',
      table: 'PRESCRIPTIONS',
      recordId: prescriptionId,
      oldValue: null,
      newValue: {
        patient_user_id,
        emr_id: targetEmrId,
        qr_token: qrToken,
        items_count: items.length,
      },
      ipAddress: req.ip,
    });

    // ── Audit #2 (Gap 10): Cryptographic signature event ───────────────────
    await logAudit(connection, {
      userId: doctorUserId,
      action: 'SIGN',
      table: 'PRESCRIPTIONS',
      recordId: prescriptionId,
      oldValue: null,
      newValue: {
        document_sha256: signatureMetadata.document_sha256,
        signer_role: signatureMetadata.signer_role,
        qr_token: qrToken,
        algorithm: signatureMetadata.algorithm,
      },
      ipAddress: req.ip,
    });

    await connection.commit();

    // ✅ Generate + upload the signed PDF (best-effort, post-commit)
    const pdfKey = await generateAndStorePrescriptionPDF(prescriptionId);

    res.status(201).json({
      message: 'Prescription issued and stored securely under AES-256 encryption.',
      prescriptionId,
      emrId: targetEmrId,
      qrToken,
      signatureMetadata,
      pdfAvailable: Boolean(pdfKey),
    });
  } catch (error) {
    await connection.rollback();
    console.error('Prescription Issuance Error:', error);
    if (error.code === 'INSUFFICIENT_STOCK') {
      return res.status(409).json({
        error: 'Insufficient stock available.',
        medicine: error.medicine,
        available: error.available,
        requested: error.requested,
      });
    }
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
              p.signature_metadata, p.pdf_s3_key,
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
        pdfAvailable: Boolean(rx.pdf_s3_key),
        items,
      };
    });

    res.json(decryptedRows);
  } catch (error) {
    console.error('[Documents] Error fetching prescriptions:', error);
    res.status(500).json({ error: 'Failed to retrieve prescriptions.' });
  }
});

// ── Gap 8: PATCH /api/documents/prescriptions/:id/cancel ────────────────────
// Only the issuing practitioner or an ADMIN may cancel an active prescription.
router.patch(
  '/prescriptions/:id/cancel',
  authenticateToken,
  requireRoles('DOCTOR', 'DENTIST', 'ADMIN'),
  async (req, res) => {
    const prescriptionId = Number(req.params.id);
    const { reason } = req.body;

    if (!prescriptionId || Number.isNaN(prescriptionId)) {
      return res.status(400).json({ error: 'A valid prescription id is required.' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const [rows] = await connection.query(
        'SELECT * FROM PRESCRIPTIONS WHERE prescription_id = ? AND deleted_at IS NULL FOR UPDATE',
        [prescriptionId]
      );

      if (rows.length === 0) {
        await connection.rollback();
        return res.status(404).json({ error: 'Prescription not found.' });
      }

      const rx = rows[0];

      if (rx.status !== 'active') {
        await connection.rollback();
        return res.status(409).json({
          error: `Cannot cancel a prescription with status "${rx.status}".`,
          code: 'INVALID_STATE',
          currentStatus: rx.status,
        });
      }

      const isIssuer = Number(rx.doctor_user_id) === Number(req.user.user_id);
      const isAdmin = (req.user.roles || []).includes('ADMIN');
      if (!isIssuer && !isAdmin) {
        await connection.rollback();
        return res.status(403).json({
          error: 'Only the issuing practitioner or an administrator may cancel this prescription.',
        });
      }

      const cancellationNote = `\n[CANCELLED ${new Date().toISOString()}] ${reason || 'Cancelled by practitioner'}`;
      const [updateResult] = await connection.query(
        `UPDATE PRESCRIPTIONS
         SET status = 'cancelled',
             notes = CONCAT(COALESCE(notes, ''), ?)
         WHERE prescription_id = ?`,
        [cancellationNote, prescriptionId]
      );

      if (updateResult.affectedRows === 0) {
        throw new Error('Failed to update prescription status.');
      }

      // Gap 10: dedicated REVOKE audit entry
      await logAudit(connection, {
        userId: req.user.user_id,
        action: 'REVOKE',
        table: 'PRESCRIPTIONS',
        recordId: prescriptionId,
        oldValue: { status: 'active' },
        newValue: {
          status: 'cancelled',
          reason: reason || 'Cancelled by practitioner',
          cancelled_by_role: req.user.roles[0],
          cancelled_at: new Date().toISOString(),
        },
        ipAddress: req.ip,
      });

      await connection.commit();

      res.json({
        message: 'Prescription cancelled successfully.',
        prescriptionId,
        status: 'cancelled',
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Prescription Cancel Error]:', error);
      res.status(400).json({ error: error.message || 'Failed to cancel prescription.' });
    } finally {
      connection.release();
    }
  }
);

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
      algorithm: 'SHA-256',
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

    // ── Audit #1: Resource creation ────────────────────────────────────────
    await logAudit(connection, {
      userId: issuerId,
      action: 'CREATE',
      table: 'MEDICAL_CLEARANCES',
      recordId: clearanceId,
      oldValue: null,
      newValue: { user_id, purpose, expires_at: expDate, token },
      ipAddress: req.ip,
    });

    // ── Audit #2 (Gap 10): Cryptographic signature event ───────────────────
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

    await connection.commit();

    // ✅ Generate + upload the signed PDF (best-effort, post-commit)
    const pdfKey = await generateAndStoreClearancePDF(clearanceId);

    res.status(201).json({
      message: 'Medical clearance issued successfully.',
      clearanceId,
      qrToken: token,
      pdfAvailable: Boolean(pdfKey),
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
              mc.qr_token, mc.signature_metadata, mc.pdf_s3_key,
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

    const enriched = clearances.map((row) => ({
      ...row,
      pdfAvailable: Boolean(row.pdf_s3_key),
    }));

    res.json(enriched);
  } catch (error) {
    console.error('[Documents] Error fetching clearances:', error);
    res.status(500).json({ error: 'Failed to retrieve medical clearances.' });
  }
});

// ── Gap 7: PATCH /api/documents/clearances/:id/revoke ───────────────────────
// Any authorized clinical staff can revoke an approved clearance.
// Revocation stamps the signature_metadata with the actor, reason, and timestamp.
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
        return res.status(409).json({
          error: 'Clearance is already revoked.',
          code: 'ALREADY_REVOKED',
        });
      }

      if (clearance.status === 'expired') {
        await connection.rollback();
        return res.status(409).json({
          error: 'Cannot revoke an already-expired clearance.',
          code: 'ALREADY_EXPIRED',
        });
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
        `UPDATE MEDICAL_CLEARANCES
         SET status = 'revoked',
             signature_metadata = ?
         WHERE clearance_id = ?`,
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

// Helper to reliably locate verify.html across environments
function getVerifyHtmlPath() {
  const candidates = [
    path.join(__dirname, '../../public/verify.html'),
    path.join(__dirname, '../public/verify.html'),
    path.join(process.cwd(), 'server/public/verify.html'),
    path.join(process.cwd(), 'public/verify.html'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC VERIFICATION HELPERS (privacy-minimizing + throttling)
// ─────────────────────────────────────────────────────────────────────────────

// "Juan Dela Cruz" -> "Juan D."
function maskPatientName(first, last) {
  const f = String(first || '').trim();
  const l = String(last || '').trim();
  if (!f) return 'Patient';
  return l ? `${f} ${l.charAt(0).toUpperCase()}.` : f;
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

// Only expose integrity info — never signer IDs, license numbers, or free-text fields.
function pickPublicSignature(meta) {
  return {
    algorithm: meta.algorithm ?? null,
    signed_at: meta.signed_at ?? null,
    document_sha256: meta.document_sha256 ?? null,
  };
}

// Per-IP limiter for unauthenticated verification. Uses Redis when available,
// falls back to an in-memory counter so it never fails open.
const verifyMemoryHits = new Map();

async function verifyRateLimit(req, res, next) {
  const identifier = req.ip || 'unknown';
  let count;
  let retrySec = VERIFY_LIMIT.windowSeconds;

  try {
    if (isRedisActive()) {
      const key = `ratelimit:verify:${identifier}`;
      count = await redis.incr(key);
      if (count === 1) await redis.expire(key, VERIFY_LIMIT.windowSeconds);
      if (count > VERIFY_LIMIT.maxAttempts) {
        const ttl = await redis.ttl(key);
        if (ttl > 0) retrySec = ttl;
      }
    }
  } catch (err) {
    console.error('[Verify Rate Limit Error]:', err.message);
    count = undefined;
  }

  if (count === undefined) {
    const now = Date.now();
    let entry = verifyMemoryHits.get(identifier);
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + VERIFY_LIMIT.windowSeconds * 1000 };
      verifyMemoryHits.set(identifier, entry);
    }
    entry.count += 1;
    count = entry.count;
    retrySec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));

    if (verifyMemoryHits.size > 5000) {
      for (const [k, v] of verifyMemoryHits) {
        if (v.resetAt <= now) verifyMemoryHits.delete(k);
      }
    }
  }

  if (count > VERIFY_LIMIT.maxAttempts) {
    res.setHeader('Retry-After', String(retrySec));
    return res.status(429).json({
      valid: false,
      verified: false,
      error: `Too many verification attempts. Try again in ${retrySec} second(s).`,
    });
  }
  next();
}

// =============================================================================
// 3. UNIVERSAL QR VERIFICATION
// =============================================================================

router.get('/verify/:qrToken', verifyRateLimit, async (req, res) => {
  const { qrToken } = req.params;
  const acceptsHtml = req.accepts('html') && !req.xhr && !req.headers['accept']?.includes('application/json');

  try {
    // 1. Check if token is a Medical Clearance
    const [clearances] = await pool.query(
      `SELECT mc.purpose, mc.status, mc.issued_at, mc.expires_at, mc.signature_metadata,
              u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no AS doc_license
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS u ON mc.user_id = u.user_id
       JOIN USERS doc ON mc.issued_by = doc.user_id
       LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
       WHERE mc.qr_token = ? AND mc.deleted_at IS NULL`,
      [qrToken]
    );

    if (clearances.length > 0) {
      const c = clearances[0];
      const isExpired = new Date(c.expires_at) < new Date();
      const isRevoked = c.status === 'revoked';
      const isValid = !isExpired && !isRevoked && c.status === 'approved';
      const metadata = parseMetadata(c.signature_metadata);

      if (acceptsHtml) {
        const verifyHtml = getVerifyHtmlPath();
        if (verifyHtml) return res.sendFile(verifyHtml);
      }

      return res.json({
        valid: isValid,
        verified: isValid,
        type: 'MEDICAL_CLEARANCE',
        purpose: c.purpose,
        status: isRevoked ? 'revoked' : isExpired ? 'expired' : c.status,
        revokeReason: null,   // free-text reason may contain medical details — staff only
        revokedAt: isRevoked ? metadata.revoked_at || null : null,
        patient: maskPatientName(c.patient_first_name, c.patient_last_name),
        studentNo: 'N/A',     // placeholder so existing verify.html does not break
        course: 'N/A',        // placeholder so existing verify.html does not break
        issuedBy: `Dr. ${c.doc_first_name} ${c.doc_last_name} (${c.doc_license || 'PRC Verified'})`,
        issuedAt: c.issued_at,
        expiresAt: c.expires_at,
        metadata: pickPublicSignature(metadata),
      });
    }

    // 2. Check if token is a Prescription
    // PUBLIC view = authenticity only. No medications, dosages, notes, student no., or course.
    const [prescriptions] = await pool.query(
      `SELECT p.status, p.issued_at, p.signature_metadata,
              u.first_name AS patient_first_name, u.last_name AS patient_last_name,
              doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
              staff.license_no AS doc_license
       FROM PRESCRIPTIONS p
       JOIN USERS u ON p.patient_user_id = u.user_id
       JOIN USERS doc ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
       WHERE p.qr_token = ? AND p.deleted_at IS NULL`,
      [qrToken]
    );

    if (prescriptions.length > 0) {
      const p = prescriptions[0];
      const isCancelled = p.status === 'cancelled';
      const isValid = !isCancelled && (p.status === 'active' || p.status === 'dispensed');

      if (acceptsHtml) {
        const verifyHtml = getVerifyHtmlPath();
        if (verifyHtml) return res.sendFile(verifyHtml);
      }

      return res.json({
        valid: isValid,
        verified: isValid,
        type: 'PRESCRIPTION',
        status: p.status,
        patient: maskPatientName(p.patient_first_name, p.patient_last_name),
        studentNo: 'N/A',   // placeholder so existing verify.html does not break
        course: 'N/A',      // placeholder so existing verify.html does not break
        issuedBy: `Dr. ${p.doc_first_name} ${p.doc_last_name} (${p.doc_license || 'PRC Verified'})`,
        issuedAt: p.issued_at,
        notes: null,
        items: [],
        metadata: pickPublicSignature(parseMetadata(p.signature_metadata)),
      });
    }

    // 3. Fallback: Not found
    if (acceptsHtml) {
      const verifyHtml = getVerifyHtmlPath();
      if (verifyHtml) return res.status(404).sendFile(verifyHtml);
    }

    return res.status(404).json({ valid: false, verified: false, error: 'Document token not found or invalid.' });
  } catch (error) {
    console.error('[Documents] Verification error:', error);
    res.status(500).json({ error: 'Verification failed.' });
  }
});

// =============================================================================
// 3b. STAFF-ONLY VERIFICATION DETAILS (full view for clinic staff)
// =============================================================================
// GET /api/documents/verify/:qrToken/details
// Returns what the public /verify route deliberately hides: full name, student no.,
// course, medications, notes, and revocation reason.
// Every successful lookup is recorded in PHI_ACCESS_LOGS.
router.get(
  '/verify/:qrToken/details',
  authenticateToken,
  requireRoles('DOCTOR', 'DENTIST', 'NURSE'),
  async (req, res) => {
    const { qrToken } = req.params;

    try {
      // 1. Medical Clearance
      const [clearances] = await pool.query(
        `SELECT mc.clearance_id, mc.user_id AS patient_user_id, mc.purpose, mc.status,
                mc.issued_at, mc.expires_at, mc.signature_metadata,
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
        const metadata = parseMetadata(c.signature_metadata);
        const isExpired = new Date(c.expires_at) < new Date();
        const isRevoked = c.status === 'revoked';
        const isValid = !isExpired && !isRevoked && c.status === 'approved';

        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: c.patient_user_id,
          table: 'MEDICAL_CLEARANCES',
          recordId: c.clearance_id,
          purpose: 'Staff QR verification (clearance details)',
          ipAddress: req.ip,
        });

        return res.json({
          valid: isValid,
          type: 'MEDICAL_CLEARANCE',
          purpose: c.purpose,
          status: isRevoked ? 'revoked' : isExpired ? 'expired' : c.status,
          revokeReason: isRevoked ? metadata.revocation_reason || null : null,
          revokedAt: isRevoked ? metadata.revoked_at || null : null,
          patient: `${c.patient_first_name} ${c.patient_last_name}`,
          studentNo: c.student_no || 'N/A',
          course: c.course || 'N/A',
          issuedBy: `Dr. ${c.doc_first_name} ${c.doc_last_name} (${c.doc_license || 'PRC Verified'})`,
          issuedAt: c.issued_at,
          expiresAt: c.expires_at,
          metadata,
        });
      }

      // 2. Prescription
      const [prescriptions] = await pool.query(
        `SELECT p.prescription_id, p.patient_user_id, p.status, p.issued_at, p.notes,
                p.signature_metadata,
                u.first_name AS patient_first_name, u.last_name AS patient_last_name,
                sp.student_no, sp.course,
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
        const isValid = p.status === 'active' || p.status === 'dispensed';

        const [items] = await pool.query(
          `SELECT pi.dosage, pi.frequency, pi.route, pi.duration_days,
                  pi.quantity_dispensed, pi.instructions,
                  m.name AS medicine_name, m.generic_name
           FROM PRESCRIPTION_ITEMS pi
           JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
           WHERE pi.prescription_id = ?`,
          [p.prescription_id]
        );

        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: p.patient_user_id,
          table: 'PRESCRIPTIONS',
          recordId: p.prescription_id,
          purpose: 'Staff QR verification (prescription details)',
          ipAddress: req.ip,
        });

        return res.json({
          valid: isValid,
          type: 'PRESCRIPTION',
          status: p.status,
          patient: `${p.patient_first_name} ${p.patient_last_name}`,
          studentNo: p.student_no || 'N/A',
          course: p.course || 'N/A',
          issuedBy: `Dr. ${p.doc_first_name} ${p.doc_last_name} (${p.doc_license || 'PRC Verified'})`,
          issuedAt: p.issued_at,
          notes: decrypt(p.notes),
          items: items.map((it) => ({ ...it, instructions: decrypt(it.instructions) })),
          metadata: parseMetadata(p.signature_metadata),
        });
      }

      // 3. Not found (nothing is logged)
      return res.status(404).json({ valid: false, error: 'Document token not found or invalid.' });
    } catch (error) {
      console.error('[Documents] Staff verification details error:', error);
      res.status(500).json({ error: 'Verification details failed.' });
    }
  }
);
// GET /api/documents/attachments/my (Fetch all diagnostic attachments for patient)
router.get('/attachments/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
  try {
    const userId = req.user.user_id;

    const [rows] = await pool.query(
      `SELECT a.attachment_id, a.emr_id, a.file_name, a.file_size, a.mime_type, a.created_at,
              e.encounter_date,
              doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
              COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
       FROM EMR_ATTACHMENTS a
       JOIN EMR_RECORDS e ON a.emr_id = e.emr_id
       JOIN USERS doc ON e.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
       WHERE e.patient_user_id = ? AND e.deleted_at IS NULL
       ORDER BY a.created_at DESC`,
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

// PUBLIC: returns authenticity status only — no student number, course, or raw DB row.
router.get('/clearances/verify/:token', verifyRateLimit, async (req, res) => {
  const qrToken = req.params.token;
  try {
    const [clearances] = await pool.query(
      `SELECT mc.purpose, mc.status, mc.issued_at, mc.expires_at,
              u.first_name AS patient_first_name, u.last_name AS patient_last_name
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS u ON mc.user_id = u.user_id
       WHERE mc.qr_token = ? AND mc.deleted_at IS NULL`,
      [qrToken]
    );

    if (clearances.length === 0) {
      return res.status(404).json({ verified: false, error: 'Medical certificate record not found or expired.' });
    }

    const c = clearances[0];
    const isExpired = new Date(c.expires_at) < new Date();
    const isRevoked = c.status === 'revoked';
    res.json({
      verified: !isExpired && !isRevoked && c.status === 'approved',
      clearance: {
        purpose: c.purpose,
        status: isRevoked ? 'revoked' : isExpired ? 'expired' : c.status,
        issued_at: c.issued_at,
        expires_at: c.expires_at,
        patient: maskPatientName(c.patient_first_name, c.patient_last_name),
      },
    });
  } catch (error) {
    console.error('[Documents] Clearance verification error:', error);
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

    const s3Object = await getFromS3(att.s3_key);

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

// =============================================================================
// 5. SIGNED PDF DOWNLOADS (Feature 8)
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
    const isStaff = roles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));

    if (!isOwner && !isStaff) {
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="prescription-${prescriptionId}.pdf"`
    );
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
      `SELECT clearance_id, user_id, pdf_s3_key, status
       FROM MEDICAL_CLEARANCES
       WHERE clearance_id = ? AND deleted_at IS NULL`,
      [clearanceId]
    );

    if (rows.length === 0) return res.status(404).json({ error: 'Clearance not found.' });
    const clr = rows[0];

    const roles = req.user.roles || [];
    const isOwner = Number(req.user.user_id) === Number(clr.user_id);
    const isStaff = roles.some((r) => ['DOCTOR', 'DENTIST', 'NURSE', 'ADMIN'].includes(r));

    if (!isOwner && !isStaff) {
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
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="clearance-${clearanceId}.pdf"`
    );
    res.setHeader('Content-Length', String(buffer.length));
    res.send(buffer);
  } catch (err) {
    console.error('[Clearance PDF Download Error]:', err);
    res.status(500).json({ error: 'Failed to retrieve clearance PDF.' });
  }
});

export default router;