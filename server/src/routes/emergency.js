// server/src/routes/emergency.js
import express from 'express';
import { pool } from '../db.js';
import { authenticateToken } from '../auth.js';
import { requireRoles } from '../middleware/rbac.js';
import { decrypt } from '../utils/cryptoVault.js';
import { sendPushToUsers } from '../utils/fcmNotifier.js';
import { logAudit } from '../utils/auditLogger.js';
import { logPhiAccess } from '../utils/phiLogger.js';
import { generateAndStoreIncidentReportPDF } from '../utils/documentService.js';
import { getBufferFromS3 } from '../utils/s3Vault.js';
import { redis, isRedisActive, invalidateCache } from '../utils/redisClient.js';
import { SOS_LIMIT } from '../config/limits.js';
import {
  requireResponderAccess,
  redactForTier,
  getResponderAudience,
  roleLabelFor,
} from '../utils/responderAccess.js';

// ── Rate Limiter Middleware para sa SOS ─────────────────────────────
function sosRateLimitKey(userIdOrIp) {
  return `ratelimit:sos:${userIdOrIp}`;
}

async function sosRateLimit(req, res, next) {
  if (!isRedisActive()) return next();

  const identifier = req.user?.user_id || req.ip || 'unknown';
  const key = sosRateLimitKey(identifier);

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, SOS_LIMIT.windowSeconds);
    }

    if (count > SOS_LIMIT.maxAttempts) {
      const ttl = await redis.ttl(key);
      const retrySec = ttl > 0 ? ttl : SOS_LIMIT.windowSeconds;
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: `Emergency alert throttle exceeded. Please wait ${retrySec} second(s) before triggering another SOS.`,
      });
    }

    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, SOS_LIMIT.maxAttempts - count))
    );
    next();
  } catch (err) {
    console.error('[SOS Rate Limit Error]:', err.message);
    next();
  }
}

// ── Reverse Geocoding Address Resolver ──────────────────────────────
async function resolveCampusAddress(lat, lng) {
  // 1. Kung may Google Maps API Key sa environment
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url);
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        return data.results[0].formatted_address;
      }
    } catch (_) {}
  }

  // 2. Intelligent PSU Lingayen Campus Boundary Landmark Resolver (Offline/Fallback)
  // Campus center: 16.0298, 120.2285
  const dLat = Math.abs(lat - 16.0298);
  const dLng = Math.abs(lng - 120.2285);

  if (dLat < 0.005 && dLng < 0.005) {
    if (lat >= 16.0298 && lng >= 120.2285) {
      return 'PSU Lingayen - Science & Technology Complex / East Grounds';
    } else if (lat < 16.0298 && lng < 120.2285) {
      return 'PSU Lingayen - University Infirmary & Student Pavilion';
    } else {
      return 'PSU Lingayen - Administration Building / Library Quadrangle';
    }
  }

  return `Pangasinan State University - Lingayen (${lat.toFixed(5)}, ${lng.toFixed(5)})`;
}

