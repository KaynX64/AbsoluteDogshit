// Leases persisted SOS notifications before dispatching to the live responder audience.
import { pool } from '../db/pool.js';
import { decrypt } from '../utils/cryptoVault.js';
import { sendSosPush } from '../utils/fcmNotifier.js';
import { invalidateDailyQueue } from '../appointments/dailyQueueCache.js';
import { redactForTier, getResponderAudience, roleLabelFor } from './responderAccess.js';

async function dispatchAlert(alert, io) {
  await invalidateDailyQueue();
  if (alert.status !== 'triggered' || !alert.recent) return;
  const { alert_id: alertId, user_id: userId, location_label: formattedAddress } = alert;
  const lat = Number(alert.latitude);
  const lng = Number(alert.longitude);
  // Fetch user demographic & health indicators for responder payload
  // (NON_TEACHING joined so the fix to roleLabel/identifier covers
  // support staff; the patient identity itself is never redacted.)
  const [details] = await pool.query(
    `SELECT u.first_name, u.last_name, u.phone,
            COALESCE(r.code, 'STUDENT') AS primary_role,
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
    status: alert.status,
    createdAt: new Date(alert.created_at_seconds * 1000).toISOString(),
  };

  // 1. Resolve the live audience (flag OR legacy role, sender excluded,
  //    suspended/soft-deleted accounts dropped). Each recipient is then
  //    served a payload tiered for their access level.
  const audience = await getResponderAudience({ excludeUserId: userId });

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

  // Upgraded device registrations receive an incident ID and generic text.
  await sendSosPush(audience.map(recipient => recipient.userId), {
    alertId, latitude: lat, longitude: lng,
  });
}

export async function dispatchPendingSos(io) {
  const [candidates] = await pool.query(
    'SELECT alert_id FROM EMERGENCY_ALERTS WHERE dispatch_after <= NOW(3) ORDER BY dispatch_after, alert_id LIMIT 25',
  );
  let failed = 0;
  for (const { alert_id: id } of candidates) {
    // A lease serializes delivery across API processes and expires if the worker stops.
    try {
      const [claim] = await pool.query(
        'UPDATE EMERGENCY_ALERTS SET dispatch_after = DATE_ADD(NOW(3), INTERVAL 1 MINUTE) WHERE alert_id = ? AND dispatch_after <= NOW(3)',
        [id],
      );
      if (!claim.affectedRows) continue;
      const [[alert]] = await pool.query(
        `SELECT alert_id, user_id, latitude, longitude, location_label, status,
                UNIX_TIMESTAMP(created_at) AS created_at_seconds,
                DATE_FORMAT(dispatch_after, '%Y-%m-%d %H:%i:%s.%f') AS lease,
                created_at >= DATE_SUB(NOW(), INTERVAL 15 MINUTE) AS recent
         FROM EMERGENCY_ALERTS WHERE alert_id = ?`,
        [id],
      );
      if (!alert?.lease) continue;
      await dispatchAlert(alert, io);
      await pool.query(
        'UPDATE EMERGENCY_ALERTS SET dispatch_after = NULL WHERE alert_id = ? AND dispatch_after = ?',
        [id, alert.lease],
      );
    } catch (error) {
      failed++;
      console.error('[SOS Dispatch]:', error.code ?? error.name);
    }
  }
  return { degraded: failed > 0, metrics: { failed } };
}
