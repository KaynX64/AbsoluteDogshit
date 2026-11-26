import { inTransaction } from '../../db/transaction.js';
import { completeLogin } from '../login.js';
import { bindGoogleAccount } from './googleAccount.js';
import { googleAudience, verifyGoogleIdentity } from './googleIdentity.js';

export async function loginMobileGoogle(req, res) {
  const audience = googleAudience();
  if (!audience) return res.status(503).json({ error: 'PSU Google sign-in is unavailable. Contact the clinic administrator.' });

  const { idToken } = req.body ?? {};
  if (typeof idToken !== 'string' || idToken.length === 0 || idToken.length > 8192) {
    return res.status(400).json({ error: 'A Google ID token is required.' });
  }

  let identity;
  try {
    identity = await verifyGoogleIdentity(idToken, audience);
  } catch {
    return res.status(401).json({ error: 'Your Google sign-in could not be verified. Please try again.' });
  }
  if (!identity) return res.status(403).json({ error: 'Sign in with your official @psu.edu.ph Google Workspace account.' });

  const denied = () => res.status(403).json({ error: 'No eligible HealthLink account is linked to this PSU sign-in. Contact the campus infirmary.' });
  try {
    const account = await inTransaction(connection => bindGoogleAccount(connection, identity), { retries: 1 });
    if (!account) return denied();
    return await completeLogin(req, res, account.user, 'mobile_google', account.roleCodes);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') return denied();
    console.error('[Google Login Error]:', error.code || error.name);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}
