import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';

export function registerSyncStatus(router) {
  // GET /api/sync/status - Sync status telemetry
  router.get('/status', authenticateToken, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT sync_status, COUNT(*) as count FROM LOCAL_SYNC_LOGS GROUP BY sync_status`
      );
      res.json(rows);
    } catch (err) {
      res.status(500).json({ error: 'Failed to retrieve sync status.' });
    }
  });
}
