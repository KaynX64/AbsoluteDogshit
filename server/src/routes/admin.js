// server/src/routes/admin.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { logAudit } from '../utils/auditLogger.js';
import { isRedisActive } from '../utils/redisClient.js';

const router = express.Router();

router.use(authenticateToken, requireRoles('ADMIN'));

// 1. GET /api/admin/users - User Accounts & RBAC Roles list
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query(
      `SELECT u.user_id as id,
              CONCAT(u.first_name, ' ', u.last_name) as name,
              u.email,
              u.phone,
              COALESCE(r.code, 'STUDENT') as role,
              CASE WHEN u.is_active = TRUE THEN 'Active' ELSE 'Suspended' END as status,
              u.created_at
       FROM USERS u
       LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       WHERE u.deleted_at IS NULL
       ORDER BY u.user_id ASC`
    );
    res.json(users);
  } catch (error) {
    console.error('Failed to retrieve system users:', error);
    res.status(500).json({ error: 'Failed to retrieve system users.' });
  }
});

// 2. GET /api/admin/phi-access-logs - PHI Surveillance Log
router.get('/phi-access-logs', async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT p.access_id as id,
              CONCAT(v.first_name, ' ', v.last_name) as viewer_name,
              v.email as viewer_email,
              COALESCE(r.code, 'STAFF') as viewer_role,
              CONCAT(pt.first_name, ' ', pt.last_name) as patient_name,
              sp.student_no,
              p.table_affected,
              p.purpose,
              p.accessed_at,
              p.ip_address
       FROM PHI_ACCESS_LOGS p
       JOIN USERS v ON p.user_id = v.user_id
       LEFT JOIN USER_ROLES ur ON v.user_id = ur.user_id
       LEFT JOIN ROLES r ON ur.role_id = r.role_id
       JOIN USERS pt ON p.patient_user_id = pt.user_id
       LEFT JOIN STUDENT_PROFILES sp ON pt.user_id = sp.user_id
       ORDER BY p.access_id DESC
       LIMIT 100`
    );
    res.json(logs);
  } catch (error) {
    console.error('Failed to retrieve PHI access logs:', error);
    res.status(500).json({ error: 'Failed to retrieve PHI access logs.' });
  }
});

// 3. PATCH /api/admin/users/:id/role - Role assignment
router.patch('/users/:id/role', async (req, res) => {
  const targetUserId = req.params.id;
  const { role_code } = req.body;

  if (!role_code) return res.status(400).json({ error: 'role_code is required.' });

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [roleRows] = await connection.query('SELECT role_id FROM ROLES WHERE code = ?', [role_code]);
    if (roleRows.length === 0) throw new Error('Invalid role code specified.');
    const newRoleId = roleRows[0].role_id;

    await connection.query('DELETE FROM USER_ROLES WHERE user_id = ?', [targetUserId]);
    await connection.query('INSERT INTO USER_ROLES (user_id, role_id) VALUES (?, ?)', [targetUserId, newRoleId]);

    await logAudit(connection, {
      userId: req.user.user_id,
      action: 'UPDATE',
      table: 'USER_ROLES',
      recordId: targetUserId,
      oldValue: null,
      newValue: { assigned_role: role_code },
      ipAddress: req.ip,
    });

    await connection.commit();
    res.json({ message: `User #${targetUserId} updated to role ${role_code}.` });
  } catch (error) {
    await connection.rollback();
    res.status(400).json({ error: error.message });
  } finally {
    connection.release();
  }
});

// 4. GET /api/admin/audit-logs - Append-only Hash Chain
router.get('/audit-logs', async (req, res) => {
  try {
    const [logs] = await pool.query(
      `SELECT a.audit_id as id,
              COALESCE(u.email, 'SYSTEM') as user,
              a.action,
              a.table_affected as target,
              a.entry_hash as hash,
              a.prev_hash,
              a.created_at,
              a.ip_address
       FROM AUDIT_LOGS a
       LEFT JOIN USERS u ON a.user_id = u.user_id
       ORDER BY a.audit_id DESC
       LIMIT 100`
    );
    res.json(logs);
  } catch (error) {
    res.status(500).json({ error: 'Failed to retrieve audit trail.' });
  }
});

// 5. GET /api/admin/telemetry - Health Status (Single Clean Route)
router.get('/telemetry', async (req, res) => {
  try {
    const [dbTest] = await pool.query('SELECT 1 as isAlive');
    const [userCount] = await pool.query('SELECT COUNT(*) as total FROM USERS WHERE is_active = TRUE AND deleted_at IS NULL');
    const [auditCount] = await pool.query('SELECT COUNT(*) as total FROM AUDIT_LOGS');

    res.json({
      database: {
        status: dbTest.length > 0 ? 'Operational' : 'Degraded',
        driver: 'MySQL 8.0 with Spatial SRID 4326',
        totalUsers: userCount[0].total,
        totalAuditBlocks: auditCount[0].total,
      },
      cache: {
        engine: 'Redis 7.0 (In-Memory Queue Cache)',
        status: isRedisActive() ? 'Operational' : 'Fallback (Direct DB)',
      },
      server: {
        uptimeSeconds: Math.floor(process.uptime()),
        memoryUsageMB: (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(2),
        nodeVersion: process.version,
      },
    });
  } catch (error) {
    res.status(500).json({ error: 'Telemetry unavailable.' });
  }
});

export default router;