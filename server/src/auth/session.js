import { pool } from '../db/pool.js';

export function sessionBlocklistKey(user, token) {
  return 'token:blacklist:' + (user.jti || token);
}

export async function isSessionAccountActive(userId) {
  const [[account]] = await pool.query(
    'SELECT is_active, deleted_at FROM USERS WHERE user_id = ?',
    [userId],
  );
  return Boolean(account?.is_active && !account.deleted_at);
}
