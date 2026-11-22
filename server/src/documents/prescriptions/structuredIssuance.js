import crypto from 'node:crypto';
import { pool } from '../../db/pool.js';
import { encrypt, decrypt } from '../../utils/cryptoVault.js';
import { JWT_SECRET } from '../../utils/secrets.js';
import { logAudit } from '../../utils/auditLogger.js';
import { planStock, applyStockDeductions } from '../../inventory/prescriptionStock.js';
import { generateAndStorePrescriptionPDF } from '../generation/prescription.js';
import { assertValidSigner, assertSignatureEnrolled, assertValidPatient, assertAppointmentInQueue, resolveExpiryDate } from '../signing/signatory.js';
import { assessDraft, normalizeDraft, hash, fail, verifyReviewToken, validateAcknowledgements, presentStructuredItem } from './structuredContract.js';

export async function reviewStructuredPrescription(body, doctorUserId, database = pool) {
  const connection = await database.getConnection();
  try {
    await assertValidSigner(connection, doctorUserId);
    await assertValidPatient(connection, body.patient_user_id, doctorUserId);
    await assertAppointmentInQueue(connection, body.appointment_id, body.patient_user_id, doctorUserId);
    resolveExpiryDate(body.expires_at, 30, 180);
    return await assessDraft(connection, body);
  } finally { connection.release(); }
}

export async function issueStructuredPrescription(body, doctorUserId, options = {}) {
  // InnoDB rolls a deadlocked transaction back completely. Re-evaluate the same
  // UUID and all eligibility/safety/stock checks on a new transaction, at most twice.
  for (let attempt = 0; ; attempt++) {
    try { return await issueOnce(body, doctorUserId, options); }
    catch (error) { if (error.code !== 'ER_LOCK_DEADLOCK' || attempt >= 2) throw error; }
  }
}

