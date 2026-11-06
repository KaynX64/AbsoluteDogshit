// server/src/routes/healthPass.js
import express from 'express';
import crypto from 'crypto';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { decrypt } from '../utils/cryptoVault.js';
import { requirePrivacyConsent } from '../middleware/consent.js';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';


const router = express.Router();

// ── SEC-08 Remediation (1/2): dedicated QR signing key ──────────────
// The QR HMAC previously reused JWT_SECRET verbatim, violating
// cryptographic key separation: one leaked or abused key would have
// compromised BOTH session tokens and physical health-pass QR codes.
//   • HEALTH_PASS_HMAC_SECRET (recommended, >= 32 chars) is the
//     dedicated key, configured in .env.
//   • If it is not set, a domain-separated key is derived from
//     JWT_SECRET so existing deployments get distinct key material for
//     the two purposes (QR signing key != JWT signing key) without any
//     configuration change.
const CONFIGURED_QR_SECRET = process.env.HEALTH_PASS_HMAC_SECRET;
if (CONFIGURED_QR_SECRET && CONFIGURED_QR_SECRET.length < 32) {
  throw new Error(
    '[HealthPass] HEALTH_PASS_HMAC_SECRET is set but shorter than 32 chars. ' +
    'Generate a dedicated key with: openssl rand -hex 32'
  );
}
const HMAC_SECRET = CONFIGURED_QR_SECRET
  || crypto.createHmac('sha256', JWT_SECRET).update('valetudo:health-pass:hmac:v1').digest('hex');

// ── SEC-08 Remediation (2/2): single-use nonce store ────────────────
// A QR pass is valid for 15 minutes, but the nonce it carries was never
// recorded — a photographed screen could be verified repeatedly inside
// that window. Successful verifications now claim the nonce atomically
// (Redis SET NX EX, key qr:nonce:<nonce>, 15-minute TTL); a repeat
// presentation of the same nonce is rejected. The Map below is the
// in-process fallback when the cache layer is unavailable, bounded so
// it cannot grow without limit.
const QR_VALIDITY_MS = 15 * 60 * 1000;
const NONCE_TTL_SECONDS = 15 * 60;
const NONCE_MEMORY_LIMIT = 10000;
const usedNonces = new Map(); // nonce -> expiresAtMs

function claimNonceInProcess(nonce) {
  const now = Date.now();
  if (usedNonces.size >= NONCE_MEMORY_LIMIT) {
    // Opportunistic pruning of expired entries keeps the map bounded.
    for (const [storedNonce, expiresAt] of usedNonces) {
      if (expiresAt <= now) usedNonces.delete(storedNonce);
    }
    // Still at capacity (pathological flood of valid QRs): evict the
    // oldest entry rather than grow without limit.
    while (usedNonces.size >= NONCE_MEMORY_LIMIT) {
      const oldest = usedNonces.keys().next().value;
      usedNonces.delete(oldest);
    }
  }
  if (usedNonces.has(nonce)) return false;
  usedNonces.set(nonce, now + QR_VALIDITY_MS);
  return true;
}

// GET /api/health-pass/token
router.get('/token', authenticateToken, requirePrivacyConsent, (req, res) => {
  try {
    const userId = req.user.user_id;
    const timestamp = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');

    const payload = `${userId}.${timestamp}.${nonce}`;
    const hmac = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

    const qrToken = `${payload}.${hmac}`;
    res.json({ qrToken, expiresInSeconds: 900 });
  } catch (error) {
    console.error('[HealthPass] QR generation error:', error);
    res.status(500).json({ error: 'Failed to generate QR token.' });
  }
});

