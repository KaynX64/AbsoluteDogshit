// Serves Terminal status and diagnostic commands and authorizes audited supervisor restarts.

import express from 'express';
import { classifyAdminPermissions } from '../../middleware/rbac.js';
import { pool } from '../../db/pool.js';
import { logAudit } from '../../utils/auditLogger.js';
import { inTransaction } from '../../db/transaction.js';
import { commands, recordOperation, serverStatus } from '../../bootstrap/operations.js';

// Build the Terminal router and guard its diagnostic and restart actions.
export default function operationsRoutes(restart) {
  const router = express.Router();
  let restarting = false;
  // Check whether this API instance has a connected supervisor that can restart it.
  const canRestart = () => Boolean(restart && process.connected && process.env.VALETUDO_SUPERVISED === '1');
  // Resolve the caller's administrator grants before allowing Terminal access.
  router.use(async (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    try {
      // ADMIN claims can outlive role changes. Check the role and grants in one read
      // so removing the role and its grants cannot be mistaken for legacy full access.
      const [rows] = await pool.query(
        `SELECT ap.code FROM USER_ROLES ur JOIN ROLES r ON r.role_id = ur.role_id
         LEFT JOIN USER_ADMIN_PERMISSIONS uap ON uap.user_id = ur.user_id
         LEFT JOIN ADMIN_PERMISSIONS ap ON ap.permission_id = uap.permission_id
         WHERE ur.user_id = ? AND r.code = 'ADMIN'`,
        [req.user.user_id],
      );
      // Extract the caller's current administrator permission codes.
      const { isSuper, codes } = classifyAdminPermissions(rows.map(row => row.code).filter(Boolean));
      if (rows.length === 0 || (!isSuper && !codes.includes('TERMINAL_VIEW'))) {
        return res.status(403).json({ error: 'Terminal access is required.' });
      }
      res.locals.canRestartServer = isSuper;
      next();
    } catch {
      return res.status(503).json({ error: 'Could not verify Terminal access.' });
    }
  });

  // Return the recent Terminal events and whether the caller can restart the server.
  router.get('/', (_req, res) => res.json({ ...serverStatus(), restartAvailable: res.locals.canRestartServer && canRestart(), restartAuthorized: res.locals.canRestartServer, restarting }));
  // Run one of the fixed diagnostic commands requested by the caller.
  router.post('/command', async (req, res) => {
    const { command } = req.body ?? {};
    if (typeof command !== 'string' || !Object.hasOwn(commands, command)) {
      return res.status(400).json({ error: 'Unknown command. Use status, health, workers, or memory.' });
    }
    try {
      res.json({ output: await commands[command]() });
    } catch {
      res.status(503).json({ error: 'Diagnostic command failed.' });
    }
  });
  // Audit an authorized restart and schedule it after the response.
  router.post('/restart', async (req, res) => {
    if (!res.locals.canRestartServer) return res.status(403).json({ error: 'Restart requires Super Admin access.' });
    if (!canRestart()) return res.status(409).json({ error: 'Restart requires the npm start supervisor.' });
    if (restarting) return res.status(409).json({ error: 'A restart is already in progress.' });
    restarting = true;
    try {
      // Write the restart audit before handing off to the supervisor.
      await inTransaction(connection => logAudit(connection, {
        userId: req.user.user_id, action: 'UPDATE', table: 'SERVER_PROCESS', recordId: 0,
        oldValue: null, newValue: { operation: 'RESTART_REQUESTED' }, ipAddress: req.ip,
      }));
    } catch {
      restarting = false;
      return res.status(503).json({ error: 'Could not record the restart request.' });
    }
    recordOperation('Graceful restart requested.');
    if (res.destroyed) {
      restarting = false;
      return;
    }
    // Handle an interrupted restart response and reset its in-progress state when applicable.
    res.once('close', () => { if (!res.writableFinished) restarting = false; });
    // Hand the restart request to the supervisor after the HTTP response finishes.
    res.once('finish', async () => {
      try {
        await restart();
      } catch {
        restarting = false;
        recordOperation('Restart could not be handed to the supervisor.');
      }
    });
    return res.status(202).json({ message: 'Restart accepted. Waiting for the new server process.' });
  });
  return router;
}
