// Lists saved prescriptions and medication instructions for patients and issuing clinicians.

import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { decrypt } from '../../../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../../../middleware/consent.js';
import { logPhiAccess } from '../../../utils/phiLogger.js';

export function registerPrescriptionHistory(router) {
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
}
