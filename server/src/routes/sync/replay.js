// Validates replay batches and checks current ownership for legacy offline encounters.

import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { assignedReplayAppointments } from '../../sync/legacyOwnership.js';
import { replayMutations } from '../../sync/replayService.js';

// Mount legacy ownership checks and authenticated mutation replay.
export function registerSyncReplay(router) {
  // Return the submitted appointments still assigned to the acting clinician.
  router.post('/legacy-ownership', authenticateToken, requireRoles('DOCTOR', 'DENTIST'), async (req, res) => {
    const ids = req.body?.appointmentIds;
    if (!Array.isArray(ids) || !ids.length || ids.length > 100 ||
        ids.some(/* Reject submitted appointment identifiers outside the valid integer range. */ id => !Number.isSafeInteger(id) || id <= 0)) {
      return res.status(400).json({ error: 'Send between 1 and 100 appointment IDs.' });
    }
    res.set('Cache-Control', 'no-store');
    res.json({ appointmentIds: await assignedReplayAppointments(req.user.user_id, ids) });
  });

  // Validate the submitted batch, replay its mutations, and return their outcomes.
  router.post('/replay', authenticateToken, requireRoles('DOCTOR', 'DENTIST', 'NURSE'), async (req, res) => {
    const { mutations, device_id } = req.body ?? {};
    if (!Array.isArray(mutations) || mutations.length === 0 || mutations.length > 25) {
      return res.status(400).json({ error: 'Send between 1 and 25 mutations per batch.' });
    }

    try {
      const results = await replayMutations(mutations, { user: req.user, deviceId: device_id, ipAddress: req.ip });
      res.json({
        message: 'Batch synchronization processed.',
        totalReceived: mutations.length,
        syncedCount: results.filter(/* Count newly synced and previously synced mutations as successful outcomes. */ result => result.status === 'synced' || result.status === 'already_synced').length,
        results,
      });
    } catch (error) {
      console.error('[Sync Route Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to process sync replay.' });
    }
  });
}
