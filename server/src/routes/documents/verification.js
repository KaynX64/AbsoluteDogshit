import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { requireRoles } from '../../middleware/rbac.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { redis, isRedisActive } from '../../utils/redisClient.js';
import { getServerPolicy } from '../../config/serverPolicy.js';
import { isQualifiedSigner, formatIssuedBy } from '../../utils/signatory.js';
import { parseMetadata } from './signatureMetadata.js';

const __filename = fileURLToPath(import.meta.url);

const __dirname = path.dirname(__filename);

export function registerVerificationRoutes(router) {
  // =============================================================================
  // 3. PUBLIC VERIFICATION HELPERS (privacy-minimizing + throttling)
  // =============================================================================

  // Helper to reliably locate verify.html across environments
  function getVerifyHtmlPath() {
    const candidates = [
      path.join(__dirname, '../../../public/verify.html'),
      path.join(__dirname, '../../public/verify.html'),
      path.join(process.cwd(), 'server/public/verify.html'),
      path.join(process.cwd(), 'public/verify.html'),
    ];
    return candidates.find((p) => fs.existsSync(p)) || null;
  }

  // "Juan Dela Cruz" -> "Juan D."
  function maskPatientName(first, last) {
    const f = String(first || '').trim();
    const l = String(last || '').trim();
    if (!f) return 'Patient';
    return l ? `${f} ${l.charAt(0).toUpperCase()}.` : f;
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
    const { verify: VERIFY_LIMIT } = getServerPolicy().limits;
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
  // 4. UNIVERSAL QR VERIFICATION (PUBLIC — privacy-minimized)
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
        const metadata = parseMetadata(c.signature_metadata);
        const isValid = !isExpired && !isRevoked && c.status === 'approved' && isQualifiedSigner(metadata.signer_role);

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
          issuedBy: formatIssuedBy(c.doc_first_name, c.doc_last_name, c.doc_license, metadata.signer_role),
          issuedAt: c.issued_at,
          expiresAt: c.expires_at,
          metadata: pickPublicSignature(metadata),
        });
      }

      // 2. Check if token is a Prescription
      // PUBLIC view = authenticity only. No medications, dosages, notes, student no., or course.
      const [prescriptions] = await pool.query(
        `SELECT p.status, p.issued_at, p.expires_at, p.signature_metadata,
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
        const isExpired = p.status === 'expired' || (p.expires_at && new Date(p.expires_at) < new Date());
        const isValid = !isCancelled && !isExpired && (p.status === 'active' || p.status === 'dispensed');

        if (acceptsHtml) {
          const verifyHtml = getVerifyHtmlPath();
          if (verifyHtml) return res.sendFile(verifyHtml);
        }

        return res.json({
          valid: isValid,
          verified: isValid,
          type: 'PRESCRIPTION',
          status: isCancelled ? 'cancelled' : isExpired ? 'expired' : p.status,
          patient: maskPatientName(p.patient_first_name, p.patient_last_name),
          studentNo: 'N/A',   // placeholder so existing verify.html does not break
          course: 'N/A',      // placeholder so existing verify.html does not break
          issuedBy: formatIssuedBy(p.doc_first_name, p.doc_last_name, p.doc_license, parseMetadata(p.signature_metadata).signer_role),
          issuedAt: p.issued_at,
          expiresAt: p.expires_at,
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
                  p.signature_metadata,
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
          const isExpired = p.status === 'expired' || (p.expires_at && new Date(p.expires_at) < new Date());
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

          return res.json({
            valid: isValid,
            type: 'PRESCRIPTION',
            status: isCancelled ? 'cancelled' : isExpired ? 'expired' : p.status,
            patient: `${p.patient_first_name} ${p.patient_last_name}`,
            dateOfBirth: p.date_of_birth,
            age: p.age,
            sex: p.sex,
            studentNo: p.student_no || 'N/A',
            course: p.course || 'N/A',
            issuedBy: formatIssuedBy(p.doc_first_name, p.doc_last_name, p.doc_license, parseMetadata(p.signature_metadata).signer_role),
            issuedAt: p.issued_at,
            expiresAt: p.expires_at,
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
}