// POST /api/health-pass/verify
router.post('/verify', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'ADMIN'), async (req, res) => {
  const { qrToken } = req.body;
  if (!qrToken) return res.status(400).json({ error: 'QR token required.' });

  const parts = qrToken.split('.');
  if (parts.length !== 4) {
    return res.status(400).json({ error: 'Invalid QR token format.' });
  }

  const [patientUserId, timestampStr, nonce, receivedSig] = parts;
  const payload = `${patientUserId}.${timestampStr}.${nonce}`;

  // 1. Compute expected signature using consistent HMAC secret
  const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');

  // Constant-time signature verification
  const expectedBuffer = Buffer.from(expectedSig);
  const receivedBuffer = Buffer.from(receivedSig);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !crypto.timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return res.status(401).json({ error: 'QR verification failed: Invalid signature.' });
  }

  // 2. Expiration check (15 minutes grace window)
  const tokenTime = parseInt(timestampStr, 10);
  if (isNaN(tokenTime) || Date.now() - tokenTime > 15 * 60 * 1000) {
    return res.status(401).json({ error: 'QR pass expired. Ask student to refresh pass.' });
  }

  // 3. Single-use nonce claim (SEC-08 replay protection).
  // SET NX EX is an atomic check-and-set: the first presentation of the
  // nonce wins; concurrent or later presentations receive null and are
  // rejected before any database work is done. A failed claim records
  // nothing, and a cache outage degrades to the in-process guard below.
  let nonceClaimed = false;
  let nonceReplayed = false;
  if (isRedisActive()) {
    try {
      const claimResult = await redis.set(`qr:nonce:${nonce}`, '1', 'EX', NONCE_TTL_SECONDS, 'NX');
      nonceClaimed = claimResult === 'OK';
      nonceReplayed = !nonceClaimed;
    } catch (redisErr) {
      console.warn(
        `[HealthPass] Nonce cache unavailable (${redisErr.message}); using in-process replay guard.`
      );
    }
  }
  if (!nonceClaimed && !nonceReplayed) {
    nonceReplayed = !claimNonceInProcess(nonce);
  }
  if (nonceReplayed) {
    console.warn(
      `[HealthPass] Replay rejected: QR nonce already consumed (scanner user_id=${req.user.user_id}).`
    );
    return res.status(401).json({ error: 'QR pass already used. Ask student to refresh pass.' });
  }

  // 4. Acquire DB connection and execute queries safely inside try/finally
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // R.A. 10173 Consent check on the scanned patient
    const [consentRows] = await connection.query(
      `SELECT is_granted FROM CONSENT_RECORDS 
       WHERE user_id = ? 
       ORDER BY consent_id DESC LIMIT 1`,
      [patientUserId]
    );

    if (consentRows.length === 0 || !Boolean(consentRows[0].is_granted)) {
      await connection.rollback();
      return res.status(403).json({
        error: 'PRIVACY_CONSENT_REVOKED',
        message: 'Student has revoked or not granted R.A. 10173 data processing consent. Intake suspended.',
      });
    }

    // Retrieve active patient records
    const [patient] = await connection.query(
      `SELECT u.user_id, u.first_name, u.last_name, u.email,
              sp.student_no, sp.course, sp.year_level,
              hp.blood_type, hp.allergies, hp.chronic_conditions,
              hp.height, hp.weight, hp.updated_at AS health_profile_updated_at
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
       WHERE u.user_id = ? AND u.is_active = TRUE`,
      [patientUserId]
    );

    if (patient.length === 0) {
      await connection.rollback();
      return res.status(404).json({ error: 'Patient not found or deactivated.' });
    }

    // ── SEC-03 Remediation: record the complete statutory PHI audit entry ──
    // PHI_ACCESS_LOGS.table_affected and record_id are NOT NULL. The previous
    // call omitted table/recordId/purpose/ipAddress, so every QR scan's INSERT
    // failed with ER_BAD_NULL_ERROR (silently caught inside phiLogger) and no
    // audit entry was ever recorded — a violation of R.A. 10173 Sections 12/13
    // accountability mandates. All mandatory fields are now passed, and the
    // call is awaited so the entry is durably written before patient data is
    // returned to the scanner.
    const parsedPatientId = Number(patientUserId);
    if (!isNaN(parsedPatientId) && parsedPatientId > 0) {
      await logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: parsedPatientId,
        table: 'HEALTH_PROFILES',
        recordId: parsedPatientId,
        purpose: 'QR Health Pass Verification & Intake',
        ipAddress: req.ip,
      });
    }

    await connection.commit();

    const patientData = {
      ...patient[0],
      allergies: decrypt(patient[0].allergies),
      chronic_conditions: decrypt(patient[0].chronic_conditions),
    };

    res.json({
      verified: true,
      patient: patientData,
    });
  } catch (error) {
    await connection.rollback();
    console.error('[HealthPass] Verification error:', error);
    res.status(500).json({ error: 'Error during verification.' });
  } finally {
    connection.release();
  }
});

export default router;