import { pool } from '../../db/pool.js';
import { requirePermission } from '../../middleware/rbac.js';
import { logAudit } from '../../utils/auditLogger.js';
import { fail } from '../../utils/httpError.js';
import { parseQualifiedResponderBody } from '../../emergency/responderAccess.js';
import { requireSuperAdminCaller, getUserRoleCode } from '../../admin/accounts/permissions.js';

export function registerResponderManagementRoutes(router, io) {
  // 3.4 PUT /api/admin/users/:id/qualified-responder — Qualified Responder flag
  // ─────────────────────────────────────────────────────────────────────────
  // Role-independent SOS label. Guarded by RESPONDERS_MANAGE (Super Admins
  // always pass). Only a Super Admin may change the flag on an ADMIN account.
  // PUT /users/:id and POST /users deliberately never read these columns — a
  // limited admin holding only USERS_MANAGE therefore cannot flip the flag.
  // Role changes never touch it either (role handlers only rewrite USER_ROLES).
  router.put('/users/:id/qualified-responder', requirePermission('RESPONDERS_MANAGE'), async (req, res) => {
    const targetUserId = Number(req.params.id);
    const parsed = parseQualifiedResponderBody(req.body);
    if (!parsed.ok) {
      return res.status(400).json({ error: parsed.error });
    }
    const { is_qualified_responder, note } = parsed.value;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Lock the target row so flag, since-date and note are written atomically.
      const [rows] = await connection.query(
        `SELECT is_qualified_responder, qualified_responder_since, qualified_responder_note
       FROM USERS WHERE user_id = ? FOR UPDATE`,
        [targetUserId]
      );
      if (rows.length === 0) {
        throw fail('User not found.', 404);
      }

      // Admin-target guard: the flag on an ADMIN account is a Super Admin
      // decision (same lifecycle rule as every other administrator field).
      const targetRole = await getUserRoleCode(connection, targetUserId);
      if (targetRole === 'ADMIN') {
        await requireSuperAdminCaller(req);
      }

      const current = rows[0];
      const nextFlag = is_qualified_responder ? 1 : 0;
      // Since-date: set when the flag turns ON (kept when re-saving an already
      // flagged account), cleared when it turns OFF.
      const nextSince = nextFlag === 1
        ? (current.qualified_responder_since || new Date())
        : null;
      // Note: editable while ON; cleared when the flag turns OFF.
      const nextNote = nextFlag === 1 ? (note ?? '') : null;

      const unchanged =
        Boolean(current.is_qualified_responder) === is_qualified_responder &&
        String(current.qualified_responder_note || '') === String(nextNote ?? '');

      if (!unchanged) {
        await connection.query(
          `UPDATE USERS
         SET is_qualified_responder = ?, qualified_responder_since = ?, qualified_responder_note = ?
         WHERE user_id = ?`,
          [nextFlag, nextSince, nextNote, targetUserId]
        );

        // R.A. 10173 ledger entry — no PHI, no medical details.
        await logAudit(connection, {
          userId: req.user.user_id,
          action: 'UPDATE',
          table: 'USERS',
          recordId: targetUserId,
          oldValue: null,
          newValue: {
            operation: 'QUALIFIED_RESPONDER_FLAG_CHANGE',
            is_qualified_responder: is_qualified_responder,
            since: nextSince instanceof Date ? nextSince.toISOString() : nextSince,
            note: nextNote,
          },
          ipAddress: req.ip,
        });
      }

      await connection.commit();

      // Notify the target's connected devices so a phone mid-session starts or
      // stops its SOS listener without a re-login (per-user room delivery).
      if (io) {
        io.to(`user:${targetUserId}`).emit('responder:status_changed', {
          isQualifiedResponder: is_qualified_responder,
        });
      }

      res.json({
        message: unchanged
          ? 'No changes needed.'
          : `Qualified Responder ${is_qualified_responder ? 'granted' : 'revoked'} successfully.`,
        is_qualified_responder,
      });
    } catch (error) {
      await connection.rollback();
      console.error('[Qualified Responder Flag Error]:', error);
      res.status(error.status || 400).json({ error: error.message || 'Failed to update the flag.' });
    } finally {
      connection.release();
    }
  });
}
