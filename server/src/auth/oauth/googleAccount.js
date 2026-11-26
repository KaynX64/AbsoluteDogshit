import { loginRoles } from '../loginRoles.js';

// Find an eligible HealthLink account by verified email and link its Google subject on first sign-in.
// Lock the account row so concurrent sign-ins cannot overwrite the identity link.
export async function bindGoogleAccount(connection, { email, subject }) {
  const [[user]] = await connection.query(
    `SELECT user_id, email, first_name, last_name, is_active, deleted_at,
            is_demo_account, google_subject, theme_mode, theme_preset
       FROM USERS WHERE email = ? FOR UPDATE`, [email],
  );
  if (!user || user.email.toLowerCase() !== email || user.is_demo_account ||
      !user.is_active || user.deleted_at ||
      (user.google_subject !== null && user.google_subject !== subject)) {
    return null;
  }
  const roleCodes = await loginRoles(connection, user.user_id, true);
  if (!roleCodes.length) return null;
  if (user.google_subject === null) {
    await connection.query('UPDATE USERS SET google_subject = ? WHERE user_id = ?', [subject, user.user_id]);
  }
  return { user, roleCodes };
}
