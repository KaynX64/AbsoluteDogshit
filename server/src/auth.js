// server/src/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { logAudit } from './utils/auditLogger.js';
import { JWT_SECRET } from './utils/secrets.js';
import { redis, isRedisActive } from './utils/redisClient.js';
import { LOGIN_LIMIT } from './config/limits.js';
import crypto from 'crypto';
import { evaluatePasswordStrength } from './utils/passwordPolicy.js';
import { resolveAdminPermissions } from './middleware/rbac.js';

// S-09: Pre-computed dummy hash to prevent user-enumeration timing attacks.
// bcrypt.compare against this hash takes the same ~100ms as a real check,
// so an attacker cannot measure response latency to detect registered emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-valetudo-2026', 10);

// ─────────────────────────────────────────────────────────────────────────
// PER-ACCOUNT UI THEME (Stage 7) — single server-side whitelist.
// Mirrors desktop/src/theme/presets.ts (THEME_MODES / THEME_PRESETS).
// Every write path (routes/profile.js PUT /theme) and read path (login
// response below) validates against these sets.
// ─────────────────────────────────────────────────────────────────────────
export const THEME_MODES = new Set(['light', 'dark']);
export const THEME_PRESETS = new Set(['brand', 'blossom', 'sunrise']);

// ─────────────────────────────────────────────────────────────────────────
// RATE LIMITING (brute-force protection on the login endpoint)
// Values come from server/src/config/limits.js
// ─────────────────────────────────────────────────────────────────────────
function loginRateLimitKey(ip) {
  return `ratelimit:login:${ip}`;
}

// ── SEC-05 Remediation: in-memory fallback counter ──────────────────────
// Redis is the primary (distributed) counter. When the cache layer is
// unavailable or fails mid-request, this process-local Map takes over —
// mirroring the verifyRateLimit pattern in routes/documents.js — so the
// login guard NEVER fails open. (Previously `if (!isRedisActive()) return
// next();` allowed unlimited credential stuffing during Redis outages.)
const loginMemoryHits = new Map();

export async function loginRateLimit(req, res, next) {
  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const key = loginRateLimitKey(ip);

  // ── Primary: distributed Redis counter ────────────────────────────────
  if (isRedisActive()) {
    try {
      const count = await redis.incr(key);

      // First hit in this window — start the TTL clock
      if (count === 1) {
        await redis.expire(key, LOGIN_LIMIT.windowSeconds);
      }

      if (count > LOGIN_LIMIT.maxAttempts) {
        const ttl = await redis.ttl(key);
        const retrySec = ttl > 0 ? ttl : LOGIN_LIMIT.windowSeconds;
        const minutesLeft = Math.max(1, Math.ceil(retrySec / 60));

        res.setHeader('Retry-After', String(retrySec));
        return res.status(429).json({
          error: `Too many login attempts. Please wait ${minutesLeft} minute(s) before trying again.`,
        });
      }

      res.setHeader(
        'X-RateLimit-Remaining',
        String(Math.max(0, LOGIN_LIMIT.maxAttempts - count))
      );
      return next();
    } catch (err) {
      // Redis threw mid-request — fall through to the in-memory counter
      // below instead of skipping the guard (SEC-05: never fail open).
      console.error('[Rate Limit Error]:', err.message);
    }
  }

  // ── Fallback: process-local fixed-window counter (SEC-05) ─────────────
  const now = Date.now();
  let entry = loginMemoryHits.get(ip);
  if (!entry || entry.resetAt <= now) {
    entry = { count: 0, resetAt: now + LOGIN_LIMIT.windowSeconds * 1000 };
    loginMemoryHits.set(ip, entry);
  }
  entry.count += 1;

  // Bound the map so spoofed-IP floods cannot grow it without limit
  // (same hygiene as verifyRateLimit in documents.js).
  if (loginMemoryHits.size > 5000) {
    for (const [k, v] of loginMemoryHits) {
      if (v.resetAt <= now) loginMemoryHits.delete(k);
    }
  }

  if (entry.count > LOGIN_LIMIT.maxAttempts) {
    const retrySec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
    const minutesLeft = Math.max(1, Math.ceil(retrySec / 60));

    res.setHeader('Retry-After', String(retrySec));
    return res.status(429).json({
      error: `Too many login attempts. Please wait ${minutesLeft} minute(s) before trying again.`,
    });
  }

  res.setHeader(
    'X-RateLimit-Remaining',
    String(Math.max(0, LOGIN_LIMIT.maxAttempts - entry.count))
  );
  next();
}

// Clears the IP's attempt counter after a successful login so that
// someone who mistyped a few passwords and finally got in starts fresh.
async function clearLoginAttempts(ip) {
  if (isRedisActive()) {
    try {
      await redis.del(loginRateLimitKey(ip));
    } catch (_) {}
  }
  // SEC-05: also clear the in-memory fallback counter, whichever track
  // the failed attempts were counted on.
  loginMemoryHits.delete(ip);
}

