import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth.js';
import { decrypt } from '../../utils/cryptoVault.js';
import { sendPushToUsers } from '../../utils/fcmNotifier.js';
import { logAudit } from '../../utils/auditLogger.js';
import { redis, isRedisActive, invalidateCache } from '../../utils/redisClient.js';
import { getServerPolicy } from '../../config/serverPolicy.js';
import { redactForTier, getResponderAudience, roleLabelFor } from '../../utils/responderAccess.js';

// ── Rate Limiter Middleware para sa SOS ─────────────────────────────
function sosRateLimitKey(userIdOrIp) {
  return `ratelimit:sos:${userIdOrIp}`;
}

async function sosRateLimit(req, res, next) {
  const { sos: SOS_LIMIT } = getServerPolicy().limits;
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

export function registerSosRoutes(router, io) {
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
}
