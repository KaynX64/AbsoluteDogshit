import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { logAudit } from './utils/auditLogger.js';
<<<<<<< Updated upstream
=======
import { JWT_SECRET } from './utils/secrets.js';

// S-09: Pre-computed dummy hash with work factor 10 to equalize server response time
// Prevents attackers from measuring response latency to detect registered emails
const DUMMY_HASH = bcrypt.hashSync('timing-equalizer-valetudo-2026', 10);
>>>>>>> Stashed changes

export async function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();

  try {
<<<<<<< Updated upstream
    // 1. Fetch user by email
=======
    // 1. Fetch user by email (regardless of active status to perform post-auth checks)
>>>>>>> Stashed changes
    const [users] = await pool.query(
      'SELECT * FROM USERS WHERE LOWER(email) = ?',
      [normalizedEmail]
    );

<<<<<<< Updated upstream
    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
=======
    // =========================================================================
    // PHASE 1: PRE-AUTHENTICATION (Zero Information Leakage)
    // =========================================================================
    
    // Scenario A: Email does not exist
    if (users.length === 0) {
      // Run dummy compare so response time is identical to a real password check
      await bcrypt.compare(password, DUMMY_HASH);
      return res.status(401).json({ error: 'Invalid institutional email or password.' });
>>>>>>> Stashed changes
    }

    const user = users[0];

<<<<<<< Updated upstream
    // 2. Validate Password (supports testing with fallback password)
    const isMatch = await bcrypt.compare(password, user.password_hash) || (password === 'Password123!');
=======
    // Verify Password
    const isMatch = await bcrypt.compare(password, user.password_hash);

    // Scenario B: Password incorrect
>>>>>>> Stashed changes
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

<<<<<<< Updated upstream
    // 4. Inside server/src/auth.js (around line 43)
=======
    // Scenario E: Valid account, but no role linked
    if (roleCodes.length === 0) {
      return res.status(403).json({
        error: 'No active role assigned to this account. Please contact PSU IT Administrator.',
      });
    }

    // 3. Issue JWT Token (Valid 24 hours)
>>>>>>> Stashed changes
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        roles: roleCodes,
      },
      'supersecretkeyvaletudo', // <-- Hardcode the secret directly here
      { expiresIn: '24h' }
    );

<<<<<<< Updated upstream
    // RA 10173: Log authentication event to hash-chained audit trail
=======
    // 4. Record to R.A. 10173 Immutable Audit Ledger
>>>>>>> Stashed changes
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
<<<<<<< Updated upstream
      console.error('Login audit failed:', auditErr.message);
=======
      console.error('[Auth Audit Warning]:', auditErr.message);
>>>>>>> Stashed changes
    } finally {
      connection.release();
    }

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

// Middleware to verify JWT
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  // Updated to use the hardcoded secret
  jwt.verify(token, 'supersecretkeyvaletudo', (err, user) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid.' });
    req.user = user;
    next();
  });
<<<<<<< Updated upstream
=======
}

// Handler for user password changes
export async function changePassword(req, res) {
  const userId = req.user.user_id;
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Current password and new password are required.' });
  }

  if (newPassword.length < 8) {
    return res.status(400).json({ error: 'New password must be at least 8 characters long.' });
  }

  try {
    const [users] = await pool.query(
      'SELECT password_hash FROM USERS WHERE user_id = ? AND deleted_at IS NULL',
      [userId]
    );

    if (users.length === 0) {
      return res.status(404).json({ error: 'User not found.' });
    }

    const user = users[0];

    // Cleaned up bcrypt comparison
    const isMatch = await bcrypt.compare(currentPassword, user.password_hash);

    if (!isMatch) {
      return res.status(400).json({ error: 'Incorrect current password.' });
    }

    // Generate new bcrypt hash
    const newHash = await bcrypt.hash(newPassword, 10);
    await pool.query('UPDATE USERS SET password_hash = ? WHERE user_id = ?', [newHash, userId]);

    // R.A. 10173 Audit logging
    const connection = await pool.getConnection();
    try {
      await logAudit(connection, {
        userId,
        action: 'UPDATE',
        table: 'USERS',
        recordId: userId,
        oldValue: null,
        newValue: { event: 'PASSWORD_CHANGED_BY_USER' },
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
>>>>>>> Stashed changes
}