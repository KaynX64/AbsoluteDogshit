import { pool } from '../../db/pool.js';
import { renderClearancePDF } from '../pdf/templates/clearance.js';
import { loadSignature } from '../signing/signatureVault.js';
import { verificationUrl } from '../publicLinks.js';
import { storeDocumentPdf } from './storage.js';

// ─── MEDICAL CLEARANCES ───────────────────────────────────────────────────

export async function generateAndStoreClearancePDF(clearanceId, database = pool) {
  try {
    const [rows] = await database.query(
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
      verification_url: verificationUrl(c.qr_token),
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
        role: metadata.signer_role,
        signature_png: await loadSignature(metadata.signature_s3_key),
      },
    });

    const key = await storeDocumentPdf('clearances/clr', clearanceId, buffer, storageKey =>
      database.query('UPDATE MEDICAL_CLEARANCES SET pdf_s3_key = ?, pdf_retry_at = NULL WHERE clearance_id = ? AND pdf_s3_key IS NULL AND deleted_at IS NULL', [storageKey, clearanceId]),
    );

    if (!key) {
      const [[current]] = await database.query('SELECT pdf_s3_key FROM MEDICAL_CLEARANCES WHERE clearance_id = ? AND deleted_at IS NULL', [clearanceId]);
      return current?.pdf_s3_key ?? null;
    }
    console.log(`📄 [PDF] Clearance #${clearanceId} stored at ${key}`);
    return key;
  } catch (err) {
    console.error(
      `⚠️ [PDF] Clearance #${clearanceId} generation failed:`,
      err.code ?? err.name
    );
    return null;
  }
}
