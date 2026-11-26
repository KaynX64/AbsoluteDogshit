import { pool } from '../db/pool.js';
import { resolveResponderAccess } from '../emergency/responderAccess.js';
import { loginRoles } from './loginRoles.js';

export async function mobileSession(req, res) {
  res.set('Cache-Control', 'no-store');
  const { user_id, auth_method } = req.user;
  if (!['mobile_google', 'mobile_demo'].includes(auth_method)) {
    return res.status(403).json({ error: 'Mobile sign-in required.' });
  }
  try {
    const roles = await loginRoles(pool, user_id);
    if (!roles.length) return res.status(403).json({ error: 'No active role assigned.' });
    const access = await resolveResponderAccess(user_id);
    return res.json({ user_id, auth_method, roles, is_qualified_responder: access.isQualifiedResponder });
  } catch {
    return res.status(503).json({ error: 'Session validation temporarily unavailable.' });
  }
}
