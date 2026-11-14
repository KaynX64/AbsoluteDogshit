// Authenticates HTTP requests and checks token revocation and active account status.

import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { isSessionAccountActive, sessionBlocklistKey } from './session.js';

// ─────────────────────────────────────────────────────────────────────────
// TOKEN MIDDLEWARE
// ─────────────────────────────────────────────────────────────────────────
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  // ── SEC-06 Remediation ──
  // Bearer tokens are accepted ONLY from the Authorization header. The
  // previous `|| req.query.token` fallback leaked long-lived (24h) JWTs into
  // browser histories, bookmarks, proxy/load-balancer access logs, and
  // Referer headers. Browser-initiated file downloads use the dedicated
  // single-use, 60-second download tokens issued by
  // issueAttachmentDownloadToken() in attachmentTokens.js instead of the primary JWT.
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid.' });

    // Check Redis revocation blocklist
    if (isRedisActive()) {
      try {
        const blacklistKey = sessionBlocklistKey(user, token);
        const isRevoked = await redis.get(blacklistKey);
        if (isRevoked) {
          return res.status(401).json({
            error: 'TOKEN_REVOKED',
            message: 'Session has been invalidated. Please log in again.',
          });
        }
      } catch (redisErr) {
        console.error('[Token Revocation Check Warning]:', redisErr.message);
      }
    }

    try {
      if (!(await isSessionAccountActive(user.user_id))) {
        return res.status(401).json({
          error: 'ACCOUNT_INACTIVE',
          message: 'This account is no longer active. Please contact an administrator.',
        });
      }
    } catch (accountErr) {
      console.error('[Account Status Check Error]:', accountErr.message);
      return res.status(503).json({ error: 'Account status could not be verified.' });
    }

    req.user = user;
    req.token = token;
    next();
  });
}
