// Returns replay ledger totals grouped by sync status.

import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';

// Mount the authenticated replay telemetry endpoint.
export function registerSyncStatus(router) {
  // GET /api/sync/status - Sync status telemetry
  // Return replay ledger counts by result status.
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
