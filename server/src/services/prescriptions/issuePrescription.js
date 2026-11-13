import { planStock, applyStockDeductions } from './stock.js';
import crypto from 'crypto';
import { pool } from '../../db/pool.js';
import { logAudit } from '../../utils/auditLogger.js';
import { encrypt } from '../../utils/cryptoVault.js';
import { generateAndStorePrescriptionPDF } from '../../documents/documentService.js';
import { JWT_SECRET } from '../../utils/secrets.js';
import {
  SignerError,
  assertValidSigner,
  assertSignatureEnrolled,
  assertValidPatient,
  assertEmrBelongsToPatient,
  assertAppointmentInQueue,
  resolveExpiryDate,
} from '../../documents/signing/signatory.js';

export async function issuePrescription({
  doctorUserId, patient_user_id, appointment_id, emr_id, expires_at, notes,
  formularyItems, outsideItems, itemCount, ipAddress, onInventoryUpdated,
}) {
  const connection = await pool.getConnection();
  let issued;

  try {
    await connection.beginTransaction();

    // ── Re-verify signer, patient and encounter against the database ─────────
    const signer = await assertValidSigner(connection, doctorUserId);
    const sg = await assertSignatureEnrolled(connection, doctorUserId);
    await assertValidPatient(connection, patient_user_id, doctorUserId);
    await assertAppointmentInQueue(connection, appointment_id, patient_user_id, doctorUserId);
    const expDate = resolveExpiryDate(expires_at, 30, 180);
    if (emr_id) {
      await assertEmrBelongsToPatient(connection, emr_id, patient_user_id);
    }

    // ── Aggregate requested quantities per medicine (formulary items only) ─
    const requestedByMedicine = {};
    const formularyDispenseLines = [];
    for (const item of formularyItems) {
      const medId = Number(item.medicine_id);
      const qty = item.quantity_prescribed;
      requestedByMedicine[medId] = (requestedByMedicine[medId] || 0) + qty;
      formularyDispenseLines.push({
        medicine_id: medId,
        quantity_to_link: qty,
        prescription_item_id: null,
      });
    }
    // ── DRUG INTERACTION CHECK (read-only; blocks contraindicated combos) ────
    // Runs before any writes so a blocked pair cannot leave orphan records.
    // Only formulary items participate — outside drugs are not in the
    // MEDICINES / DRUG_INTERACTIONS reference tables, so they cannot be
    // resolved by the checker.
    let severeInteractions = [];
    {
      const allMedicineIds = formularyItems.map((it) => Number(it.medicine_id)).filter(Boolean);
      if (allMedicineIds.length >= 2) {
        const { checkInteractions } = await import('../../utils/interactionChecker.js');
        const foundInteractions = await checkInteractions(connection, allMedicineIds);

        const contraindicated = foundInteractions.filter(
          (i) => i.severity === 'contraindicated'
        );
        if (contraindicated.length > 0) {
          await connection.rollback();
          return { conflict: {
            error: 'CONTRAINDICATED_DRUG_INTERACTION',
            message: 'This prescription contains a contraindicated drug combination and cannot be issued.',
            interactions: contraindicated.map((i) => ({
              severity: i.severity,
              medicine_a: i.medicine_a_name,
              medicine_b: i.medicine_b_name,
              description: i.description,
              recommendation: i.recommendation,
            })),
          } };
        }

        severeInteractions = foundInteractions.filter((i) => i.severity === 'severe');
      }
    }

    const plannedDeductions = await planStock(connection, requestedByMedicine);

    // ── Ensure EMR parent encounter exists ──────────────────────────────────
    let targetEmrId = emr_id;
    if (!targetEmrId) {
      const [emrResult] = await connection.query(
        `INSERT INTO EMR_RECORDS 
         (patient_user_id, doctor_user_id, chief_complaint, diagnosis, treatment_plan, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          patient_user_id,
          doctorUserId,
          encrypt(''),
          encrypt(''),
          encrypt(''),
          encrypt(''),
        ]
      );
      targetEmrId = emrResult.insertId;
    }

    // ── Build HMAC-signed QR token & signature metadata ─────────────────────
    const rxUuid = crypto.randomUUID();
    const hmac = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(rxUuid)
      .digest('hex');
    const qrToken = `RX.${rxUuid}.${hmac.substring(0, 16)}`;

    const signatureMetadata = {
      signer_user_id: doctorUserId,
      signer_role: signer.role,
      signer_license_no: signer.license_no,
      signed_at: new Date().toISOString(),
      signature_s3_key: sg?.signature_s3_key || null,
      signature_sha256: sg?.signature_sha256 || null,
      algorithm: 'SHA-256',
      document_sha256: crypto
        .createHash('sha256')
        .update(`${patient_user_id}:${rxUuid}:${targetEmrId}:${itemCount}`)
        .digest('hex'),
      items_count: itemCount,
      outside_items: outsideItems.map((o) => o.outside_drug_name),
      allocated_batches: plannedDeductions.map((d) => ({
        medicine_id: d.medicine_id,
        medicine_name: d.medicine_name,
        batch_id: d.batch_id,
        batch_no: d.batch_no,
        expiry_date: d.expiry_date,
        quantity: d.deducted_qty,
      })),
      expires_at: expDate,
    };

    const encryptedNotes = encrypt(notes || '');

    const [headerResult] = await connection.query(
      `INSERT INTO PRESCRIPTIONS 
       (emr_id, patient_user_id, doctor_user_id, status, expires_at, notes, qr_token, signature_metadata)
       VALUES (?, ?, ?, 'active', ?, ?, ?, ?)`,
      [
        targetEmrId,
        patient_user_id,
        doctorUserId,
        expDate,
        encryptedNotes,
        qrToken,
        JSON.stringify(signatureMetadata),
      ]
    );

    const prescriptionId = headerResult.insertId;

    // ── Persist prescription line items ─────────────────────────────────────
    for (const [index, item] of formularyItems.entries()) {
      const qtyPrescribed = item.quantity_prescribed;
      const qtyDispensed = item.quantity_dispensed;

      const [itemResult] = await connection.query(
        `INSERT INTO PRESCRIPTION_ITEMS 
         (prescription_id, medicine_id, dosage, frequency, route, duration_days, quantity_prescribed, quantity_dispensed, instructions)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          item.medicine_id,
          item.dosage,
          item.frequency,
          item.route,
          item.duration_days,
          qtyPrescribed,
          qtyDispensed,
          encrypt(item.instructions),
        ]
      );
      formularyDispenseLines[index].prescription_item_id = itemResult.insertId;
      formularyDispenseLines[index].quantity_to_link = qtyPrescribed;
    }
    for (const item of outsideItems) {
      const qtyPrescribed = item.quantity_prescribed;
      // Outside drug: medicine_id stays NULL; quantity_dispensed is 0 because the infirmary does NOT dispense it.
      await connection.query(
        `INSERT INTO PRESCRIPTION_ITEMS 
         (prescription_id, medicine_id, outside_name, dosage, frequency, route, duration_days, quantity_prescribed, quantity_dispensed, instructions)
         VALUES (?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          prescriptionId,
          item.outside_drug_name,
          item.dosage,
          item.frequency,
          item.route,
          item.duration_days,
          qtyPrescribed,
          0,
          encrypt(item.instructions),
        ]
      );
    }

    await applyStockDeductions(connection, { plannedDeductions, formularyDispenseLines, prescriptionId, doctorUserId, ipAddress });

    // ── Log severe-but-not-blocking interactions (physician override trail) ─
    if (severeInteractions.length > 0) {
      await logAudit(connection, {
        userId: doctorUserId,
        action: 'CREATE',
        table: 'PRESCRIPTIONS',
        recordId: prescriptionId,
        oldValue: null,
        newValue: {
          event: 'SEVERE_INTERACTION_OVERRIDE',
          interactions: severeInteractions.map((i) => ({
            medicine_a: i.medicine_a_name,
            medicine_b: i.medicine_b_name,
            severity: i.severity,
            description: i.description,
          })),
        },
        ipAddress,
      });
    }

    // ── R.A. 10173 Audit Ledger Entries ─────────────────────────────────────
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
        items_count: itemCount,
        outside_items_count: outsideItems.length,
        allocated_batches_count: plannedDeductions.length,
      },
      ipAddress,
    });

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
      ipAddress,
    });

    issued = {
      message:
        outsideItems.length > 0
          ? 'Outside prescription issued and signed. No infirmary stock was deducted for outside-pharmacy item(s).'
          : 'Prescription issued, stock automatically deducted under FEFO, and signed.',
      prescriptionId,
      emrId: targetEmrId,
      qrToken,
      signer: signer.display,
      signatureMetadata,
      allocatedBatches: plannedDeductions,
      outsideItemsCount: outsideItems.length,
    };
    await connection.commit();
  } catch (error) {
    await connection.rollback();
    if (!(error instanceof SignerError)) console.error('Prescription Issuance Error:', error);
    return { failure: error };
  } finally {
    connection.release();
  }

  onInventoryUpdated?.();
  const pdfKey = await generateAndStorePrescriptionPDF(issued.prescriptionId);
  return { issued: { ...issued, pdfAvailable: Boolean(pdfKey) } };
}