async function issueOnce(body, doctorUserId, { database = pool, ipAddress, onInventoryUpdated, generatePdf = generateAndStorePrescriptionPDF }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.issuance_request_id ?? '')) throw fail('A stable issuance UUID is required.');
  const normalized = normalizeDraft(body, { allowPast: true });
  if (normalized.errors.length) throw fail('Review the marked prescription fields.', 'INVALID_PRESCRIPTION', 400, { errors: normalized.errors });
  // Token/expiry are excluded: an acknowledged committed request remains recoverable.
  const requestHash = hash({ draft: normalized.draft, acknowledgements: body.acknowledgements });
  const connection = await database.getConnection();
  const lock = hash({ doctorUserId, request: body.issuance_request_id });
  let locked = false, transaction = false, result, wroteStock = false;
  try {
    const [[held]] = await connection.query('SELECT GET_LOCK(?, 5) AS acquired', [lock]);
    if (Number(held?.acquired) !== 1) throw fail('This request is still processing. Retry the same request.', 'REQUEST_IN_PROGRESS', 409);
    locked = true;
    await connection.beginTransaction(); transaction = true;
    const signer = await assertValidSigner(connection, doctorUserId);
    const [existing] = await connection.query(`SELECT prescription_id, emr_id, qr_token, request_hash, pdf_s3_key
      FROM PRESCRIPTIONS WHERE doctor_user_id = ? AND issuance_request_id = ?`, [doctorUserId, body.issuance_request_id]);
    if (existing.length) {
      if (existing[0].request_hash !== requestHash) throw fail('This request identifier was already used for different content.', 'REQUEST_CONTENT_MISMATCH', 409);
      result = { prescriptionId: existing[0].prescription_id, emrId: existing[0].emr_id, qrToken: existing[0].qr_token,
        pdfAvailable: Boolean(existing[0].pdf_s3_key), replayed: true };
      await connection.commit(); transaction = false;
    } else {
      const signature = await assertSignatureEnrolled(connection, doctorUserId);
      await assertValidPatient(connection, normalized.draft.patient_user_id, doctorUserId);
      await assertAppointmentInQueue(connection, normalized.draft.appointment_id, normalized.draft.patient_user_id, doctorUserId, { lock: true });
      const expires = resolveExpiryDate(normalized.draft.expires_at, 30, 180);
      const assessment = await assessDraft(connection, body, { lock: true });
      verifyReviewToken(body.review_token, assessment, doctorUserId);
      const acknowledgements = validateAcknowledgements(assessment, body.acknowledgements);
      const requested = {};
      const dispenseLines = [];
      for (const item of assessment.draft.items.filter(it => it.fulfillment === 'clinic')) {
        requested[item.catalog_medicine_id] = (requested[item.catalog_medicine_id] ?? 0) + item.quantity;
        dispenseLines.push({ item_key: item.item_key, medicine_id: item.catalog_medicine_id, quantity_to_link: item.quantity, prescription_item_id: null });
      }
      const deductions = await planStock(connection, requested);
      const [[patient]] = await connection.query(`SELECT u.first_name, u.last_name, sp.student_no, sp.course,
        hp.sex, hp.date_of_birth, hp.allergies, TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age
        FROM USERS u LEFT JOIN STUDENT_PROFILES sp ON sp.user_id = u.user_id
        LEFT JOIN HEALTH_PROFILES hp ON hp.user_id = u.user_id WHERE u.user_id = ?`, [assessment.draft.patient_user_id]);
      if (!patient) throw fail('Patient record not found.');
      const issuedAt = new Date();
      const snapshot = {
        contract_version: 2, appointment_id: assessment.draft.appointment_id,
        patient: { ...patient, allergies: decrypt(patient.allergies) || '' },
        doctor: { first_name: signer.first_name, last_name: signer.last_name, role: signer.role,
          license_no: signer.license_no, signature_s3_key: signature.signature_s3_key, signature_sha256: signature.signature_sha256 },
        items: assessment.draft.items.map(presentStructuredItem), notes: assessment.draft.notes,
        expires_at: assessment.draft.expires_at, issued_at: issuedAt.toISOString(),
        safety: assessment.safety, acknowledgements,
      };
      const digest = hash(snapshot);
      const uuid = crypto.randomUUID();
      const qrToken = `RX.${uuid}.${crypto.createHmac('sha256', JWT_SECRET).update(uuid).digest('hex').slice(0, 16)}`;
      const metadata = { signer_user_id: doctorUserId, signer_role: signer.role, signer_license_no: signer.license_no,
        signed_at: issuedAt.toISOString(), signature_s3_key: signature.signature_s3_key, signature_sha256: signature.signature_sha256,
        algorithm: 'SHA-256', document_sha256: digest, hash_scope: 'prescription_payload_v2', contract_version: 2, items_count: snapshot.items.length };
      const [emr] = await connection.query(`INSERT INTO EMR_RECORDS
        (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes) VALUES (?, ?, ?, ?, ?, ?)`,
      [assessment.draft.patient_user_id, doctorUserId, encrypt(''), encrypt(''), encrypt(''), encrypt('')]);
      const [header] = await connection.query(`INSERT INTO PRESCRIPTIONS
        (emr_id, patient_user_id, doctor_user_id, issued_at, status, expires_at, notes, qr_token, signature_metadata,
         contract_version, issuance_request_id, request_hash, clinical_snapshot)
        VALUES (?, ?, ?, ?, 'active', ?, ?, ?, ?, 2, ?, ?, ?)`,
      [emr.insertId, assessment.draft.patient_user_id, doctorUserId, issuedAt, expires, encrypt(snapshot.notes), qrToken,
        JSON.stringify(metadata), body.issuance_request_id, requestHash, encrypt(JSON.stringify(snapshot))]);
      const prescriptionId = header.insertId;
      for (const [index, item] of snapshot.items.entries()) {
        const [row] = await connection.query(`INSERT INTO PRESCRIPTION_ITEMS
          (prescription_id, medicine_id, outside_name, dosage, frequency, route, duration_days,
           quantity_prescribed, quantity_dispensed, instructions, catalog_medicine_id, item_sequence, structured_details)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [prescriptionId, item.medicine_id, item.is_outside ? item.generic_name : null, item.dosage,
          item.schedule.kind === 'fixed' ? item.frequency : item.schedule.kind === 'prn' ? 'As needed - see recorded directions' : 'Custom schedule - see recorded directions',
          item.route, item.duration_days, item.quantity, item.quantity_dispensed, encrypt(item.directions),
          item.catalog_medicine_id, index, encrypt(JSON.stringify(item))]);
        const line = dispenseLines.find(it => it.item_key === item.item_key);
        if (line) line.prescription_item_id = row.insertId;
      }
      await applyStockDeductions(connection, { plannedDeductions: deductions, formularyDispenseLines: dispenseLines,
        prescriptionId, doctorUserId, ipAddress });
      for (const action of ['CREATE', 'SIGN']) await logAudit(connection, { userId: doctorUserId, action,
        table: 'PRESCRIPTIONS', recordId: prescriptionId, oldValue: null,
        newValue: { contract_version: 2, items_count: snapshot.items.length, document_sha256: digest,
          hash_scope: metadata.hash_scope, severe_override_ids: Object.keys(acknowledgements.severe_reasons) }, ipAddress });
      await connection.commit(); transaction = false;
      wroteStock = deductions.length > 0;
      result = { prescriptionId, emrId: emr.insertId, qrToken, replayed: false, pdfAvailable: false };
    }
  } catch (error) {
    if (transaction) await connection.rollback();
    throw error;
  } finally {
    try { if (locked) await connection.query('SELECT RELEASE_LOCK(?)', [lock]); }
    finally { connection.release(); }
  }
  if (wroteStock) onInventoryUpdated?.();
  if (!result.replayed) result.pdfAvailable = Boolean(await generatePdf(result.prescriptionId));
  return result;
}
