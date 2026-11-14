import { requirePermission } from '../../middleware/rbac.js';
import { listConnectedSessions } from '../../realtime/presence.js';

export function registerPresenceRoutes(router, io) {
  router.get('/connected-users', requirePermission('TELEMETRY_VIEW'), async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const sessions = await listConnectedSessions(io);
      return res.json({ sessions, sampledAt: new Date().toISOString() });
    } catch (error) {
      console.error('[Connected Users Error]:', error.code ?? error.name);
      return res.status(500).json({ error: 'Connected users are temporarily unavailable.' });
    }
  });
}
