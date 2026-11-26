// Validates and creates appointments under the booking policy and sends confirmation after commit.

import { pool } from '../../../db/pool.js';
import { inTransaction, isLockContention } from '../../../db/transaction.js';
import { fail } from '../../../utils/httpError.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requirePrivacyConsent } from '../../../middleware/consent.js';
import { logAudit } from '../../../utils/auditLogger.js';
import { redis, isRedisActive } from '../../../utils/redisClient.js';
import { sendBookedPatientEmail } from '../../../appointments/patientEmail.js';
import {
  addHourBlock,
  availabilityForHour,
  getHourBlock,
  groupBookingsByHour,
  isPastSlot,
  isRecoveryBlocked,
  parseBookingTime,
  scheduleSlotIssue,
} from '../../../config/appointmentRules.js';
import { getServerPolicy } from '../../../config/serverPolicy.js';
import { readServerPolicy } from '../../../utils/serverPolicyStore.js';

// ── Rate Limiter Middleware para sa Booking (Audit Security Issue #6) ───────
// Apply the configured booking limit before a request can reserve a slot.
async function bookingRateLimit(req, res, next) {
  const { booking: BOOKING_LIMIT } = getServerPolicy().limits;
  if (!isRedisActive()) return next();

  const identifier = req.user?.user_id || req.ip || 'unknown';
  const key = `ratelimit:booking:${identifier}`;

  try {
    const count = await redis.incr(key);

    if (count === 1) {
      await redis.expire(key, BOOKING_LIMIT.windowSeconds);
    }

    if (count > BOOKING_LIMIT.maxAttempts) {
      const ttl = await redis.ttl(key);
      const retrySec = ttl > 0 ? ttl : BOOKING_LIMIT.windowSeconds;
      res.setHeader('Retry-After', String(retrySec));
      return res.status(429).json({
        error: `Too many booking attempts. Please wait ${retrySec} second(s) before trying again.`,
      });
    }

    res.setHeader(
      'X-RateLimit-Remaining',
      String(Math.max(0, BOOKING_LIMIT.maxAttempts - count))
    );
    next();
  } catch (err) {
    console.error('[Booking Rate Limit Error]:', err.message);
    next();
  }
}

