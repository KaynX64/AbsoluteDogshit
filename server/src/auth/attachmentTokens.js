// Issues and verifies short-lived, single-use browser download tokens bound to individual attachments.

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import crypto from 'crypto';
import { authenticateToken } from './middleware.js';

// ─────────────────────────────────────────────────────────────────────────
// SEC-06: SINGLE-USE, SHORT-LIVED DOWNLOAD TOKENS
// ─────────────────────────────────────────────────────────────────────────
// External-browser downloads cannot set Authorization headers, which is why
// the server previously accepted the primary 24-hour JWT via ?token=. To
// close that leak (SEC-06) without breaking the patient "Open & View File"
// flow, this issues a dedicated token that is:
//   • valid for 60 seconds only,
//   • bound to exactly one attachment id and one user,
//   • single-use (replayed tokens are rejected),
//   • distinct from the primary authentication JWT (dedicated purpose claim),
//     so even if it leaks into a URL log it is worthless.
const DOWNLOAD_TOKEN_TTL_SECONDS = 60;
const DOWNLOAD_TOKEN_PURPOSE = 'EMR_ATTACHMENT_DOWNLOAD';

export function issueAttachmentDownloadToken(user, attachmentId) {
  return jwt.sign(
    {
      purpose: DOWNLOAD_TOKEN_PURPOSE,
      user_id: user.user_id,
      roles: user.roles || [],
      att: Number(attachmentId),
      jti: crypto.randomUUID(),
    },
    JWT_SECRET,
    { expiresIn: DOWNLOAD_TOKEN_TTL_SECONDS }
  );
}

// Single-use tracking: Redis SET NX EX when available, process-local Map as
// fallback — the same degraded-mode philosophy as the login limiter (SEC-05).
const usedDownloadTokens = new Map();

async function isDownloadTokenReplayed(jti, expiresAtSeconds) {
  const nowMs = Date.now();

  // Opportunistic hygiene: purge expired entries when the map grows.
  if (usedDownloadTokens.size > 5000) {
    for (const [k, v] of usedDownloadTokens) {
      if (v <= nowMs) usedDownloadTokens.delete(k);
    }
  }

  if (isRedisActive()) {
    try {
      // SET key 1 NX EX ttl → returns 'OK' only on first use.
      const key = `download:token:used:${jti}`;
      const ttl = Math.max(1, expiresAtSeconds - Math.floor(nowMs / 1000));
      const result = await redis.set(key, '1', 'EX', ttl, 'NX');
      return result !== 'OK'; // key already present → replay
    } catch (err) {
      console.error('[Download Token Replay Check Warning]:', err.message);
      // Fall through to the in-memory check — do not fail open.
    }
  }

  if (usedDownloadTokens.has(jti)) return true;
  usedDownloadTokens.set(jti, expiresAtSeconds * 1000);
  return false;
}

/**
 * Middleware for GET /api/documents/attachments/:attachmentId/download.
 * Accepts EITHER:
 *   • Authorization: Bearer <primary JWT>  — normal API clients, or
 *   • ?dlToken=<single-use 60s download token> — external-browser downloads.
 * The route's pre-existing ownership / clinical-role authorization runs
 * unchanged for both paths.
 */
export async function authenticateAttachmentDownload(req, res, next) {
  const authHeader = req.headers['authorization'];

  // Path 1: standard header authentication — reuse the normal verifier.
  const headerToken = authHeader && authHeader.split(' ')[1];
  if (headerToken) {
    return authenticateToken(req, res, next);
  }

  // Path 2: dedicated short-lived single-use download token (SEC-06).
  const dlToken = req.query.dlToken;
  if (!dlToken) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  let payload;
  try {
    payload = jwt.verify(dlToken, JWT_SECRET); // synchronous form — throws on failure
  } catch (err) {
    return res
      .status(401)
      .json({ error: 'Download token expired or invalid. Please reopen the file from the app.' });
  }

  if (payload.purpose !== DOWNLOAD_TOKEN_PURPOSE) {
    return res.status(401).json({ error: 'Invalid download token.' });
  }

  // The token is bound to exactly one attachment.
  if (Number(payload.att) !== Number(req.params.attachmentId)) {
    return res.status(403).json({ error: 'Download token is not valid for this file.' });
  }

  // Enforce single use (replay protection).
  const replayed = await isDownloadTokenReplayed(payload.jti, payload.exp);
  if (replayed) {
    return res
      .status(401)
      .json({ error: 'Download token already used. Please reopen the file from the app.' });
  }

  // Reconstruct the caller identity so the route's existing
  // owner / clinical-role authorization runs unchanged.
  req.user = { user_id: payload.user_id, roles: payload.roles || [] };
  req.token = dlToken;
  next();
}
