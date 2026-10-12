// server/src/routes/signature.js
//
// Mounted at /api/signature  (see PATCHES.md).
//   GET  /me/status  → { enrolled, updated_at }
//   GET  /me/image   → the caller's current signature PNG
//   PUT  /me         → enroll OR renew (Content-Type: image/png, raw body)
//
// Raw binary is used on purpose: the global express.json() limit is 100 KB
// and only applies to JSON bodies, so image/png bypasses it cleanly.

import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { assertValidSigner, SignerError } from '../utils/signatory.js';
import {
  storeSignature,
  loadSignature,
  SignatureError,
  MAX_SIGNATURE_BYTES,
} from '../utils/signatureVault.js';

const router = express.Router();
const signerOnly = requireRoles('DOCTOR', 'DENTIST');

router.get('/me/status', authenticateToken, signerOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT signature_s3_key, signature_updated_at FROM STAFF_PROFILES WHERE user_id = ?',
      [req.user.user_id]
    );
    const row = rows[0];
    res.json({
      enrolled: Boolean(row?.signature_s3_key),
      updated_at: row?.signature_updated_at || null,
    });
  } catch (err) {
    console.error('[Signature] status failed:', err.message);
    res.status(500).json({ error: 'Could not read signature status.' });
  }
});

router.get('/me/image', authenticateToken, signerOnly, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT signature_s3_key FROM STAFF_PROFILES WHERE user_id = ?',
      [req.user.user_id]
    );
    const buf = await loadSignature(rows[0]?.signature_s3_key);
    if (!buf) return res.status(404).json({ error: 'No signature on file.' });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.send(buf);
  } catch (err) {
    console.error('[Signature] image failed:', err.message);
    res.status(500).json({ error: 'Could not load signature.' });
  }
});

router.put(
  '/me',
  authenticateToken,
  signerOnly,
  express.raw({ type: 'image/png', limit: MAX_SIGNATURE_BYTES }),
  async (req, res) => {
    const userId = req.user.user_id;
    let conn;
    try {
      // Re-check the DATABASE (role, active, license), same as document signing.
      await assertValidSigner(pool, userId);

      const stored = await storeSignature(userId, req.body); // validates PNG too

      conn = await pool.getConnection();
      await conn.beginTransaction();

      const [[before]] = await conn.query(
        'SELECT signature_sha256 FROM STAFF_PROFILES WHERE user_id = ? FOR UPDATE',
        [userId]
      );
      const [upd] = await conn.query(
        `UPDATE STAFF_PROFILES
            SET signature_s3_key = ?, signature_sha256 = ?, signature_updated_at = NOW()
          WHERE user_id = ?`,
        [stored.key, stored.sha256, userId]
      );
      if (upd.affectedRows === 0) {
        throw new SignatureError('No staff profile found for this account.', 409, 'NO_STAFF_PROFILE');
      }

      await logAudit(conn, {
        userId,
        action: 'UPDATE',
        table: 'STAFF_PROFILES',
        recordId: userId,
        oldValue: { signature_sha256: before?.signature_sha256 || null },
        newValue: { event: 'SIGNATURE_ENROLLED', signature_sha256: stored.sha256 },
        ipAddress: req.ip,
      });

      await conn.commit();
      res.json({ ok: true, signature_sha256: stored.sha256 });
    } catch (err) {
      if (conn) await conn.rollback().catch(() => {});
      if (err instanceof SignerError || err instanceof SignatureError) {
        return res.status(err.status).json({ error: err.message, code: err.code });
      }
      console.error('[Signature] enroll failed:', err.message);
      res.status(500).json({ error: 'Could not save signature.' });
    } finally {
      if (conn) conn.release();
    }
  }
);

export default router;