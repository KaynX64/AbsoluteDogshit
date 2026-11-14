// Validates password changes, updates the credential, and attempts to revoke the current session.

import bcrypt from 'bcryptjs';
import { pool } from '../db/pool.js';
import { logAudit } from '../utils/auditLogger.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { evaluatePasswordStrength } from '../utils/passwordPolicy.js';
import { sessionBlocklistKey } from './session.js';

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
      const blacklistKey = sessionBlocklistKey(req.user, req.token);
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
