// server/src/utils/documentService.js
//
// Orchestrates "generate PDF → upload to S3 → persist key in DB"
// for prescriptions and clearances.
//
// Both functions are best-effort: they catch their own errors and
// return `null` on failure so the caller (a route handler) never
// rolls back a clinically valid issuance just because MinIO was down.

import crypto from 'crypto';
import { pool } from '../db.js';
import { uploadToS3 } from './s3Vault.js';
import { decrypt } from './cryptoVault.js';
import { renderPrescriptionPDF, renderClearancePDF } from './pdfVault.js';

const API_BASE_URL = process.env.PUBLIC_API_BASE_URL || 'https://localhost:5000';

function prescriptionKey(id) {
  return `prescriptions/rx-${id}-${crypto.randomBytes(4).toString('hex')}.pdf`;
}

function clearanceKey(id) {
  return `clearances/clr-${id}-${crypto.randomBytes(4).toString('hex')}.pdf`;
}

// ─── PRESCRIPTIONS ────────────────────────────────────────────────────────

export async function generateAndStorePrescriptionPDF(prescriptionId) {
  try {
    // 1. Fetch header + patient + doctor
    const [rows] = await pool.query(
      `SELECT p.prescription_id, p.issued_at, p.notes, p.qr_token,
              pt.first_name, pt.last_name,
              sp.student_no, sp.course,
              hp.blood_type, hp.allergies,
              doc.first_name AS doc_first_name,
              doc.last_name  AS doc_last_name,
              st.license_no  AS doc_license
       FROM PRESCRIPTIONS p
       JOIN USERS pt                ON p.patient_user_id = pt.user_id
       LEFT JOIN STUDENT_PROFILES sp ON pt.user_id = sp.user_id
       LEFT JOIN HEALTH_PROFILES  hp ON pt.user_id = hp.user_id
       JOIN USERS doc               ON p.doctor_user_id = doc.user_id
       LEFT JOIN STAFF_PROFILES st  ON doc.user_id = st.user_id
       WHERE p.prescription_id = ? AND p.deleted_at IS NULL`,
      [prescriptionId]
    );

    if (rows.length === 0) throw new Error('Prescription not found.');
    const p = rows[0];

    // 2. Fetch line items
    const [items] = await pool.query(
      `SELECT pi.dosage, pi.frequency, pi.route, pi.duration_days,
              pi.quantity_dispensed, pi.instructions,
              m.name AS medicine_name, m.generic_name
       FROM PRESCRIPTION_ITEMS pi
       JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
       WHERE pi.prescription_id = ?`,
      [prescriptionId]
    );

    // 3. Render the PDF
    const buffer = await renderPrescriptionPDF({
      prescription_id: p.prescription_id,
      issued_at: p.issued_at,
      notes: decrypt(p.notes) || '',
      qr_token: p.qr_token,
      verification_url: `${API_BASE_URL}/api/documents/verify/${encodeURIComponent(p.qr_token)}`,
      patient: {
        first_name: p.first_name,
        last_name: p.last_name,
        student_no: p.student_no,
        course: p.course,
        blood_type: p.blood_type,
        allergies: decrypt(p.allergies) || 'None reported',
      },
      doctor: {
        first_name: p.doc_first_name,
        last_name: p.doc_last_name,
        license_no: p.doc_license,
      },
      items: items.map((it) => ({
        ...it,
        instructions: decrypt(it.instructions),
      })),
    });

    // 4. Upload to MinIO
    const key = prescriptionKey(prescriptionId);
    await uploadToS3({ buffer, key, mimeType: 'application/pdf' });

    // 5. Persist the key back onto the row
    await pool.query(
      'UPDATE PRESCRIPTIONS SET pdf_s3_key = ? WHERE prescription_id = ?',
      [key, prescriptionId]
    );

    console.log(`📄 [PDF] Prescription #${prescriptionId} stored at ${key}`);
    return key;
  } catch (err) {
    console.error(
      `⚠️ [PDF] Prescription #${prescriptionId} generation failed:`,
      err.message
    );
    return null;
  }
}

// ─── MEDICAL CLEARANCES ───────────────────────────────────────────────────

export async function generateAndStoreClearancePDF(clearanceId) {
  try {
    const [rows] = await pool.query(
      `SELECT mc.clearance_id, mc.purpose, mc.issued_at, mc.expires_at,
              mc.qr_token, mc.signature_metadata,
              pt.first_name, pt.last_name,
              sp.student_no, sp.course,
              doc.first_name AS doc_first_name,
              doc.last_name  AS doc_last_name,
              st.license_no  AS doc_license
       FROM MEDICAL_CLEARANCES mc
       JOIN USERS pt                ON mc.user_id = pt.user_id
       LEFT JOIN STUDENT_PROFILES sp ON pt.user_id = sp.user_id
       JOIN USERS doc               ON mc.issued_by = doc.user_id
       LEFT JOIN STAFF_PROFILES st  ON doc.user_id = st.user_id
       WHERE mc.clearance_id = ? AND mc.deleted_at IS NULL`,
      [clearanceId]
    );

    if (rows.length === 0) throw new Error('Clearance not found.');
    const c = rows[0];

    const metadata =
      typeof c.signature_metadata === 'string'
        ? JSON.parse(c.signature_metadata)
        : c.signature_metadata || {};

    const buffer = await renderClearancePDF({
      clearance_id: c.clearance_id,
      purpose: c.purpose,
      remarks: metadata.clinical_remarks || '',
      issued_at: c.issued_at,
      expires_at: c.expires_at,
      qr_token: c.qr_token,
      verification_url: `${API_BASE_URL}/api/documents/verify/${encodeURIComponent(c.qr_token)}`,
      patient: {
        first_name: c.first_name,
        last_name: c.last_name,
        student_no: c.student_no,
        course: c.course,
      },
      doctor: {
        first_name: c.doc_first_name,
        last_name: c.doc_last_name,
        license_no: c.doc_license,
      },
    });

    const key = clearanceKey(clearanceId);
    await uploadToS3({ buffer, key, mimeType: 'application/pdf' });

    await pool.query(
      'UPDATE MEDICAL_CLEARANCES SET pdf_s3_key = ? WHERE clearance_id = ?',
      [key, clearanceId]
    );

    console.log(`📄 [PDF] Clearance #${clearanceId} stored at ${key}`);
    return key;
  } catch (err) {
    console.error(
      `⚠️ [PDF] Clearance #${clearanceId} generation failed:`,
      err.message
    );
    return null;
  }
}