// Returns detailed QR verification data to authorized clinical staff.

import { hydratePrescription, isPrescriptionExpired } from '../../../documents/prescriptions/structuredRead.js';
import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requireRoles } from '../../../middleware/rbac.js';
import { decrypt } from '../../../utils/cryptoVault.js';
import { logPhiAccess } from '../../../utils/phiLogger.js';
import { isQualifiedSigner, formatIssuedBy } from '../../../documents/signing/signatory.js';
import { parseMetadata } from '../signatureMetadata.js';

export function registerVerificationDetailsRoute(router) {
  // =============================================================================
  // 5. STAFF-ONLY VERIFICATION DETAILS (full view for clinic staff)
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
          const isValid = !isExpired && !isRevoked && c.status === 'approved' && isQualifiedSigner(metadata.signer_role);

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
            issuedBy: formatIssuedBy(c.doc_first_name, c.doc_last_name, c.doc_license, metadata.signer_role),
            issuedAt: c.issued_at,
            expiresAt: c.expires_at,
            metadata,
          });
        }

        // 2. Prescription
        const [prescriptions] = await pool.query(
          `SELECT p.prescription_id, p.patient_user_id, p.status, p.issued_at, p.expires_at, p.notes,
                  p.signature_metadata, p.contract_version, p.clinical_snapshot,
                  u.first_name AS patient_first_name, u.last_name AS patient_last_name,
                  hp.sex, hp.date_of_birth,
                  TIMESTAMPDIFF(YEAR, hp.date_of_birth, CURDATE()) AS age,
                  sp.student_no, sp.course,
                  doc.first_name AS doc_first_name, doc.last_name AS doc_last_name,
                  staff.license_no AS doc_license
           FROM PRESCRIPTIONS p
           JOIN USERS u ON p.patient_user_id = u.user_id
           LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
           LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
           JOIN USERS doc ON p.doctor_user_id = doc.user_id
           LEFT JOIN STAFF_PROFILES staff ON doc.user_id = staff.user_id
           WHERE p.qr_token = ? AND p.deleted_at IS NULL`,
          [qrToken]
        );

        if (prescriptions.length > 0) {
          const p = prescriptions[0];
          const isCancelled = p.status === 'cancelled';
          const isExpired = isPrescriptionExpired(p);
          const isValid = !isCancelled && !isExpired && (p.status === 'active' || p.status === 'dispensed');

          const [items] = await pool.query(
            `SELECT pi.dosage, pi.frequency, pi.route, pi.duration_days,
                    pi.quantity_prescribed, pi.quantity_dispensed, pi.instructions,
                    COALESCE(m.name, pi.outside_name) AS medicine_name,
                    m.generic_name,
                    (pi.medicine_id IS NULL) AS is_outside
             FROM PRESCRIPTION_ITEMS pi
             LEFT JOIN MEDICINES m ON pi.medicine_id = m.medicine_id
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

          const recorded = hydratePrescription({ ...p, notes: decrypt(p.notes),
            items: items.map(it => ({ ...it, instructions: decrypt(it.instructions) })) });
          const patient = recorded.patient_snapshot || { first_name: p.patient_first_name, last_name: p.patient_last_name,
            date_of_birth: p.date_of_birth, age: p.age, sex: p.sex, student_no: p.student_no, course: p.course };
          const doctor = recorded.prescriber_snapshot || { first_name: p.doc_first_name, last_name: p.doc_last_name,
            license_no: p.doc_license, role: parseMetadata(p.signature_metadata).signer_role };
          return res.json({
            valid: isValid,
            type: 'PRESCRIPTION',
            status: isCancelled ? 'cancelled' : isExpired ? 'expired' : p.status,
            patient: `${patient.first_name} ${patient.last_name}`,
            dateOfBirth: patient.date_of_birth,
            age: patient.age,
            sex: patient.sex,
            studentNo: patient.student_no || 'Not recorded',
            course: patient.course || 'Not recorded',
            issuedBy: formatIssuedBy(doctor.first_name, doctor.last_name, doctor.license_no, doctor.role),
            issuedAt: recorded.issued_at,
            expiresAt: recorded.expires_at,
            notes: recorded.notes,
            items: recorded.items,
            contract_version: recorded.contract_version,
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
}
