// Shares revocation key generation and active account checks between HTTP and Socket.IO.

import { pool } from '../db/pool.js';

// Build the shared Redis revocation key for a signed-in session.
export function sessionBlocklistKey(user, token) {
  return 'token:blacklist:' + (user.jti || token);
}

// Check whether the user account still exists and is active.
export async function isSessionAccountActive(userId) {
  const [[account]] = await pool.query(
    'SELECT is_active, deleted_at FROM USERS WHERE user_id = ?',
    [userId],
  );
  return Boolean(account?.is_active && !account.deleted_at);
}