// Mount the rate-limited appointment booking endpoint.
export function registerBookingCreation(router, io) {
  // Validate the requested slot, reserve it within clinic capacity, and confirm the booking.
  router.post('/', authenticateToken, requirePrivacyConsent, bookingRateLimit, async (req, res) => {
    const { doctor_user_id, date_time: requestedTime, appointment_type, notes } = req.body;
    const patientUserId = req.user.user_id;

    if (!doctor_user_id || !requestedTime || !appointment_type) {
      return res.status(400).json({ error: 'doctor_user_id, date_time, and appointment_type are required.' });
    }

    const slot = parseBookingTime(requestedTime);
    if (!slot) return res.status(400).json({ error: 'Choose a valid appointment date and time at a whole minute.' });
    const { date: dateStr, time: timeStr, dateTime: date_time } = slot;

    let appointmentId;
    try {
      appointmentId = await inTransaction(async connection => {
        // Hold the policy version through the insert. Policy edits take the
        // exclusive lock and bookings for different practitioners may proceed.
        const { clinic, appointments } = await readServerPolicy(connection, 'FOR SHARE');
        const slotIssue = scheduleSlotIssue(timeStr, clinic);
        if (slotIssue || isPastSlot(timeStr, dateStr)) {
          const code = slotIssue || 'SLOT_IN_PAST';
          const messages = {
            OUTSIDE_CLINIC_HOURS: 'That time is outside the current clinic hours.',
            LUNCH_BREAK: 'That time is within the current clinic lunch break.',
            OFF_SLOT_GRID: 'That time is not on the current clinic slot grid.',
            SLOT_IN_PAST: 'That time has already passed.',
          };
          throw Object.assign(fail(messages[code] + ' Please choose another time.', 409), { code });
        }

        // Serialize capacity checks for this practitioner, even for an empty day.
        const [practitioner] = await connection.query(
          'SELECT user_id FROM USERS WHERE user_id = ? AND is_active = TRUE AND deleted_at IS NULL FOR UPDATE',
          [doctor_user_id],
        );
        if (!practitioner.length) throw new Error('Selected practitioner is unavailable.');

        const [roleRows] = await connection.query(
          `SELECT r.code
           FROM USERS u
           JOIN USER_ROLES ur ON u.user_id = ur.user_id
           JOIN ROLES r ON ur.role_id = r.role_id
           WHERE u.user_id = ? AND r.code IN ('DOCTOR', 'DENTIST')
           LIMIT 1`,
          [doctor_user_id]
        );

        if (roleRows.length === 0) {
          throw new Error('Selected practitioner is not a valid doctor or dentist.');
        }

        const doctorRole = roleRows[0].code;
        const rules = appointments[doctorRole];
        const hourBlock = getHourBlock(timeStr);
        const firstHour = addHourBlock(hourBlock, -1) ?? hourBlock;

        const [bookings] = await connection.query(
          `SELECT DATE_FORMAT(date_time, '%H:%i') AS time_slot, appointment_type
           FROM APPOINTMENTS FORCE INDEX (idx_app_doctor_datetime)
           WHERE doctor_user_id = ?
             AND date_time >= ? AND date_time < DATE_ADD(?, INTERVAL 1 HOUR)
             AND status IN ('scheduled', 'checked_in', 'serving')
             AND deleted_at IS NULL`,
          [doctor_user_id, `${dateStr} ${firstHour}:00`, `${dateStr} ${hourBlock}:00`]
        );
        const bookingsByHour = groupBookingsByHour(bookings);
        const availability = availabilityForHour(hourBlock, bookingsByHour, rules);
        if (!Object.hasOwn(availability, appointment_type)) {
          throw new Error('The selected practitioner does not offer that appointment type.');
        }
        const isCascadeBlocked = isRecoveryBlocked(hourBlock, bookingsByHour, rules);
        if (isCascadeBlocked || !availability[appointment_type].available) {
          const message = isCascadeBlocked ? 'This hour is reserved as a recovery buffer. Please choose a later slot.'
            : 'This hour has reached capacity for the selected appointment type. Please choose another time.';
          throw Object.assign(fail(message, 409), { code: 'SLOT_UNAVAILABLE' });
        }

        const [insertResult] = await connection.query(
          `INSERT INTO APPOINTMENTS (patient_user_id, doctor_user_id, date_time, appointment_type, status, notes)
           VALUES (?, ?, ?, ?, 'scheduled', ?)`,
          [patientUserId, doctor_user_id, date_time, appointment_type, notes || '']
        );

        await logAudit(connection, {
          userId: patientUserId,
          action: 'CREATE',
          table: 'APPOINTMENTS',
          recordId: insertResult.insertId,
          oldValue: null,
          newValue: { doctor_user_id, date_time, appointment_type },
          ipAddress: req.ip,
        });

        return insertResult.insertId;
      }, { readCommitted: true, retries: 2 });
    } catch (error) {
      if (isLockContention(error) || error.commitUncertain) {
        return res.set('Retry-After', '1').status(503).json({ error: 'Booking is temporarily unavailable.' });
      }
      if (error.status === 409) return res.status(409).json({ error: error.message, code: error.code });
      console.error('[Appointments] Booking error:', error.code ?? error.name);
      if (error.code) return res.status(500).json({ error: 'Failed to book appointment.' });
      return res.status(400).json({ error: error.message || 'Failed to book appointment.' });
    }

    // All clients can refresh availability. Booking details are read through authorized endpoints.
    io?.emit('appointment:booked', {});
    res.status(201).json({
      message: 'Consultation scheduled successfully.',
      appointmentId,
    });
    void sendBookedPatientEmail(patientUserId, date_time, 'confirmation');
  });
}
