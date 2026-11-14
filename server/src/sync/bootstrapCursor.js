// Signs and validates desktop bootstrap cursors bound to the authenticated account.

import { createHmac, timingSafeEqual } from 'node:crypto';
import { JWT_SECRET } from '../utils/secrets.js';

function signature(payload) {
  return createHmac('sha256', JWT_SECRET).update('offline-bootstrap-v1:').update(payload).digest();
}

export function encodeBootstrapCursor(scan, userId) {
  const payload = Buffer.from(JSON.stringify({ scan, userId: String(userId) })).toString('base64url');
  return payload + '.' + signature(payload).toString('base64url');
}

export function decodeBootstrapCursor(token, userId) {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, digest, extra] = token.split('.');
  if (!payload || !digest || extra !== undefined) return null;
  const expected = signature(payload);
  const supplied = Buffer.from(digest, 'base64url');
  if (supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return null;

  try {
    const cursor = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return cursor.userId === String(userId) ? cursor.scan : null;
  } catch {
    return null;
  }
}
