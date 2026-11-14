import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/rbac.js';
import { isRedisActive } from '../../utils/redisClient.js';
import { getWorkerStats } from '../../workers/scheduler.js';

function readAuditPage(req, res) {
  const { before, limit } = req.query;
  if ((before !== undefined && (typeof before !== 'string' || !/^[1-9]\d{0,18}$/.test(before) || BigInt(before) > 9223372036854775807n)) ||
      (limit !== undefined && (typeof limit !== 'string' || !/^(?:[1-9]\d?|100)$/.test(limit)))) {
    res.status(400).json({ error: 'Use a positive before ID and a limit from 1 to 100.' });
    return null;
  }
  return { before, limit: Number(limit ?? 100) };
}

export function registerPhiAccessLogRoute(router) {
  // 2. GET /api/admin/phi-access-logs - PHI Surveillance Log
  router.get('/phi-access-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
    const page = readAuditPage(req, res);
    if (!page) return;
    try {
      const [logs] = await pool.query(
        `SELECT p.access_id as id,
              CONCAT(v.first_name, ' ', v.last_name) as viewer_name,
              v.email as viewer_email,
              COALESCE((
                SELECT MIN(r.code) FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
                WHERE ur.user_id = v.user_id
              ), 'STAFF') as viewer_role,
              (
                SELECT GROUP_CONCAT(r.code ORDER BY r.code) FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
                WHERE ur.user_id = v.user_id
              ) as viewer_roles,
              CONCAT(pt.first_name, ' ', pt.last_name) as patient_name,
              sp.student_no,
              p.table_affected,
              p.purpose,
              p.accessed_at,
              p.ip_address
       FROM PHI_ACCESS_LOGS p
       JOIN USERS v ON p.user_id = v.user_id
       JOIN USERS pt ON p.patient_user_id = pt.user_id
       LEFT JOIN STUDENT_PROFILES sp ON pt.user_id = sp.user_id
       ${page.before ? 'WHERE p.access_id < ?' : ''}
       ORDER BY p.access_id DESC
       LIMIT ?`,
        page.before ? [page.before, page.limit] : [page.limit]
      );
      res.json(logs);
    } catch (error) {
      console.error('Failed to retrieve PHI access logs:', error.code ?? error.name);
      res.status(500).json({ error: 'Failed to retrieve PHI access logs.' });
    }
  });
}

export function registerAuditAndTelemetryRoutes(router) {
  // 4. GET /api/admin/audit-logs - Append-only Hash Chain
  router.get('/audit-logs', requirePermission('AUDIT_VIEW'), async (req, res) => {
    const page = readAuditPage(req, res);
    if (!page) return;
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
       ${page.before ? 'WHERE a.audit_id < ?' : ''}
       ORDER BY a.audit_id DESC
       LIMIT ?`,
        page.before ? [page.before, page.limit] : [page.limit]
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
        workers: getWorkerStats(),
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
