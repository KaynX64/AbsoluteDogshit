// Rate-limits and records SOS alerts, then notifies eligible responders with tiered data.

import { pool } from '../../db/pool.js';
import { authenticateToken } from '../../auth/middleware.js';
import { createHash } from 'node:crypto';
import { inTransaction } from '../../db/transaction.js';
import { logAudit } from '../../utils/auditLogger.js';
import { redis, isRedisActive } from '../../utils/redisClient.js';
import { getServerPolicy } from '../../config/serverPolicy.js';

// ── Rate Limiter Middleware para sa SOS ─────────────────────────────
// Build the Redis throttling key for the caller's user ID or IP.
function sosRateLimitKey(userIdOrIp) {
  return `ratelimit:sos:${userIdOrIp}`;
}

// Rate-limit SOS submission using the caller's account or IP.
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
// Resolve an SOS position to a display address or use the campus fallback.
async function resolveCampusAddress(lat, lng) {
  // 1. Kung may Google Maps API Key sa environment
  if (process.env.GOOGLE_MAPS_API_KEY) {
    try {
      const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${process.env.GOOGLE_MAPS_API_KEY}`;
      const response = await fetch(url, { signal: AbortSignal.timeout(1_500) });
      const data = await response.json();
      if (data.results && data.results.length > 0) {
        const address = data.results[0].formatted_address;
        if (typeof address === 'string' && address.trim()) return address.trim().slice(0, 512);
      }
    } catch (_) {}
  }

  // 2. Intelligent PSU Lingayen Campus Boundary Landmark Resolver (Offline/Fallback)
  // Campus center: 16.0298, 120.2285
  const dLat = Math.abs(lat - 16.0298);
  const dLng = Math.abs(lng - 120.2285);

  if (dLat < 0.005 && dLng < 0.005) {
    if (lat >= 16.0298 && lng >= 120.2285) {
      return 'Near PSU Lingayen - Science & Technology Complex / East Grounds';
    } else if (lat < 16.0298 && lng < 120.2285) {
      return 'Near PSU Lingayen - University Infirmary & Student Pavilion';
    } else {
      return 'Near PSU Lingayen - Administration Building / Library Quadrangle';
    }
  }

  return null;
}

// Validate legacy coordinates and bind keyed retries to their original contents.
function parseSos(req, res, next) {
  const { latitude, longitude, notes, client_sos_id: id } = req.body ?? {};
  const coordinate = value => typeof value === 'number' ||
    (typeof value === 'string' && value.trim() !== '');
  const lat = Number(latitude), lng = Number(longitude);
  if (!coordinate(latitude) || !coordinate(longitude) || !Number.isFinite(lat) ||
      !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'Invalid geographic coordinates provided.' });
  }
  if ((id !== undefined || /\/requests\/?$/.test(req.path)) &&
      (typeof id !== 'string' || !/^[0-9a-f]{32}$/.test(id))) {
    return res.status(400).json({ error: 'Invalid SOS request ID.' });
  }
  if (notes != null && (typeof notes !== 'string' || notes.length > 2000)) {
    return res.status(400).json({ error: 'SOS notes must be text of at most 2000 characters.' });
  }
  const text = notes?.trim() || 'Emergency SOS pressed';
  const hash = id ? createHash('sha256').update(JSON.stringify([lat, lng, text])).digest('hex') : null;
  res.locals.sos = { userId: req.user.user_id, lat, lng, text, id: id ?? null, hash };
  next();
}

async function readAccepted({ userId, id }) {
  const [[alert]] = await pool.query(
    'SELECT alert_id, location_label, request_hash FROM EMERGENCY_ALERTS WHERE user_id = ? AND client_sos_id = ?',
    [userId, id],
  );
  return alert;
}

function replyWithReceipt(res, alert, replayed) {
  if (replayed && alert.request_hash !== res.locals.sos.hash) {
    return res.status(409).json({ error: 'SOS request contents changed.', code: 'SOS_REQUEST_MISMATCH' });
  }
  return res.status(replayed ? 200 : 201).json({
    message: 'Emergency alert accepted by the server.',
    alertId: Number(alert.alert_id),
    formattedAddress: alert.location_label,
    replayed,
  });
}

async function reconcileSos(_req, res, next) {
  const request = res.locals.sos;
  if (!request.id) return next();
  try {
    const accepted = await readAccepted(request);
    if (accepted) return replyWithReceipt(res, accepted, true);
    next();
  } catch (error) {
    console.error('[SOS Receipt]:', error.code ?? error.name);
    res.status(503).json({ error: 'Could not verify SOS receipt.' });
  }
}

// Persist the alert and its dispatch schedule in the same audited transaction.
export function registerSosRoutes(router) {
  router.post(['/sos', '/sos/requests'], authenticateToken, parseSos, reconcileSos, sosRateLimit, async (req, res) => {
    const request = res.locals.sos;
    const { userId, lat, lng, text, id, hash } = request;
    try {
      const address = await resolveCampusAddress(lat, lng);
      const notes = text + ' · Loc: ' + (address ?? (lat.toFixed(5) + ', ' + lng.toFixed(5)));
      const alertId = await inTransaction(async connection => {
        const [result] = await connection.query(
          "INSERT INTO EMERGENCY_ALERTS (user_id, location, notes, location_label, client_sos_id, request_hash, dispatch_after) VALUES (?, ST_SRID(POINT(?, ?), 4326), ?, ?, ?, ?, NOW(3))",
          [userId, lng, lat, notes, address, id, hash],
        );
        await logAudit(connection, {
          userId, action: 'CREATE', table: 'EMERGENCY_ALERTS', recordId: result.insertId,
          oldValue: null, newValue: { latitude: lat, longitude: lng, formattedAddress: address, notes },
          ipAddress: req.ip,
        });
        return result.insertId;
      });
      return replyWithReceipt(res, { alert_id: alertId, location_label: address }, false);
    } catch (error) {
      if (id && error.code === 'ER_DUP_ENTRY') {
        try {
          const accepted = await readAccepted(request);
          if (accepted) return replyWithReceipt(res, accepted, true);
        } catch (lookupError) {
          console.error('[SOS Receipt]:', lookupError.code ?? lookupError.name);
        }
      }
      console.error('[SOS Submission]:', error.code ?? error.name);
      res.status(503).json({ error: 'Could not verify SOS receipt.' });
    }
  });
}
