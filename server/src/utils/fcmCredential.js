// Adapts a Google service account to Firebase's scoped OAuth credential interface.

import { createPrivateKey } from 'node:crypto';
import { JWT } from 'google-auth-library';

export function createFcmAppOptions(account) {
  if (!account || typeof account !== 'object' || Array.isArray(account)
    || (account.type !== undefined && account.type !== 'service_account')) {
    throw new Error('Expected a Firebase service-account credential.');
  }

  const projectId = account.project_id ?? account.projectId;
  const email = account.client_email ?? account.clientEmail;
  const key = account.private_key ?? account.privateKey;
  if (typeof projectId !== 'string' || !projectId.trim()
    || typeof email !== 'string' || !email.trim() || typeof key !== 'string' || !key.trim()) {
    throw new Error('Firebase service account is missing its project ID, email, or private key.');
  }

  try {
    if (createPrivateKey(key).asymmetricKeyType !== 'rsa') throw new Error();
  } catch {
    throw new Error('Firebase service account requires a valid RSA private key.');
  }

  const client = new JWT({
    email: email.trim(),
    key,
    scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
  });

  return {
    projectId: projectId.trim(),
    credential: {
      async getAccessToken() {
        const { token } = await client.getAccessToken();
        const expiresIn = Math.floor((client.credentials.expiry_date - Date.now()) / 1000);
        if (!token || !Number.isFinite(expiresIn) || expiresIn <= 0) {
          throw new Error('Google returned an invalid FCM access token or expiry.');
        }
        return { access_token: token, expires_in: expiresIn };
      },
    },
  };
}
