import crypto from 'crypto';
import { pool } from '../../db.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { encrypt, decrypt } from '../../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../../middleware/consent.js';
import { generateAndStorePrescriptionPDF } from '../../utils/documentService.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { JWT_SECRET } from '../../utils/secrets.js';
import { isCalendarDate } from '../../config/appointmentRules.js';
import {
  SignerError,
  assertValidSigner,
  assertSignatureEnrolled,
  assertValidPatient,
  assertEmrBelongsToPatient,
  assertAppointmentInQueue,
  resolveExpiryDate,
} from '../../utils/signatory.js';

function quantityInt(value, minimum = 1) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !/^\d+$/.test(value.trim()))) return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= minimum && number <= 2147483647 ? number : null;
}

export function registerPrescriptionRoutes(router, io) {
  // =============================================================================
  // 1. PRESCRIPTIONS WITH AUTOMATED FEFO INVENTORY DEDUCTION
  // =============================================================================

  router.post('/prescriptions', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
    const { emr_id, patient_user_id, items, notes: rawNotes, appointment_id, expires_at } = req.body;
    const doctorUserId = req.user.user_id;

    if (!patient_user_id || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'patient_user_id and at least one medication item are required.' });
    }

    if (!isCalendarDate(expires_at)) {
      return res.status(400).json({ error: 'Enter a valid prescription expiry date.' });
    }
    if (rawNotes != null && typeof rawNotes !== 'string') {
      return res.status(400).json({ error: 'Prescription notes must be text.' });
    }
    const notes = rawNotes?.trim() || '';

    const formularyItems = [];
    const outsideItems = [];
    for (const item of items) {
      if (!item || typeof item !== 'object') {
        return res.status(400).json({ error: 'Each prescription item must contain its dosing details.' });
      }
      const { dosage, frequency, route, duration_days, instructions } = item;
      for (const [label, value, max] of [['Dosage', dosage, 100], ['Frequency', frequency, 100], ['Route', route, 50]]) {
        if (typeof value !== 'string' || !value.trim() || value.trim().length > max) {
          return res.status(400).json({ error: label + ' is required and must be at most ' + max + ' characters.' });
        }
      }
      const duration = quantityInt(duration_days);
      const quantity = quantityInt(item.quantity_prescribed ?? item.quantity_dispensed ?? item.quantity);
      if (!duration || !quantity) {
        return res.status(400).json({ error: 'Duration and quantity must be positive whole numbers.' });
      }
      if (instructions != null && typeof instructions !== 'string') {
        return res.status(400).json({ error: 'Prescription instructions must be text.' });
      }
      const normalized = {
        ...item,
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        route: route.trim(),
        duration_days: duration,
        quantity_prescribed: quantity,
        instructions: instructions?.trim() || '',
      };
      if (item.medicine_id === null || item.medicine_id === undefined || item.medicine_id === '') {
        const name = item.outside_drug_name ?? item.outside_name;
        if (typeof name !== 'string' || !name.trim() || name.trim().length > 200) {
          return res.status(400).json({ error: 'Outside drug name is required and must be at most 200 characters.' });
        }
        outsideItems.push({ ...normalized, outside_drug_name: name.trim() });
      } else {
        const dispensed = quantityInt(item.quantity_dispensed ?? quantity, 0);
        if (dispensed === null) {
          return res.status(400).json({ error: 'Dispensed quantity must be a non-negative whole number.' });
        }
        formularyItems.push({ ...normalized, quantity_dispensed: dispensed });
      }
    }

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

          severeInteractions = foundInteractions.filter((i) => i.severity === 'severe');
        }
      }

      // ── FEFO Verification & Batch Allocation ────────────────────────────────
      const plannedDeductions = [];

      for (const [medIdStr, qtyNeeded] of Object.entries(requestedByMedicine)) {
        const medId = Number(medIdStr);

        const [medRows] = await connection.query(
          'SELECT medicine_id, name, generic_name, is_active FROM MEDICINES WHERE medicine_id = ? AND deleted_at IS NULL',
          [medId]
        );

        if (medRows.length === 0) {
          throw new Error(`Medicine #${medId} not found in the master formulary.`);
        }
        if (!Boolean(medRows[0].is_active)) {
          throw new Error(`Medicine "${medRows[0].name}" is currently deactivated in the formulary.`);
        }

        const medName = medRows[0].name;
        const genericName = medRows[0].generic_name;

        // Query active, unexpired batches ordered by earliest expiry (FEFO)
        const [batches] = await connection.query(
          `SELECT batch_id, batch_no, quantity_on_hand, expiry_date
           FROM MEDICINE_BATCHES
           WHERE medicine_id = ?
             AND deleted_at IS NULL
             AND expiry_date > CURDATE()
             AND quantity_on_hand > 0
           ORDER BY expiry_date ASC, batch_id ASC
           FOR UPDATE`,
          [medId]
        );

        const totalAvailable = batches.reduce((sum, b) => sum + Number(b.quantity_on_hand), 0);

        if (totalAvailable < qtyNeeded) {
          const stockErr = new Error(
            `Insufficient unexpired stock for "${medName} (${genericName})". ` +
            `Requested: ${qtyNeeded}, Available in pharmacy: ${totalAvailable}.`
          );
          stockErr.code = 'INSUFFICIENT_STOCK';
          stockErr.medicine = medName;
          stockErr.available = totalAvailable;
          stockErr.requested = qtyNeeded;
          throw stockErr;
        }

        // Allocate across earliest-expiring batches
        let rem = qtyNeeded;
        for (const batch of batches) {
          if (rem <= 0) break;
          const take = Math.min(Number(batch.quantity_on_hand), rem);
          plannedDeductions.push({
            medicine_id: medId,
            medicine_name: medName,
            generic_name: genericName,
            batch_id: batch.batch_id,
            batch_no: batch.batch_no,
            expiry_date: batch.expiry_date,
            deducted_qty: take,
            old_qty: Number(batch.quantity_on_hand),
            new_qty: Number(batch.quantity_on_hand) - take,
          });
          rem -= take;
        }
      }

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
          .update(`${patient_user_id}:${rxUuid}:${targetEmrId}:${items.length}`)
          .digest('hex'),
        items_count: items.length,
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

      // ── Execute planned FEFO stock deductions & write inventory logs ────────
      for (const d of plannedDeductions) {
        await connection.query(
          'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
          [d.new_qty, d.batch_id]
        );

        let qtyToLink = d.deducted_qty;
        const itemAllocations = [];
        for (const line of formularyDispenseLines) {
          if (line.medicine_id !== Number(d.medicine_id) || line.quantity_to_link <= 0) continue;
          const itemQty = Math.min(line.quantity_to_link, qtyToLink);
          if (itemQty > 0) {
            itemAllocations.push({ prescription_item_id: line.prescription_item_id, quantity: itemQty });
            line.quantity_to_link -= itemQty;
            qtyToLink -= itemQty;
          }
          if (qtyToLink === 0) break;
        }
        if (qtyToLink !== 0 || itemAllocations.some((allocation) => !allocation.prescription_item_id)) {
          throw new Error('Unable to link inventory deduction to its prescription item.');
        }

        for (const allocation of itemAllocations) {
          await connection.query(
            `INSERT INTO INVENTORY_LOGS
             (batch_id, prescription_item_id, quantity_change, transaction_type, reason, performed_by)
             VALUES (?, ?, ?, 'dispense', ?, ?)`,
            [
              d.batch_id,
              allocation.prescription_item_id,
              -allocation.quantity,
              `Automated FEFO dispense for Prescription #${prescriptionId} (${d.medicine_name}, Lot ${d.batch_no})`,
              doctorUserId,
            ]
          );
        }

        await logAudit(connection, {
          userId: doctorUserId,
          action: 'UPDATE',
          table: 'MEDICINE_BATCHES',
          recordId: d.batch_id,
          oldValue: { quantity_on_hand: d.old_qty },
          newValue: {
            quantity_on_hand: d.new_qty,
            prescription_id: prescriptionId,
            batch_no: d.batch_no,
            deducted: d.deducted_qty,
          },
          ipAddress: req.ip,
        });
      }
      if (formularyDispenseLines.some((line) => line.quantity_to_link !== 0)) {
        throw new Error('Prescription item quantities do not match the planned inventory deductions.');
      }

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
          ipAddress: req.ip,
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
          items_count: items.length,
          outside_items_count: outsideItems.length,
          allocated_batches_count: plannedDeductions.length,
        },
        ipAddress: req.ip,
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
        ipAddress: req.ip,
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
      if (error instanceof SignerError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('Prescription Issuance Error:', error);
      if (error.code === 'INSUFFICIENT_STOCK') {
        return res.status(409).json({
          error: 'Insufficient stock available.',
          medicine: error.medicine,
          available: error.available,
          requested: error.requested,
        });
      }
      return res.status(400).json({ error: error.message || 'Failed to issue prescription.' });
    } finally {
      connection.release();
    }

    io?.emit('inventory:updated');
    const pdfKey = await generateAndStorePrescriptionPDF(issued.prescriptionId);
    return res.status(201).json({ ...issued, pdfAvailable: Boolean(pdfKey) });
  });

  // GET /api/documents/prescriptions/my (Decrypted for authorized patient)
  router.get('/prescriptions/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const userId = req.user.user_id;

      const [rows] = await pool.query(
        `SELECT p.prescription_id, p.emr_id, p.issued_at, p.expires_at, p.status, p.notes, p.qr_token,
                p.signature_metadata, p.pdf_s3_key,
                doc.first_name AS doctor_first_name, doc.last_name AS doctor_last_name,
                COALESCE(sp.license_no, 'Not on file') AS doctor_license,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty,
                JSON_ARRAYAGG(
                  JSON_OBJECT(
                    'item_id', pi.item_id,
                    'medicine_name', COALESCE(m.name, pi.outside_name),
                    'generic_name', m.generic_name,
                    'is_outside', pi.medicine_id IS NULL,
                    'dosage', pi.dosage,
                    'frequency', pi.frequency,
                    'route', pi.route,
                    'duration_days', pi.duration_days,
                    'quantity_prescribed', pi.quantity_prescribed,
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

    // GET /api/documents/prescriptions/patient/:patientId
  // Prescription history for one patient, limited to what the logged-in
  // doctor/dentist issued themselves. The issuer is taken from the JWT, never
  // from the request, so another clinician's prescriptions cannot be requested.
  router.get(
    '/prescriptions/patient/:patientId',
    authenticateToken,
    requireRoles('DOCTOR', 'DENTIST'),
    async (req, res) => {
      const patientId = Number(req.params.patientId);
      if (!Number.isInteger(patientId) || patientId <= 0) {
        return res.status(400).json({ error: 'A valid patient id is required.' });
      }

      try {
        const [rows] = await pool.query(
          `SELECT prescription_id, emr_id, issued_at, expires_at, status, notes, pdf_s3_key
           FROM PRESCRIPTIONS
           WHERE patient_user_id = ? AND doctor_user_id = ? AND deleted_at IS NULL
           ORDER BY issued_at DESC, prescription_id DESC`,
          [patientId, req.user.user_id]
        );

        const history = new Map(rows.map(({ pdf_s3_key, ...rx }) => [rx.prescription_id, {
          ...rx, notes: decrypt(rx.notes), pdfAvailable: Boolean(pdf_s3_key), items: [],
        }]));
        if (history.size) {
          const [items] = await pool.query(
            `SELECT pi.prescription_id, pi.item_id, COALESCE(m.name, pi.outside_name) AS medicine_name,
                    m.generic_name, pi.medicine_id IS NULL AS is_outside, pi.dosage, pi.frequency,
                    pi.route, pi.duration_days, pi.quantity_prescribed, pi.quantity_dispensed, pi.instructions
             FROM PRESCRIPTION_ITEMS pi
             LEFT JOIN MEDICINES m ON m.medicine_id = pi.medicine_id
             WHERE pi.prescription_id IN (?) AND pi.deleted_at IS NULL
             ORDER BY pi.item_id`,
            [[...history.keys()]]
          );
          for (const { prescription_id, ...item } of items) {
            history.get(prescription_id).items.push({ ...item, instructions: decrypt(item.instructions) });
          }
        }

        logPhiAccess({
          viewerUserId: req.user.user_id,
          patientUserId: patientId,
          table: 'PRESCRIPTIONS',
          recordId: patientId,
          purpose: 'Prescription history review (issuer only)',
          ipAddress: req.ip,
        });

        res.json([...history.values()]);
      } catch (error) {
        console.error('[Documents] Error fetching issuer prescription history:', error);
        res.status(500).json({ error: 'Failed to retrieve prescription history.' });
      }
    }
  );

  // ── Cancel Prescription & Restore Stock ─────────────────────────────────────
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
        // notes is AES-encrypted at rest: decrypt, append, re-encrypt. A raw SQL
        // CONCAT corrupts the ciphertext and makes the notes undecryptable.
        const existingNotes = rx.notes ? decrypt(rx.notes) : '';
        await connection.query(
          `UPDATE PRESCRIPTIONS
           SET status = 'cancelled',
               notes = ?
           WHERE prescription_id = ?`,
          [encrypt(existingNotes + cancellationNote), prescriptionId]
        );

        // ── Trace & restore deducted stock batches ───────────────────────────
        const [dispenseLogs] = await connection.query(
          `SELECT l.log_id, l.batch_id, l.prescription_item_id,
                  ABS(l.quantity_change) AS qty_dispensed
           FROM INVENTORY_LOGS l
           WHERE l.transaction_type = 'dispense'
             AND (
               l.prescription_item_id IN (
                 SELECT item_id FROM PRESCRIPTION_ITEMS WHERE prescription_id = ?
               )
               OR (
                 l.prescription_item_id IS NULL
                 AND l.reason LIKE ?
               )
             )
           FOR UPDATE`,
          [prescriptionId, `Automated FEFO dispense for Prescription #${prescriptionId} (%`]
        );
        const restoredBatchCount = new Set(dispenseLogs.map((log) => Number(log.batch_id))).size;

        for (const log of dispenseLogs) {
          const [batchRows] = await connection.query(
            'SELECT quantity_on_hand FROM MEDICINE_BATCHES WHERE batch_id = ? FOR UPDATE',
            [log.batch_id]
          );

          if (batchRows.length > 0) {
            const currentQty = batchRows[0].quantity_on_hand;
            const restoredQty = currentQty + log.qty_dispensed;

            await connection.query(
              'UPDATE MEDICINE_BATCHES SET quantity_on_hand = ? WHERE batch_id = ?',
              [restoredQty, log.batch_id]
            );

            await connection.query(
              `INSERT INTO INVENTORY_LOGS
               (batch_id, prescription_item_id, quantity_change, transaction_type, reason, performed_by)
               VALUES (?, ?, ?, 'return', ?, ?)`,
              [
                log.batch_id,
                log.prescription_item_id,
                log.qty_dispensed,
                `Restored stock from cancelled Prescription #${prescriptionId}`,
                req.user.user_id,
              ]
            );

            await logAudit(connection, {
              userId: req.user.user_id,
              action: 'UPDATE',
              table: 'MEDICINE_BATCHES',
              recordId: log.batch_id,
              oldValue: { quantity_on_hand: currentQty },
              newValue: {
                quantity_on_hand: restoredQty,
                prescription_id: prescriptionId,
                restored_qty: log.qty_dispensed,
              },
              ipAddress: req.ip,
            });
          }
        }

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
            restored_batches_count: restoredBatchCount,
          },
          ipAddress: req.ip,
        });

        await connection.commit();

        if (io) {
          io.emit('inventory:updated');
        }

        res.json({
          message: `Prescription cancelled successfully and stock was returned from ${restoredBatchCount} medication batch(es).`,
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
}
