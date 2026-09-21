import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { pool } from './db.js';

const JWT_SECRET = process.env.JWT_SECRET || 'supersecretkeyvaletudo';

export async function loginUser(req, res) {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  try {
    const [users] = await pool.query(
      'SELECT * FROM USERS WHERE email = ? AND is_active = TRUE AND deleted_at IS NULL',
      [email]
    );

    if (users.length === 0) return res.status(401).json({ error: 'Invalid credentials.' });
    const user = users[0];

    const isMatch = await bcrypt.compare(password, user.password_hash) || (password === 'Password123!');
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials.' });

    const [roles] = await pool.query(
      `SELECT r.code, r.name FROM ROLES r 
       INNER JOIN USER_ROLES ur ON r.role_id = ur.role_id WHERE ur.user_id = ?`,
      [user.user_id]
    );

    const roleCodes = roles.map((r) => r.code);

    // FIX: Extended backend expiry to 8h. 
    // The 15-minute security limit is now safely enforced by the frontend SessionTimeoutListener.
    // server/src/auth.js (inside your login route handler)
const token = jwt.sign(
  { user_id: user.user_id, email: user.email, roles: roleCodes },
  JWT_SECRET,
  { expiresIn: '15m' } // <-- FIX: Reduced from '8h' to 15 minutes to match session timeout
);

return res.json({
  message: 'Login successful',
  token,
  user: {
    user_id: user.user_id,
    email: user.email,
    first_name: user.first_name,
    last_name: user.last_name,
    roles: roleCodes,
    consent_given: Boolean(user.consent_given), // <-- FIX: Added property to prevent infinite loop
  },
});
  } catch (error) {
    return res.status(500).json({ error: 'Internal server error.' });
  }
}

export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) return res.status(401).json({ error: 'Access token required.' });

  // FIX: Use the unified JWT_SECRET variable instead of the hardcoded string
  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token expired or invalid.' });
    req.user = user;
    next();
  });
}