// ─────────────────────────────────────────────────────────────────────────
// LOGIN
// ─────────────────────────────────────────────────────────────────────────
export async function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
    // 1. Fetch user by email (regardless of active status to perform post-auth checks)
    const [users] = await pool.query(
      'SELECT * FROM USERS WHERE LOWER(email) = ?',
      [normalizedEmail]
    );

    // =========================================================================
    // PHASE 1: PRE-AUTHENTICATION (Zero Information Leakage)
    // =========================================================================

    // Scenario A: Email does not exist
    if (users.length === 0) {
      // Run dummy compare so response time is identical to a real password check
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid institutional email or password.' });
    }

    const user = users[0];

    // Scenario B: Password incorrect
    const isMatch = await bcrypt.compare(password, user.password_hash);

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid institutional email or password.' });
    }

    // =========================================================================
    // PHASE 2: POST-AUTHENTICATION (User proved identity, safe to give status)
    // =========================================================================

    // Scenario C: Account archived/soft-deleted
    if (user.deleted_at !== null) {
      return res.status(403).json({
        error: 'Account record is archived. Please contact the campus administrator.',
      });
    }

    // Scenario D: Account suspended/deactivated
    if (!Boolean(user.is_active)) {
      return res.status(403).json({
        error: 'Account suspended. Please visit the campus infirmary to reactivate access.',
      });
    }

    // 2. Fetch user's assigned roles
    const [roles] = await pool.query(
      `SELECT r.code, r.name
       FROM ROLES r
       INNER JOIN USER_ROLES ur ON r.role_id = ur.role_id
       WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const roleCodes = roles.map((r) => r.code);

    // Scenario E: Valid account, but no role linked
    if (roleCodes.length === 0) {
      return res.status(403).json({
        error: 'No active role assigned to this account. Please contact PSU IT Administrator.',
      });
    }

    // ── Admin archetype permissions (additive — ADMIN accounts only) ──────
    // Non-admin roles get `permissions: null` and are completely unaffected.
    // A failure here must never block a login: fall back to full access.
    let adminPermissions = null;
    if (roleCodes.includes('ADMIN')) {
      try {
        const state = await resolveAdminPermissions(user.user_id);
        adminPermissions = {
          archetype: state.isSuper ? 'super' : 'limited',
          is_super: state.isSuper,
          permissions: state.codes,
        };
      } catch (permErr) {
        console.error('[Login Permission Warning]:', permErr.message);
        adminPermissions = { archetype: 'super', is_super: true, permissions: ['SUPER_ADMIN'] };
      }
    }

    // 3. Issue JWT Token (Valid 24 hours) with unique JTI for Redis revocation tracking
    const jti = crypto.randomUUID();
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        roles: roleCodes,
        jti,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 4. Record to R.A. 10173 Immutable Audit Ledger
    const connection = await pool.getConnection();
    try {
      await logAudit(connection, {
        userId: user.user_id,
        action: 'LOGIN',
        table: 'AUTH_SESSIONS',
        recordId: user.user_id,
        oldValue: null,
        newValue: { email: user.email, roles: roleCodes },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      console.error('[Auth Audit Warning]:', auditErr.message);
    } finally {
      connection.release();
    }

    // Successful login — reset the rate-limit counter for this IP
    await clearLoginAttempts(req.ip || req.socket?.remoteAddress || 'unknown');

    return res.json({
      message: 'Login successful',
      token,
      user: {
        user_id: user.user_id,
        email: user.email,
        first_name: user.first_name,
        last_name: user.last_name,
        roles: roleCodes,
        permissions: adminPermissions,
        // UI hint ONLY — never used for authorization. SOS access is always
        // resolved live from the database (the 24h JWT would go stale).
        is_qualified_responder: Boolean(user.is_qualified_responder),
        // Per-account UI theme (Stage 7). Clamped against the whitelist so
        // a manually-edited DB row can never push an invalid value to
        // clients — unknown/NULL falls back to the defaults (light/brand).
        theme_mode: THEME_MODES.has(user.theme_mode) ? user.theme_mode : 'light',
        theme_preset: THEME_PRESETS.has(user.theme_preset) ? user.theme_preset : 'brand',
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

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
  // issueAttachmentDownloadToken() below instead of the primary JWT.
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, async (err, user) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid.' });

    // Check Redis revocation blocklist
    if (isRedisActive()) {
      try {
        const blacklistKey = user.jti
          ? `token:blacklist:${user.jti}`
          : `token:blacklist:${token}`;
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
      const [accountRows] = await pool.query(
        'SELECT is_active, deleted_at FROM USERS WHERE user_id = ?',
        [user.user_id]
      );
      if (accountRows.length === 0 || !accountRows[0].is_active || accountRows[0].deleted_at) {
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

// ─────────────────────────────────────────────────────────────────────────
// CHANGE PASSWORD
// ─────────────────────────────────────────────────────────────────────────
export async function changePassword(req, res) {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  try {
    // Pull identity context so the policy can reject passwords containing
    // the user's own email handle, first name, last name, or student number.
    const [users] = await pool.query(
      `SELECT u.password_hash, u.email, u.first_name, u.last_name,
              sp.student_no
       FROM USERS u
       LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
       WHERE u.user_id = ? AND u.deleted_at IS NULL`,
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = users[0];

    // ── Server-side password policy enforcement ──────────────────────
    const strength = evaluatePasswordStrength(newPassword, {
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      studentNo: user.student_no,
    });

    if (!strength.isValid) {
      return res.status(400).json({
        error: 'Password does not meet security requirements.',
        code: 'WEAK_PASSWORD',
        score: strength.score,
        label: strength.label,
        issues: strength.issues,
        requirements: [
          'At least 8 characters long',
          'Contains an uppercase and lowercase letter',
          'Contains a number',
          'Contains a symbol (!@#$%^&*…)',
          'Does not contain your name, email, or ID number',
        ],
      });
    }

    // ── Verify current password ─────────────────────────────────────
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    // Prevent trivial rotation (new == old)
    if (await bcrypt.compare(newPassword, user.password_hash)) {
      return res.status(400).json({
        error: 'New password must be different from your current password.',
      });
    }

    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE USERS SET password_hash = ? WHERE user_id = ?', [newHash, userId]);

    // Invalidate current JWT in Redis so caller is forced to re-authenticate with new credentials
    if (req.user && isRedisActive()) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = req.user.exp ? Math.max(req.user.exp - now, 60) : 86400;
      const blacklistKey = req.user.jti
        ? `token:blacklist:${req.user.jti}`
        : `token:blacklist:${req.token}`;
      await redis
        .set(blacklistKey, 'revoked_password_change', 'EX', remainingSeconds)
        .catch(() => {});
    }

    const connection = await pool.getConnection();
    try {
      await logAudit(connection, {
        userId,
        action: 'UPDATE',
        table: 'USERS',
        recordId: userId,
        oldValue: null,
        newValue: {
          event: 'PASSWORD_CHANGED_BY_USER',
          strength_label: strength.label,
          strength_score: strength.score,
        },
        ipAddress: req.ip,
      });
    } finally {
      connection.release();
    }

    res.json({ message: 'Password updated successfully.' });
  } catch (error) {
    console.error('[Change Password Error]:', error);
    res.status(500).json({ error: 'Failed to update password.' });
  }
}

// ─────────────────────────────────────────────────────────────────────────
// LOGOUT & SESSION TERMINATION
// ─────────────────────────────────────────────────────────────────────────
export async function logoutUser(req, res) {
  try {
    const user = req.user;
    const token = req.token;

    // Invalidate token in Redis until its natural expiration
    if (user && isRedisActive()) {
      const now = Math.floor(Date.now() / 1000);
      const remainingSeconds = user.exp ? Math.max(user.exp - now, 60) : 86400;
      const blacklistKey = user.jti
        ? `token:blacklist:${user.jti}`
        : `token:blacklist:${token}`;
      await redis.set(blacklistKey, 'revoked_logout', 'EX', remainingSeconds);
    }

    // ── Logout must release the device's FCM token ─────────────────────
    // Optional fcm_token in the body (backward compatible when absent —
    // older clients simply keep their push registration). Deleting the row
    // stops push delivery to a device the user has signed out of; without
    // it a handed-down phone would keep receiving SOS pushes forever.
    const { fcm_token } = req.body || {};
    if (fcm_token && typeof fcm_token === 'string' && fcm_token.trim()) {
      try {
        await pool.query('DELETE FROM DEVICE_TOKENS WHERE user_id = ? AND fcm_token = ?', [
          user.user_id,
          fcm_token.trim(),
        ]);
      } catch (tokErr) {
        console.error('[Logout Token Cleanup Warning]:', tokErr.message);
      }
    }

    // Record session termination to R.A. 10173 Audit Ledger
    const connection = await pool.getConnection();
    try {
      await logAudit(connection, {
        userId: user?.user_id || null,
        action: 'UPDATE',
        table: 'AUTH_SESSIONS',
        recordId: user?.user_id || null,
        oldValue: null,
        newValue: { event: 'USER_LOGOUT_SESSION_TERMINATED', email: user?.email },
        ipAddress: req.ip,
      });
    } catch (auditErr) {
      console.error('[Logout Audit Warning]:', auditErr.message);
    } finally {
      connection.release();
    }

    res.json({ message: 'Session terminated and token invalidated successfully.' });
  } catch (error) {
    console.error('[Logout Error]:', error);
    res.status(500).json({ error: 'Failed to process session logout.' });
  }
}
