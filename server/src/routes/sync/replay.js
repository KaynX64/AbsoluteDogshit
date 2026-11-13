import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { replayMutations } from '../../sync/replayService.js';

export function registerSyncReplay(router) {
  router.post('/replay', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE'), async (req, res) => {
    const { mutations, device_id } = req.body ?? {};
    if (!Array.isArray(mutations) || mutations.length === 0) {
      return res.status(400).json({ error: 'mutations array is required.' });
    }

    try {
      const results = await replayMutations(mutations, { user: req.user, deviceId: device_id, ipAddress: req.ip });
      res.json({
        message: 'Batch synchronization processed.',
        totalReceived: mutations.length,
        syncedCount: results.filter(result => result.status === 'synced' || result.status === 'already_synced').length,
        results,
      });
    } catch (error) {
      console.error('[Sync Route Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to process sync replay.' });
    }
  });
}
