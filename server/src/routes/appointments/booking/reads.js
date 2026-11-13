import { pool } from '../../../db/pool.js';
import { authenticateToken } from '../../../auth/middleware.js';
import { requirePrivacyConsent } from '../../../middleware/consent.js';
import {
  availabilityForHour,
  getHourBlock,
  groupBookingsByHour,
  isCalendarDate,
  isPastSlot,
  isRecoveryBlocked,
  minutesOf,
  scheduleSlotIssue,
} from '../../../config/appointmentRules.js';
import { getServerPolicy } from '../../../config/serverPolicy.js';

export function registerBookingReads(router) {
  // ===========================================================================
  // 1. DOCTOR & PRACTITIONER ROSTER
  // ===========================================================================

  router.get('/doctors', authenticateToken, async (req, res) => {
    try {
      const [doctors] = await pool.query(
        `SELECT u.user_id, u.first_name, u.last_name, u.email,
                r.code AS role_code, r.name AS role_name,
                sp.license_no,
                COALESCE(sp.specialty, 'General Practitioner') AS specialty,
                COALESCE(sp.department, 'University Infirmary') AS department
         FROM USERS u
         JOIN USER_ROLES ur ON u.user_id = ur.user_id
         JOIN ROLES r ON ur.role_id = r.role_id
         LEFT JOIN STAFF_PROFILES sp ON u.user_id = sp.user_id
         WHERE r.code IN ('DOCTOR', 'DENTIST')
           AND u.is_active = TRUE
           AND u.deleted_at IS NULL
         ORDER BY u.first_name ASC`
      );
      res.json(doctors);
    } catch (error) {
      console.error('[Appointments] Error fetching doctors:', error);
      res.status(500).json({ error: 'Failed to retrieve available practitioners.' });
    }
  });

  // ===========================================================================
  // 2. TIME SLOT AVAILABILITY
  // ===========================================================================
  router.get('/slots', authenticateToken, async (req, res) => {
    const { doctorId, date } = req.query;

    if (!doctorId || !isCalendarDate(date)) {
      return res.status(400).json({ error: 'Supply a practitioner and a valid date (YYYY-MM-DD).' });
    }
    const policy = getServerPolicy();
    const clinic = policy.clinic;

    try {
      const [roleRows] = await pool.query(
        `SELECT r.code
         FROM USERS u
         JOIN USER_ROLES ur ON u.user_id = ur.user_id
         JOIN ROLES r ON ur.role_id = r.role_id
         WHERE u.user_id = ? AND r.code IN ('DOCTOR', 'DENTIST')
         LIMIT 1`,
        [doctorId]
      );
      const doctorRole = roleRows[0]?.code || 'DOCTOR';
      const rules = policy.appointments[doctorRole];

      const [bookings] = await pool.query(
        `SELECT DATE_FORMAT(date_time, '%H:%i') AS time_slot, appointment_type
         FROM APPOINTMENTS
         WHERE doctor_user_id = ?
           AND date_time BETWEEN ? AND ?
           AND status IN ('scheduled', 'checked_in', 'serving')
           AND deleted_at IS NULL`,
        [doctorId, `${date} 00:00:00`, `${date} 23:59:59.999999`]
      );

      const bookingsByHour = groupBookingsByHour(bookings);
      const slots = [];
      for (let minute = minutesOf(clinic.openTime); minute < minutesOf(clinic.closeTime); minute += clinic.slotMinutes) {
        const time = String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0');
        const hourBlock = getHourBlock(time);
        const isLunchBreak = scheduleSlotIssue(time, clinic) === 'LUNCH_BREAK';
        const isPast = isPastSlot(time, date);
        const isCascadeBlocked = isRecoveryBlocked(hourBlock, bookingsByHour, rules);
        const availabilityByType = availabilityForHour(hourBlock, bookingsByHour, rules, isLunchBreak || isPast || isCascadeBlocked);
        slots.push({
          time, hourBlock, isPast, isLunchBreak, isCascadeBlocked, availabilityByType,
          isAvailable: Object.values(availabilityByType).some((entry) => entry.available),
        });
      }

      res.json({
        doctorRole,
        doctorId: Number(doctorId),
        date,
        policyVersion: policy.version,
        rules: {
          mode: rules.mode,
          hourlyCapacity: rules.hourlyCapacity,
          cascadeNextHour: rules.cascadeNextHour || false,
          appointmentTypes: rules.appointmentTypes,
        },
        slots,
      });
    } catch (error) {
      console.error('[Appointments] Error fetching slots:', error);
      res.status(500).json({ error: 'Failed to retrieve available slots.' });
    }
  });

  // ===========================================================================
  // 3. PATIENT APPOINTMENT BOOKING & HISTORY
  // ===========================================================================

  router.get('/my', authenticateToken, requirePrivacyConsent, async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT a.appointment_id,
                a.date_time,
                DATE_FORMAT(a.date_time, '%Y-%m-%d %H:%i:%s') AS formatted_date_time,
                a.appointment_type,
                a.status,
                a.notes,
                a.cancelled_reason,
                a.booked_at,
                doc.first_name AS doctor_first_name,
                doc.last_name AS doctor_last_name,
                COALESCE(sp.specialty, 'Infirmary Physician') AS doctor_specialty
         FROM APPOINTMENTS a
         JOIN USERS doc ON a.doctor_user_id = doc.user_id
         LEFT JOIN STAFF_PROFILES sp ON doc.user_id = sp.user_id
         WHERE a.patient_user_id = ?
           AND a.deleted_at IS NULL
         ORDER BY a.date_time DESC`,
        [req.user.user_id]
      );
      res.json(rows);
    } catch (error) {
      console.error('[Appointments] Error fetching user appointments:', error);
      res.status(500).json({ error: 'Failed to retrieve appointments.' });
    }
  });
}
