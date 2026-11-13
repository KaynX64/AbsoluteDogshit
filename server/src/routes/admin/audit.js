import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/rbac.js';
import { isRedisActive } from '../../utils/redisClient.js';

export function registerPhiAccessLogRoute(router) {
  // 2. GET /api/admin/phi-access-logs - PHI Surveillance Log
  router.get('/phi-access-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
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
}

export function registerAuditAndTelemetryRoutes(router) {
  // 4. GET /api/admin/audit-logs - Append-only Hash Chain
  router.get('/audit-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
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

  // 5. GET /api/admin/telemetry - Health Status
  router.get('/telemetry', requirePermission('TELEMETRY_VIEW'), async (req, res) => {
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
}
