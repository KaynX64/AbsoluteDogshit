import { pool } from '../../db/pool.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { renderPrescriptionPDF } from '../pdf/templates/prescription.js';
import { loadSignature } from '../signing/signatureVault.js';
import { verificationUrl } from '../publicLinks.js';
import { storeDocumentPdf } from './storage.js';

// ─── PRESCRIPTIONS ────────────────────────────────────────────────────────

export async function generateAndStorePrescriptionPDF(prescriptionId, database = pool) {
  try {
    // 1. Fetch header + patient + doctor
    const [rows] = await database.query(
         `SELECT p.prescription_id, p.issued_at, p.expires_at, p.notes, p.qr_token, p.signature_metadata,
              pt.first_name, pt.last_name,
              sp.student_no, sp.course,
              hp.blood_type, hp.allergies, hp.sex, hp.date_of_birth,
              TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age,
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
    const rxMeta =
         typeof p.signature_metadata === 'string'
           ? JSON.parse(p.signature_metadata)
           : p.signature_metadata || {};

    // 2. Fetch line items
    //    LEFT JOIN + COALESCE so outside (non-formulary) drugs — which have a
    //    NULL medicine_id and a free-text outside_name — still render on the PDF.
    const [items] = await database.query(
      `SELECT pi.dosage, pi.frequency, pi.route, pi.duration_days,
              pi.quantity_prescribed, pi.quantity_dispensed, pi.instructions,
              COALESCE(m.name, pi.outside_name) AS medicine_name,
              m.generic_name,
              (pi.medicine_id IS NULL) AS is_outside
       FROM PRESCRIPTION_ITEMS pi
       LEFT JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
       WHERE pi.prescription_id = ?`,
      [prescriptionId]
    );

    // 3. Render the PDF
    const buffer = await renderPrescriptionPDF({
      prescription_id: p.prescription_id,
      issued_at: p.issued_at,
      expires_at: p.expires_at,
      notes: decrypt(p.notes) || '',
      qr_token: p.qr_token,
      verification_url: verificationUrl(p.qr_token),
      patient: {
        first_name: p.first_name,
        last_name: p.last_name,
        student_no: p.student_no,
        course: p.course,
        blood_type: p.blood_type,
        allergies: decrypt(p.allergies) || 'None reported',
        sex: p.sex,
        date_of_birth: p.date_of_birth,
        age: p.age,
      },
      doctor: {
        first_name: p.doc_first_name,
        last_name: p.doc_last_name,
        license_no: p.doc_license,
        role: rxMeta.signer_role,
        signature_png: await loadSignature(rxMeta.signature_s3_key),
      },
      items: items.map((it) => ({
        ...it,
        instructions: decrypt(it.instructions),
      })),
    });

    const key = await storeDocumentPdf('prescriptions/rx', prescriptionId, buffer, storageKey =>
      database.query('UPDATE PRESCRIPTIONS SET pdf_s3_key = ?, pdf_retry_at = NULL WHERE prescription_id = ? AND pdf_s3_key IS NULL AND deleted_at IS NULL', [storageKey, prescriptionId]),
    );

    if (!key) {
      const [[current]] = await database.query('SELECT pdf_s3_key FROM PRESCRIPTIONS WHERE prescription_id = ? AND deleted_at IS NULL', [prescriptionId]);
      return current?.pdf_s3_key ?? null;
    }
    console.log(`📄 [PDF] Prescription #${prescriptionId} stored at ${key}`);
    return key;
  } catch (err) {
    console.error(
      `⚠️ [PDF] Prescription #${prescriptionId} generation failed:`,
      err.code ?? err.name
    );
    return null;
  }
}
