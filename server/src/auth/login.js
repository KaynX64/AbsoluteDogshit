// Rate-limits sign-in attempts, verifies credentials, and issues session tokens.

import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from '../db/pool.js';
import { logAudit } from '../utils/auditLogger.js';
import { JWT_SECRET } from '../utils/secrets.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { getServerPolicy } from '../config/serverPolicy.js';
import crypto from 'crypto';
import { resolveAdminPermissions } from '../middleware/rbac.js';
import { THEME_MODES, THEME_PRESETS } from '../config/themePreferences.js';

// S-09: Pre-computed dummy hash to prevent user-enumeration timing attacks.
// bcrypt.compare against this hash takes the same ~100ms as a real check,
// so an attacker cannot measure response latency to detect registered emails.
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-valetudo-2026', 10);

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
// mirroring the verifyRateLimit pattern in routes/documents/verification/public.js — so the
// login guard NEVER fails open. (Previously `if (!isRedisActive()) return
// next();` allowed unlimited credential stuffing during Redis outages.)
const loginMemoryHits = new Map();

export async function loginRateLimit(req, res, next) {
  const { login: LOGIN_LIMIT } = getServerPolicy().limits;
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
