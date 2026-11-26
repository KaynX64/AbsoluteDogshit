import { OAuth2Client } from 'google-auth-library';
import { inTransaction } from '../db/transaction.js';
import { completeLogin } from './login.js';

const INSTITUTION_DOMAIN = 'psu.edu.ph';
const googleClient = new OAuth2Client();

export function verifiedPsuIdentity(claims) {
  const email = typeof claims?.email === 'string' ? claims.email.toLowerCase() : '';
  if (claims?.email_verified !== true || claims.hd !== INSTITUTION_DOMAIN ||
      !/^[^\s@]+@psu\.edu\.ph$/.test(email) || email.trim() !== email ||
      typeof claims.sub !== 'string' || !claims.sub || claims.sub.length > 255 ||
      /[^\x21-\x7e]/.test(claims.sub)) {
    return null;
  }
  return { email, subject: claims.sub };
}

// Bind the verified Google account once, while holding the local account row lock.
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
  if (user.google_subject === null) {
    await connection.query('UPDATE USERS SET google_subject = ? WHERE user_id = ?', [subject, user.user_id]);
  }
  return user;
}

export async function loginMobileGoogle(req, res) {
  const audience = process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  if (!audience) return res.status(503).json({ error: 'PSU Google sign-in is unavailable. Contact the clinic administrator.' });

  const { idToken } = req.body ?? {};
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 8192) {
    return res.status(400).json({ error: 'A Google ID token is required.' });
  }

  let ticket;
  try {
    ticket = await googleClient.verifyIdToken({ idToken, audience });
  } catch {
    return res.status(401).json({ error: 'Your Google sign-in could not be verified. Please try again.' });
  }
  const identity = verifiedPsuIdentity(ticket.getPayload());
  if (!identity) return res.status(403).json({ error: 'Sign in with your official @psu.edu.ph Google Workspace account.' });

  const denied = () => res.status(403).json({ error: 'No eligible HealthLink account is linked to this PSU sign-in. Contact the campus infirmary.' });
  try {
    const user = await inTransaction(connection => bindGoogleAccount(connection, identity), { retries: 1 });
    if (!user) return denied();
    return await completeLogin(req, res, user, 'mobile_google');
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return denied();
    console.error('[Google Login Error]:', error.code || error.name);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
