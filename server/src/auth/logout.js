import { pool } from '../db/pool.js';
import { disconnectSessionSockets } from '../realtime/presence.js';
import { logAudit } from '../utils/auditLogger.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { sessionBlocklistKey } from './session.js';

// ─────────────────────────────────────────────────────────────────────────
// LOGOUT & SESSION TERMINATION
// ─────────────────────────────────────────────────────────────────────────
export async function logoutUser(req, res, io) {
  try {
    const user = req.user;
    const token = req.token;

    // Invalidate token in Redis until its natural expiration
    if (user && isRedisActive()) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = user.exp ? Math.max(user.exp - now, 60) : 86400;
      const blacklistKey = sessionBlocklistKey(user, token);
      await redis.set(blacklistKey, 'revoked_logout', 'EX', remainingSeconds);
    }

    disconnectSessionSockets(io, user);

    // ── Logout must release the device's FCM token ─────────────────────
    // Optional fcm_token in the body (backward compatible when absent —
    // older clients simply keep their push registration). Deleting the row
    // stops push delivery to a device the user has signed out of; without
    // it a handed-down phone would keep receiving SOS pushes forever.
    const { fcm_token } = req.body || {};
    if (fcm_token && typeof fcm_token === 'string' && fcm_token.trim()) {
      try {
        await pool.query('DELETE FROM DEVICE_TOKENS WHERE user_id = ? AND fcm_token = ?', [
          user.user_id,
          fcm_token.trim(),
        ]);
      } catch (tokErr) {
        console.error('[Logout Token Cleanup Warning]:', tokErr.message);
      }
    }

    // Record session termination to R.A. 10173 Audit Ledger
    const connection = await pool.getConnection();
    try {
      await logAudit(connection, {
        userId: user?.user_id || null,
        action: 'UPDATE',
        table: 'AUTH_SESSIONS',
        recordId: user?.user_id || null,
        oldValue: null,
        newValue: { event: 'USER_LOGOUT_SESSION_TERMINATED', email: user?.email },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      console.error('[Logout Audit Warning]:', auditErr.message);
    } finally {
      connection.release();
    }

    res.json({ message: 'Session terminated and token invalidated successfully.' });
  } catch (error) {
    console.error('[Logout Error]:', error);
    res.status(500).json({ error: 'Failed to process session logout.' });
  }
}