export default function emergencyRouter(io) {
  const router = express.Router();

  // ===========================================================================
  // 1. POST /api/emergency/sos - Trigger SOS & Auto-prioritize in Queue
  // ===========================================================================
  router.post('/sos', authenticateToken, sosRateLimit, async (req, res) => {
    try {
      const userId = req.user.user_id;
      const { latitude, longitude, notes } = req.body;

      if (!latitude || !longitude) {
        return res.status(400).json({ error: 'Latitude and Longitude are required coordinates.' });
      }

      const lat = Number(latitude);
      const lng = Number(longitude);

      if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return res.status(400).json({ error: 'Invalid geographic coordinates provided.' });
      }

      const formattedAddress = await resolveCampusAddress(lat, lng);
      const enrichedNotes = `${notes || 'Emergency SOS pressed'} · Loc: ${formattedAddress}`;

      const connection = await pool.getConnection();
      let alertId;

      try {
        await connection.beginTransaction();

        // 1. Insert Emergency Alert
        const [insertResult] = await connection.query(
          `INSERT INTO EMERGENCY_ALERTS (user_id, location, status, notes)
           VALUES (?, ST_SRID(POINT(?, ?), 4326), 'triggered', ?)`,
          [userId, lng, lat, enrichedNotes]
        );

        alertId = insertResult.insertId;

        // R.A. 10173 Audit Logging
        await logAudit(connection, {
          userId,
          action: 'CREATE',
          table: 'EMERGENCY_ALERTS',
          recordId: alertId,
          oldValue: null,
          newValue: {
            latitude: lat,
            longitude: lng,
            formattedAddress,
            notes: enrichedNotes,
          },
          ipAddress: req.ip,
        });

        await connection.commit();
        await invalidateCache('queue:*');
      } catch (dbErr) {
        await connection.rollback();
        throw dbErr;
      } finally {
        connection.release();
      }

      // Fetch user demographic & health indicators for responder payload
      // (NON_TEACHING joined so the fix to roleLabel/identifier covers
      // support staff; the patient identity itself is never redacted.)
      const [details] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.phone, u.email,
                COALESCE(r.code, 'STUDENT') AS primary_role,
                COALESCE(r.name, 'Student Patient') AS role_name,
                COALESCE(sp.student_no, fp.faculty_no, st.license_no, ntp.employee_no, 'PSU Member') AS identifier_no,
                COALESCE(sp.course, fp.department, st.department, ntp.department, 'PSU Lingayen') AS affiliation,
                hp.blood_type, hp.allergies, hp.chronic_conditions,
                hp.emergency_contact_name, hp.emergency_contact_phone
         FROM USERS u
         LEFT JOIN USER_ROLES ur ON u.user_id = ur.user_id
         LEFT JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STUDENT_PROFILES sp ON u.user_id = sp.user_id
         LEFT JOIN STAFF_PROFILES st ON u.user_id = st.user_id
         LEFT JOIN FACULTY_PROFILES fp ON u.user_id = fp.user_id
         LEFT JOIN NON_TEACHING_PROFILES ntp ON u.user_id = ntp.user_id
         LEFT JOIN HEALTH_PROFILES hp ON u.user_id = hp.user_id
         WHERE u.user_id = ?
         LIMIT 1`,
        [userId]
      );

      const patientInfo = details[0] || {};
      const decryptedAllergies = decrypt(patientInfo.allergies) || 'None listed';
      const decryptedConditions = decrypt(patientInfo.chronic_conditions) || 'None listed';

      // Server-side roleLabel (shared with /active via responderAccess.js) —
      // covers STUDENT and NON_TEACHING, which the old inline map missed.
      const roleLabel = roleLabelFor(patientInfo.primary_role);

      const alertPayload = {
        alertId,
        userId,
        patientName: `${patientInfo.first_name} ${patientInfo.last_name}`,
        phone: patientInfo.phone,
        role: patientInfo.primary_role,
        roleLabel,
        studentNo: patientInfo.identifier_no,
        course: patientInfo.affiliation,
        bloodType: patientInfo.blood_type || 'Unknown',
        allergies: decryptedAllergies,
        chronicConditions: decryptedConditions,
        emergencyContact: `${patientInfo.emergency_contact_name || 'N/A'} (${patientInfo.emergency_contact_phone || 'N/A'})`,
        latitude: lat,
        longitude: lng,
        formattedAddress,
        googleMapsUrl: `https://www.google.com/maps?q=${lat},${lng}`,
        status: 'triggered',
        createdAt: new Date().toISOString(),
      };

      // 1. Resolve the live audience (flag OR legacy role, sender excluded,
      //    suspended/soft-deleted accounts dropped). Each recipient is then
      //    served a payload tiered for their access level.
      const audience = await getResponderAudience({ excludeUserId: userId });

      // 2. Dispatch Firebase Cloud Messaging (FCM) background push.
      //    Lock-screen privacy: the push carries the ADDRESS only — no
      //    medical details and no victim name for any recipient tier.
      sendPushToUsers(
        audience.map((r) => r.userId),
        {
          title: `🚨 EMERGENCY SOS at ${formattedAddress}`,
          body: 'A campus member triggered an SOS. Open the app for details and dispatch.',
          data: {
            alertId: String(alertId),
            type: 'EMERGENCY_SOS',
            latitude: String(lat),
            longitude: String(lng),
          },
        }
      ).catch((err) => console.error('[FCM SOS Push Error]:', err.message));

      // 3. Broadcast via WebSockets (Socket.IO) to each recipient's own
      //    per-user room (user:<id>), with the medical details redacted for
      //    community (non-clinical) responders. Per-user rooms — never a
      //    shared role room — so suspensions, flag revocations and role
      //    edits take effect immediately without stale room membership.
      if (io) {
        for (const recipient of audience) {
          io.to(`user:${recipient.userId}`).emit(
            'emergency:new_alert',
            redactForTier(alertPayload, recipient.tier)
          );
        }
      }

      res.status(201).json({
        message: 'Emergency alert dispatched to campus responders.',
        alertId,
        formattedAddress,
      });
    } catch (error) {
      console.error('SOS Trigger Error:', error);
      res.status(500).json({ error: 'Failed to process SOS alert.' });
    }
  });

  // ===========================================================================
  // 2. GET /api/emergency/active - Retrieve Active Alerts
  // ===========================================================================
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

  // ===========================================================================
  // 3a. GET /api/emergency/incident-reports/pending
  // Resolved alerts (last 24h) that still need a console operator's incident
  // report. Consoles call this on mount so the documentation popup still
  // appears when the status_change event fired while nobody was connected.
  // ===========================================================================
  router.get('/incident-reports/pending', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const [pending] = await pool.query(
        `SELECT a.alert_id, a.status, a.created_at, a.resolved_at, a.notes,
                CONCAT(u.first_name, ' ', u.last_name) AS patient_name,
                u.phone,
                COALESCE((SELECT r.code FROM USER_ROLES ur
                          INNER JOIN ROLES r ON ur.role_id = r.role_id
                          WHERE ur.user_id = u.user_id LIMIT 1), 'STUDENT') AS primary_role,
                COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Member') AS identifier_no
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         WHERE a.status = 'resolved'
           AND a.resolved_at >= DATE_SUB(NOW(), INTERVAL 24 HOUR)
           AND NOT EXISTS (SELECT 1 FROM INCIDENT_REPORTS ir WHERE ir.alert_id = a.alert_id)
         ORDER BY a.resolved_at DESC`
      );

      res.json(
        pending.map((p) => ({
          alertId: Number(p.alert_id),
          status: p.status,
          createdAt: new Date(p.created_at).toISOString(),
          resolvedAt: p.resolved_at ? new Date(p.resolved_at).toISOString() : null,
          notes: p.notes,
          patientName: p.patient_name,
          studentNo: p.identifier_no,
          phone: p.phone,
          roleLabel: roleLabelFor(p.primary_role),
        }))
      );
    } catch (error) {
      console.error('[Pending Incident Reports Error]:', error);
      res.status(500).json({ error: 'Failed to fetch pending incident reports.' });
    }
  });

  // ===========================================================================
  // 3b. GET /api/emergency/:alertId/incident-report
  // Pre-fill payload for the desktop console documentation popup: patient
  // identity (name, ID number, contact number) fetched live from the server,
  // plus the alert timeline and any already-filed report.
  // ===========================================================================
  router.get('/:alertId/incident-report', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const { alertId } = req.params;

      const [alertRows] = await pool.query(
        `SELECT a.alert_id, a.user_id, a.status, a.created_at, a.resolved_at, a.notes,
                a.latitude, a.longitude,
                CONCAT(u.first_name, ' ', u.last_name) AS patient_name,
                u.phone,
                COALESCE((SELECT r.code FROM USER_ROLES ur
                          INNER JOIN ROLES r ON ur.role_id = r.role_id
                          WHERE ur.user_id = u.user_id LIMIT 1), 'STUDENT') AS primary_role,
                COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Member') AS identifier_no,
                COALESCE((SELECT sp.course FROM STUDENT_PROFILES sp WHERE sp.user_id = u.user_id),
                         (SELECT fp.department FROM FACULTY_PROFILES fp WHERE fp.user_id = u.user_id),
                         (SELECT st.department FROM STAFF_PROFILES st WHERE st.user_id = u.user_id),
                         (SELECT ntp.department FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = u.user_id),
                         'PSU Lingayen') AS affiliation
         FROM EMERGENCY_ALERTS a
         JOIN USERS u ON a.user_id = u.user_id
         WHERE a.alert_id = ?`,
        [alertId]
      );

      if (alertRows.length === 0) {
        return res.status(404).json({ error: 'Alert not found.' });
      }

      const [reportRows] = await pool.query(
        `SELECT ir.report_id, ir.alert_id, ir.resolved_at, ir.incident_details,
                ir.treatment_notes, ir.created_at,
                CONCAT(du.first_name, ' ', du.last_name) AS documented_by_name
         FROM INCIDENT_REPORTS ir
         JOIN USERS du ON ir.documented_by = du.user_id
         WHERE ir.alert_id = ?`,
        [alertId]
      );

      const a = alertRows[0];
      const report = reportRows.length > 0
        ? {
            reportId: Number(reportRows[0].report_id),
            resolvedAt: new Date(reportRows[0].resolved_at).toISOString(),
            incidentDetails: reportRows[0].incident_details,
            treatmentNotes: reportRows[0].treatment_notes,
            documentedByName: reportRows[0].documented_by_name,
            createdAt: new Date(reportRows[0].created_at).toISOString(),
          }
        : null;

      res.json({
        patient: {
          userId: Number(a.user_id),
          name: a.patient_name,
          studentNo: a.identifier_no,
          phone: a.phone,
          roleLabel: roleLabelFor(a.primary_role),
          affiliation: a.affiliation,
        },
        alert: {
          alertId: Number(a.alert_id),
          status: a.status,
          createdAt: new Date(a.created_at).toISOString(),
          resolvedAt: a.resolved_at ? new Date(a.resolved_at).toISOString() : null,
          notes: a.notes,
          latitude: a.latitude !== null ? Number(a.latitude) : null,
          longitude: a.longitude !== null ? Number(a.longitude) : null,
        },
        report,
      });
    } catch (error) {
      console.error('[Incident Report Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to fetch incident report data.' });
    }
  });

  // ===========================================================================
  // 3c. POST /api/emergency/:alertId/incident-report
  // File the post-resolution documentation typed into the desktop console
  // popup. One report per alert (UNIQUE alert_id) — the first console to
  // submit wins; others are told it is already documented.
  // ===========================================================================
  router.post('/:alertId/incident-report', authenticateToken, requireResponderAccess, async (req, res) => {
    try {
      const { alertId } = req.params;
      const responderId = req.user.user_id;
      const raw = req.body || {};

      const incidentDetails = typeof raw.incident_details === 'string' ? raw.incident_details.trim() : '';
      if (incidentDetails.length < 5 || incidentDetails.length > 4000) {
        return res.status(400).json({ error: 'Incident details must be between 5 and 4000 characters.' });
      }

      let treatmentNotes = null;
      if (raw.treatment_notes !== undefined && raw.treatment_notes !== null && String(raw.treatment_notes).trim() !== '') {
        treatmentNotes = String(raw.treatment_notes).trim();
        if (treatmentNotes.length > 4000) {
          return res.status(400).json({ error: 'Treatment notes must be 4000 characters or fewer.' });
        }
      }

      const [alertRows] = await pool.query(
        'SELECT user_id, status, created_at, resolved_at FROM EMERGENCY_ALERTS WHERE alert_id = ?',
        [alertId]
      );
      if (alertRows.length === 0) {
        return res.status(404).json({ error: 'Alert not found.' });
      }
      if (alertRows[0].status !== 'resolved') {
        return res.status(409).json({
          error: `Incident reports are filed for resolved incidents only (current status: ${alertRows[0].status}).`,
          code: 'ALERT_NOT_RESOLVED',
        });
      }

      // Date & time the incident was resolved. The popup pre-fills this from
      // the stored resolved_at; the operator may correct it, bounded by the
      // alert lifetime (never before it was triggered, never in the future).
      let resolvedAt;
      if (raw.resolved_at === undefined || raw.resolved_at === null || String(raw.resolved_at).trim() === '') {
        resolvedAt = new Date(alertRows[0].resolved_at);
      } else {
        resolvedAt = new Date(String(raw.resolved_at));
      }
      if (isNaN(resolvedAt.getTime())) {
        return res.status(400).json({ error: 'Invalid resolved_at — provide an ISO 8601 date-time.' });
      }
      if (resolvedAt.getTime() < new Date(alertRows[0].created_at).getTime() - 60000) {
        return res.status(400).json({ error: 'resolved_at cannot be before the alert was triggered.' });
      }
      if (resolvedAt.getTime() > Date.now() + 5 * 60 * 1000) {
        return res.status(400).json({ error: 'resolved_at cannot be in the future.' });
      }

      const connection = await pool.getConnection();
      let reportId;
      try {
        await connection.beginTransaction();

        const [insertResult] = await connection.query(
          `INSERT INTO INCIDENT_REPORTS (alert_id, patient_user_id, resolved_at, incident_details, treatment_notes, documented_by)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [alertId, alertRows[0].user_id, resolvedAt, incidentDetails, treatmentNotes, responderId]
        );
        reportId = insertResult.insertId;

        await logAudit(connection, {
          userId: responderId,
          action: 'CREATE',
          table: 'INCIDENT_REPORTS',
          recordId: Number(reportId),
          oldValue: null,
          newValue: {
            operation: 'SOS_INCIDENT_REPORT',
            alertId: Number(alertId),
            patientUserId: Number(alertRows[0].user_id),
            resolvedAt: resolvedAt.toISOString(),
          },
          ipAddress: req.ip,
        });

        await connection.commit();
      } catch (err) {
        await connection.rollback();
        // UNIQUE(alert_id): another console filed the report first.
        if (err && err.code === 'ER_DUP_ENTRY') {
          return res.status(409).json({
            error: 'This incident has already been documented by another console.',
            code: 'REPORT_ALREADY_FILED',
          });
        }
        throw err;
      } finally {
        connection.release();
      }

      // Tell every connected console the documentation is in — popups for
      // this alert dismiss themselves instead of asking for a second report.
      if (io) {
        const [authorRows] = await pool.query(
          'SELECT CONCAT(first_name, " ", last_name) AS full_name FROM USERS WHERE user_id = ?',
          [responderId]
        ).catch(() => [[]]);
        const documentedByName =
          Array.isArray(authorRows) && authorRows.length > 0 ? authorRows[0].full_name : null;
        const audience = await getResponderAudience({}).catch(() => []);
        for (const recipient of audience) {
          io.to(`user:${recipient.userId}`).emit('emergency:incident_reported', {
            alertId: Number(alertId),
            reportId: Number(reportId),
            documentedBy: Number(responderId),
            documentedByName,
          });
        }
      }

      // Asynchronously generate PDF and upload to MinIO file server
      generateAndStoreIncidentReportPDF(reportId).catch((err) => {
        console.error(`[Incident Report PDF Generation] Report #${reportId} failed:`, err.message);
      });

      res.status(201).json({
        message: 'Incident report filed.',
        reportId: Number(reportId),
      });
    } catch (error) {
      console.error('[Incident Report Save Error]:', error);
      res.status(500).json({ error: 'Failed to save the incident report.' });
    }
  });

  // ===========================================================================
  // 3d. GET /api/emergency/incident-reports
  // Returns documented incident reports for resolved emergencies (ADMIN only).
  // ===========================================================================
  router.get('/incident-reports', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
    try {
      const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';

      let query = `
        SELECT ir.report_id, ir.alert_id, ir.resolved_at, ir.incident_details,
               ir.treatment_notes, ir.created_at, ir.pdf_s3_key,
               a.created_at AS alert_created_at, a.acknowledged_at, a.resolved_at AS alert_resolved_at,
               a.response_time_seconds, a.notes AS alert_notes,
               a.latitude, a.longitude,
               pt.user_id AS patient_user_id,
               CONCAT(pt.first_name, ' ', pt.last_name) AS patient_name,
               pt.phone AS patient_phone,
               COALESCE((SELECT r.code FROM USER_ROLES ur
                         INNER JOIN ROLES r ON ur.role_id = r.role_id
                         WHERE ur.user_id = pt.user_id LIMIT 1), 'STUDENT') AS patient_role,
               COALESCE((SELECT sp.student_no FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                        (SELECT fp.faculty_no FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                        (SELECT st.license_no FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                        (SELECT ntp.employee_no FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                        'PSU Member') AS identifier_no,
               COALESCE((SELECT sp.course FROM STUDENT_PROFILES sp WHERE sp.user_id = pt.user_id),
                        (SELECT fp.department FROM FACULTY_PROFILES fp WHERE fp.user_id = pt.user_id),
                        (SELECT st.department FROM STAFF_PROFILES st WHERE st.user_id = pt.user_id),
                        (SELECT ntp.department FROM NON_TEACHING_PROFILES ntp WHERE ntp.user_id = pt.user_id),
                        'PSU Lingayen') AS patient_affiliation,
               CONCAT(du.first_name, ' ', du.last_name) AS documented_by_name,
               CONCAT(ru.first_name, ' ', ru.last_name) AS responder_name
        FROM INCIDENT_REPORTS ir
        JOIN EMERGENCY_ALERTS a ON ir.alert_id = a.alert_id
        JOIN USERS pt ON ir.patient_user_id = pt.user_id
        JOIN USERS du ON ir.documented_by = du.user_id
        LEFT JOIN USERS ru ON a.assigned_responder_id = ru.user_id
      `;

      const params = [];
      if (search) {
        query += `
          WHERE (
            pt.first_name LIKE ? OR pt.last_name LIKE ?
            OR CONCAT(pt.first_name, ' ', pt.last_name) LIKE ?
            OR ir.incident_details LIKE ?
            OR ir.treatment_notes LIKE ?
            OR ir.report_id = ?
            OR ir.alert_id = ?
          )
        `;
        const like = `%${search}%`;
        const num = Number(search) || 0;
        params.push(like, like, like, like, like, num, num);
      }

      query += ` ORDER BY ir.created_at DESC LIMIT 200`;

      const [rows] = await pool.query(query, params);

      res.json(
        rows.map((row) => ({
          reportId: Number(row.report_id),
          alertId: Number(row.alert_id),
          resolvedAt: new Date(row.resolved_at).toISOString(),
          createdAt: new Date(row.created_at).toISOString(),
          incidentDetails: row.incident_details,
          treatmentNotes: row.treatment_notes,
          pdfAvailable: Boolean(row.pdf_s3_key),
          pdfS3Key: row.pdf_s3_key,
          patient: {
            userId: Number(row.patient_user_id),
            name: row.patient_name,
            studentNo: row.identifier_no,
            phone: row.patient_phone,
            roleLabel: roleLabelFor(row.patient_role),
            affiliation: row.patient_affiliation,
          },
          alert: {
            createdAt: new Date(row.alert_created_at).toISOString(),
            acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : null,
            resolvedAt: row.alert_resolved_at ? new Date(row.alert_resolved_at).toISOString() : null,
            responseTimeSeconds: row.response_time_seconds,
            notes: row.alert_notes,
            latitude: row.latitude !== null ? Number(row.latitude) : null,
            longitude: row.longitude !== null ? Number(row.longitude) : null,
          },
          documentedByName: row.documented_by_name,
          responderName: row.responder_name,
        }))
      );
    } catch (error) {
      console.error('[Incident Records Fetch Error]:', error);
      res.status(500).json({ error: 'Failed to fetch incident records.' });
    }
  });

  // ===========================================================================
  // 3e. GET /api/emergency/incident-reports/:reportId/pdf
  // Serves the official incident report PDF from MinIO (ADMIN only). Generates on-demand if null.
  // ===========================================================================
  router.get('/incident-reports/:reportId/pdf', authenticateToken, requireRoles('ADMIN'), async (req, res) => {
    const reportId = Number(req.params.reportId);
    if (!reportId) return res.status(400).json({ error: 'Invalid report id.' });

    try {
      const [rows] = await pool.query(
        'SELECT report_id, alert_id, patient_user_id, pdf_s3_key FROM INCIDENT_REPORTS WHERE report_id = ?',
        [reportId]
      );
      if (rows.length === 0) return res.status(404).json({ error: 'Incident report not found.' });
      const report = rows[0];

      let key = report.pdf_s3_key;
      if (!key) {
        key = await generateAndStoreIncidentReportPDF(reportId);
        if (!key) {
          return res.status(503).json({
            error: 'Document is being generated. Please try again shortly.',
            retryAfterSeconds: 5,
          });
        }
      }

      const buffer = await getBufferFromS3(key);

      logPhiAccess({
        viewerUserId: req.user.user_id,
        patientUserId: report.patient_user_id,
        table: 'INCIDENT_REPORTS',
        recordId: reportId,
        purpose: 'Incident Report PDF download / view',
        ipAddress: req.ip,
      });

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="incident-report-${reportId}.pdf"`);
      res.setHeader('Content-Length', String(buffer.length));
      res.send(buffer);
    } catch (err) {
      console.error('[Incident Report PDF Error]:', err);
      res.status(500).json({ error: 'Failed to retrieve incident report PDF.' });
    }
  });

  return router;
}
