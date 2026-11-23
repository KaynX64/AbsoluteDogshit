// Revokes the current session when Redis is available, disconnects its sockets, and records logout.

import { pool } from '../db/pool.js';
import { inTransaction } from '../db/transaction.js';
import { disconnectSessionSockets } from '../realtime/presence.js';
import { logAudit } from '../utils/auditLogger.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { sessionBlocklistKey } from './session.js';
import { removePushDevice } from '../emergency/deviceDelivery.js';

// ─────────────────────────────────────────────────────────────────────────
// LOGOUT & SESSION TERMINATION
// ─────────────────────────────────────────────────────────────────────────
// Revoke the current session where possible, remove its push registration, and disconnect its sockets.
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
    let deviceReleased = true;
    try {
      await removePushDevice(pool, user.user_id, req.body ?? {});
    } catch (tokErr) {
      deviceReleased = false;
      console.error('[Logout Token Cleanup Warning]:', tokErr.code ?? tokErr.name);
    }

    // Record session termination to R.A. 10173 Audit Ledger
    try {
      await inTransaction(connection => logAudit(connection, {
        userId: user?.user_id || null,
        action: 'UPDATE',
        table: 'AUTH_SESSIONS',
        recordId: user?.user_id || null,
        oldValue: null,
        newValue: { event: 'USER_LOGOUT_SESSION_TERMINATED', email: user?.email },
        ipAddress: req.ip,
      }));
    } catch (auditErr) {
      console.error('[Logout Audit Warning]:', auditErr.message);
    }

    res.json({ message: 'Session terminated and token invalidated successfully.', deviceReleased });
  } catch (error) {
    console.error('[Logout Error]:', error);
    res.status(500).json({ error: 'Failed to process session logout.' });
  }
}
