import { OAuth2Client } from 'google-auth-library';

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

export function googleAudience() {
  return process.env.GOOGLE_OAUTH_CLIENT_ID?.trim();
}

export async function verifyGoogleIdentity(idToken, audience) {
  const ticket = await googleClient.verifyIdToken({ idToken, audience });
  return verifiedPsuIdentity(ticket.getPayload());
}
