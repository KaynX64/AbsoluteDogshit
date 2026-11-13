import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { logAudit } from '../../utils/auditLogger.js';
import { invalidateCache } from '../../utils/redisClient.js';
import { requireResponderAccess, resolveResponderAccess, getResponderAudience, roleLabelFor } from '../../emergency/responderAccess.js';

export function registerAlertRoutes(router, io) {
  // ===========================================================================
  // 2. GET /api/emergency/active - Retrieve Active Alerts
  // ===========================================================================
  router.get('/responder-access', authenticateToken, async (req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const { authorized } = await resolveResponderAccess(req.user.user_id);
      return res.json({ authorized });
    } catch {
      return res.status(500).json({ error: 'Responder access lookup failed.' });
    }
  });

  router.get('/active', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const tier = req.responderTier;
      const [alerts] = await pool.query(
        `SELECT a.alert_id, a.user_id, a.latitude, a.longitude, a.status, a.created_at, a.notes,
                u.first_name, u.last_name, u.phone,
                COALESCE(r.code, 'STUDENT') AS primary_role,
                COALESCE(sp.student_no, fp.faculty_no, st.license_no, ntp.employee_no, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, fp.department, st.department, ntp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
         LEFT JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN NON_TEACHING_PROFILES ntp ON u.user_id = ntp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE a.status IN ('triggered', 'acknowledged', 'dispatched')
         ORDER BY a.created_at DESC`
      );

      const decryptedAlerts = alerts.map((a) => {
        // Tier the API the same way the socket broadcast is tiered, so the
        // REST path can never bypass the medical-detail redaction.
        if (tier === 'community') {
          const row = { ...a };
          // Strip every medical-detail column for community responders.
          delete row.blood_type;
          delete row.allergies;
          return {
            ...row,
            studentNo: a.identifier_no,
            course: a.affiliation,
            roleLabel: roleLabelFor(a.primary_role),
            medicalDetailsRedacted: true,
          };
        }
        return {
          ...a,
          studentNo: a.identifier_no,
          course: a.affiliation,
          roleLabel: roleLabelFor(a.primary_role),
          allergies: decrypt(a.allergies) || 'None',
          medicalDetailsRedacted: false,
        };
      });

      res.json(decryptedAlerts);
    } catch (error) {
      console.error('[Emergency Active Error]:', error);
      res.status(500).json({ error: 'Failed to fetch active alerts.' });
    }
  });

  // ===========================================================================
  // 3. PATCH /api/emergency/:alertId/status - Update Status & Sync Queue
  // ===========================================================================
  router.patch('/:alertId/status', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const { alertId } = req.params;
      const { status } = req.body;
      const responderId = req.user.user_id;
      const tier = req.responderTier;

      if (!['acknowledged', 'dispatched', 'resolved', 'false_alarm'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status update.' });
      }

      // Any responder tier may close an incident (resolved / false_alarm).
      // The old community-tier 403 made "False alarm" a dead button for
      // qualified responders without a clinical role — closing is an
      // operational action, not a PHI disclosure, so it is tier-agnostic.
      // Medical-detail redaction (R.A. 10173) still applies to payloads.

      const connection = await pool.getConnection();
      let resolvedAt = null;

      try {
        await connection.beginTransaction();

        let extraUpdate = '';
        const params = [status, responderId];

        if (status === 'acknowledged') {
          extraUpdate = ', acknowledged_at = CURRENT_TIMESTAMP';
        } else if (status === 'resolved' || status === 'false_alarm') {
          extraUpdate = `, resolved_at = CURRENT_TIMESTAMP,
                         response_time_seconds = TIMESTAMPDIFF(SECOND, created_at, CURRENT_TIMESTAMP)`;
        }

        params.push(alertId);

        // Atomic open-state guard: the UPDATE only matches while the alert
        // is still open. Two responders closing the same SOS → exactly one
        // winner; the loser gets a 409 and NO second status_change event
        // (so desktop consoles never see a duplicate incident popup).
        const [updateResult] = await connection.query(
          `UPDATE EMERGENCY_ALERTS
           SET status = ?, assigned_responder_id = ? ${extraUpdate}
           WHERE alert_id = ? AND status IN ('triggered', 'acknowledged', 'dispatched')`,
          params
        );

        if (updateResult.affectedRows === 0) {
          await connection.rollback();
          const [existing] = await pool.query(
            'SELECT status FROM EMERGENCY_ALERTS WHERE alert_id = ?',
            [alertId]
          );
          if (existing.length === 0) {
            return res.status(404).json({ error: 'Alert not found.' });
          }
          const currentStatus = existing[0].status;
          const closed = currentStatus === 'resolved' || currentStatus === 'false_alarm';
          return res.status(409).json({
            error: closed
              ? `Alert #${alertId} was already closed as ${currentStatus}.`
              : `Alert #${alertId} is already ${currentStatus}.`,
            code: closed ? 'ALERT_ALREADY_CLOSED' : 'ALERT_ALREADY_IN_STATUS',
            currentStatus,
          });
        }

        // Status changes are part of the R.A. 10173 record — they were not
        // audited before. No PHI in the entry.
        await logAudit(connection, {
          userId: responderId,
          action: 'UPDATE',
          table: 'EMERGENCY_ALERTS',
          recordId: Number(alertId),
          oldValue: null,
          newValue: {
            operation: 'SOS_STATUS_CHANGE',
            status,
            responderTier: tier,
          },
          ipAddress: req.ip,
        });

        // Confirmed resolution timestamp (typed by the SQL UPDATE above) —
        // read back inside the transaction so the emitted event and the
        // incident-report popup share the exact stored value.
        if (status === 'resolved' || status === 'false_alarm') {
          const [closed] = await connection.query(
            'SELECT resolved_at FROM EMERGENCY_ALERTS WHERE alert_id = ?',
            [alertId]
          );
          resolvedAt = closed.length > 0 ? closed[0].resolved_at : null;
        }

        await connection.commit();
        await invalidateCache('queue:*');
      } catch (err) {
        await connection.rollback();
        throw err;
      } finally {
        connection.release();
      }

      if (io) {
        // Live audience (flag OR legacy role) — emit to each recipient's own
        // user room so a phone mid-session drops the alert instantly.
        const audience = await getResponderAudience({}).catch(() => []);
        for (const recipient of audience) {
          io.to(`user:${recipient.userId}`).emit('emergency:status_change', {
            alertId: Number(alertId),
            status,
            responderId,
            resolvedAt: resolvedAt ? new Date(resolvedAt).toISOString() : null,
          });
        }
        const clientInstanceId = req.get('X-Client-Instance-Id');
        if (
          status === 'resolved' &&
          typeof clientInstanceId === 'string' &&
          /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientInstanceId)
        ) {
          io.to(`desktop:${responderId}:${clientInstanceId}`).emit('emergency:incident_report_required', {
            alertId: Number(alertId),
            resolvedAt: resolvedAt ? new Date(resolvedAt).toISOString() : null,
          });
        }
        io.emit('queue:updated');
      }

      res.json({ message: `Alert #${alertId} updated to ${status}.` });
    } catch (error) {
      console.error('[Emergency Status Error]:', error);
      res.status(500).json({ error: 'Failed to update alert status.' });
    }
  });
}
