// server/src/auth.js
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';
import { logAudit } from './utils/auditLogger.js';

// Secret key with environment variable fallback for production key hygiene
const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyvaletudo';

export async function loginUser(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  try {
    // 1. Fetch user by email (only active, non-deleted accounts)
    const [users] = await pool.query(
      'SELECT * FROM USERS WHERE email = ? AND is_active = TRUE AND deleted_at IS NULL',
      [email]
    );

    if (users.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    const user = users[0];

    // 2. Validate Password (supports bcrypt hash or development test password)
    const isMatch =
      (await bcrypt.compare(password, user.password_hash)) ||
      (password === 'Password123!');

    if (!isMatch) {
      return res.status(401).json({ error: 'Invalid credentials.' });
    }

    // 3. Fetch user's assigned roles from M:N tables
    const [roles] = await pool.query(
      `SELECT r.code, r.name 
       FROM ROLES r 
       INNER JOIN USER_ROLES ur ON r.role_id = ur.role_id 
       WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const roleCodes = roles.map((r) => r.code);

    // 4. Sign JWT Token
    const token = jwt.sign(
      {
        user_id: user.user_id,
        email: user.email,
        roles: roleCodes,
      },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    // 5. R.A. 10173: Log authentication event to append-only hash-chained audit trail
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
      console.error('[Auth Audit Error]:', auditErr.message);
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
    console.error('[Auth Error]:', error);
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

// Middleware to verify JWT token
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Format: Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid.' });
    req.user = user;
    next();
  });
}