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

export async function loginRateLimit(req, res, next) {
  // If the cache layer is unavailable, skip the guard entirely
  if (!isRedisActive()) return next();

  const ip = req.ip || req.socket?.remoteAddress || 'unknown';
  const key = loginRateLimitKey(ip);

  try {
    const count = await redis.incr(key);

    // First hit in this window — start the TTL clock
    if (count === 1) {
      await redis.expire(key, LOGIN_LIMIT.windowSeconds);
    }

    if (count > LOGIN_LIMIT.maxAttempts) {
      const ttl = await redis.ttl(key);
      const minutesLeft = Math.max(
        1,
        Math.ceil((ttl > 0 ? ttl : LOGIN_LIMIT.windowSeconds) / 60)
      );

      res.setHeader('Retry-After', String(ttl > 0 ? ttl : LOGIN_LIMIT.windowSeconds));
      return res.status(429).json({
        error: `Too many login attempts. Please wait ${minutesLeft} minute(s) before trying again.`,
      });
    }

    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, LOGIN_LIMIT.maxAttempts - count))
    );
    next();
  } catch (err) {
    // If Redis throws mid-request, don't block a legitimate login
    console.error('[Rate Limit Error]:', err.message);
    next();
  }
}

// Clears the IP's attempt counter after a successful login so that
// someone who mistyped a few passwords and finally got in starts fresh.
async function clearLoginAttempts(ip) {
  if (!isRedisActive()) return;
  try {
    await redis.del(loginRateLimitKey(ip));
  } catch (_) {}
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
  // Support both HTTP Authorization header and URL query parameter (?token=...)
  const token = (authHeader && authHeader.split(' ')[1]) || req.query.token;

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

    req.user = user;
    req.token = token;
    next();
  });
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