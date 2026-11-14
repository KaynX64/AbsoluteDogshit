// Serves authenticated desktop cache bootstrap requests in legacy or paginated form.

import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { logPhiAccess } from '../../utils/phiLogger.js';
import { decodeBootstrapCursor, encodeBootstrapCursor } from '../../sync/bootstrapCursor.js';
import { readBootstrapPage, readLegacyBootstrap, startBootstrapScan } from '../../sync/bootstrapReads.js';

export function registerSyncBootstrap(router) {
  router.get('/bootstrap', authenticateToken, requireRoles('NURSE', 'DOCTOR', 'DENTIST', 'ADMIN'), async (req, res) => {
    const { paging, checkpoint, cursor, lastSyncedAt } = req.query;
    const userId = req.user.user_id;
    try {
      let result;
      if (paging === '1') {
        let scan;
        if (cursor !== undefined) {
          scan = decodeBootstrapCursor(cursor, userId);
          if (!scan) return res.status(400).json({ error: 'Invalid bootstrap cursor.' });
        } else {
          const since = checkpoint === undefined ? null : Math.floor(Date.parse(checkpoint) / 1000);
          if (since !== null && (typeof checkpoint !== 'string' || !Number.isFinite(since) || since < 0)) {
            return res.status(400).json({ error: 'Invalid bootstrap checkpoint.' });
          }
          scan = await startBootstrapScan(since);
        }
        const { nextScan, ...page } = await readBootstrapPage(scan);
        result = { ...page, nextCursor: nextScan ? encodeBootstrapCursor(nextScan, userId) : null };
      } else {
        result = await readLegacyBootstrap(lastSyncedAt ? new Date(lastSyncedAt) : null);
      }

      void logPhiAccess({
        viewerUserId: userId,
        patientUserId: null,
        table: 'EMR_RECORDS',
        recordId: 0,
        purpose: 'Clinic Workstation Offline Cache Bootstrap',
        ipAddress: req.ip,
      });
      res.json({ ...result, bootstrappedAt: new Date().toISOString() });
    } catch (error) {
      console.error('[Sync Bootstrap Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to retrieve bootstrap cache.' });
    }
  });
}
