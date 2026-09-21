// server/src/routes/audit.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';

const router = express.Router();

// GET /api/audit - Fetch live cryptographic audit logs for Admin Console
router.get('/', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT a.audit_id AS id, 
              COALESCE(u.email, 'System / Automated') AS user, 
              a.action, 
              CONCAT(a.table_affected, ' #', COALESCE(a.record_id, 0)) AS target, 
              a.entry_hash AS hash, 
              a.created_at AS time 
       FROM AUDIT_LOGS a 
       LEFT JOIN USERS u ON a.user_id = u.user_id 
       ORDER BY a.audit_id DESC 
       LIMIT 50`
    );
    res.json(logs);
  } catch (error) {
    console.error('[Audit] Fetch error:', error);
    res.status(500).json({ error: 'Failed to retrieve audit logs.' });
  }
});

export default router;