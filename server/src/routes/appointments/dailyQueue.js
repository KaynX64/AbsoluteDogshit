import { inTransaction } from '../../db/transaction.js';
import { authenticateToken } from '../../auth/middleware.js';
import { requireRoles } from '../../middleware/rbac.js';
import { getCache, setCache } from '../../utils/redisClient.js';
import {
  countTodaysNoShows,
  getPersonalTicket,
  listDailyTickets,
  listExpectedArrivals,
  listRoster,
} from '../../appointments/queueReads.js';
import { AppointmentTransitionError, updateQueueTicketStatus } from '../../appointments/transitions.js';
import { publishQueueChange } from './queueNotifications.js';

export function registerDailyQueueRoutes(router, io) {
  const clinicalDesk = requireRoles('DOCTOR', 'DENTIST', 'NURSE', 'ADMIN');

  router.get('/today', authenticateToken, clinicalDesk, async (req, res) => {
    const roles = req.user.roles || [];
    const canViewDental = roles.includes('DENTIST');
    const practitionerOnly = (roles.includes('DOCTOR') || canViewDental) &&
      !roles.includes('ADMIN') && !roles.includes('NURSE');
    try {
      res.json(await listRoster({
        filter: req.query.filter,
        doctorId: practitionerOnly ? req.user.user_id : null,
        canViewDental,
      }));
    } catch (error) {
      console.error('[Appointments] Error fetching roster:', error.code || error.name);
      res.status(500).json({ error: 'Failed to retrieve appointments roster.' });
    }
  });

  router.get('/expected-today', authenticateToken, clinicalDesk, async (_req, res) => {
    try {
      res.json(await listExpectedArrivals());
    } catch (error) {
      console.error('[Appointments] Expected-today error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to fetch expected patients.' });
    }
  });

  router.get('/no-shows-today', authenticateToken, clinicalDesk, async (_req, res) => {
    try {
      res.json({ count: await countTodaysNoShows() });
    } catch (error) {
      console.error('[Appointments] No-shows today error:', error.code || error.name);
      res.status(500).json({ error: 'Failed to fetch no-show count.' });
    }
  });

  router.get('/queue/today', authenticateToken, clinicalDesk, async (_req, res) => {
    try {
      const cached = await getCache('queue:today');
      if (cached) return res.json(cached);
      const rows = await listDailyTickets();
      await setCache('queue:today', rows, 30);
      res.json(rows);
    } catch (error) {
      console.error('[Appointments] Error fetching daily queue:', error.code || error.name);
      res.status(500).json({ error: 'Failed to fetch daily triage queue.' });
    }
  });

  router.patch('/queue/:queueId/status', authenticateToken, clinicalDesk, async (req, res) => {
    const queueId = Number(req.params.queueId);
    const { status } = req.body ?? {};
    try {
      const changed = await inTransaction(connection => updateQueueTicketStatus(connection, queueId, status));
      if (changed) {
        await publishQueueChange(io, { queue_id: queueId, status }, {
          callPatient: status === 'in-consultation',
          queueFirst: true,
        });
      }
      res.json({ message: 'Queue ticket updated successfully.' });
    } catch (error) {
      if (error instanceof AppointmentTransitionError) {
        return res.status(error.status).json({ error: error.message, code: error.code });
      }
      console.error('[Queue Status Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to update queue ticket.' });
    }
  });

  router.get('/queue/my', authenticateToken, async (req, res) => {
    try {
      res.json(await getPersonalTicket(req.user.user_id));
    } catch (error) {
      console.error('[My Queue Error]:', error.code || error.name);
      res.status(500).json({ error: 'Failed to fetch personal queue ticket.' });
    }
  });
}
