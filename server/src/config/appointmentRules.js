// server/src/config/appointmentRules.js
//
// Central configuration for appointment-slot availability.
// Tunable per-role, per-type capacity rules. Adjust here, not in routes.

// ─── Clinic operating window ────────────────────────────────────────────
export const CLINIC_HOURS = {
  slotMinutes: 15,          // granularity shown in the mobile UI grid
  hourBlockMinutes: 60,     // capacity is measured per 60-min block
  openTime: '08:00',
  closeTime: '17:00',
  lunchStart: '12:00',
  lunchEnd: '13:00',
};

// ─── Per-role rules ─────────────────────────────────────────────────────
export const APPOINTMENT_RULES = {
  DENTIST: {
    // 'exclusive-hour' = only ONE patient per hour block, all types combined.
    // Booking any 15-min sub-slot (e.g. 08:00) blocks the whole 08:00 hour.
    mode: 'exclusive-hour',
    hourlyCapacity: 1,
    appointmentTypes: [
      'Dental Checkup',
      'Tooth Extraction',
      'Oral Prophylaxis',
      'Toothache Emergency',
    ],
  },

  DOCTOR: {
    // 'shared-hour' = multiple patients per hour block, but each appointment
    // type has its own per-hour cap. If ANY type hits its cap in hour H,
    // the whole hour H+1 is blocked as a recovery buffer.
    mode: 'shared-hour',
    cascadeNextHour: true,
    appointmentTypes: [
      { name: 'General consultation', hourlyCapacity: 10 },
      { name: 'Prescription refill',  hourlyCapacity: 3  },
      { name: 'Medical clearance',    hourlyCapacity: 10 },
      { name: 'Physical examination', hourlyCapacity: 10 },
    ],
  },
};

// ─── Helpers ────────────────────────────────────────────────────────────
export function getHourBlock(hhmm) {
  const h = String(hhmm).split(':')[0].padStart(2, '0');
  return `${h}:00`;
}

export function addHourBlock(hourBlock, hours = 1) {
  const [h] = hourBlock.split(':').map(Number);
  const next = h + hours;
  if (next >= 24) return null;
  return `${String(next).padStart(2, '0')}:00`;
}

export function isLunchBreak(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  const mins = h * 60 + m;
  const [lh, lm] = CLINIC_HOURS.lunchStart.split(':').map(Number);
  const [eh, em] = CLINIC_HOURS.lunchEnd.split(':').map(Number);
  return mins >= lh * 60 + lm && mins < eh * 60 + em;
}

export function isPastSlot(hhmm, dateStr) {
  const now = new Date();
  const target = new Date(`${dateStr}T${hhmm}:00`);
  return target.getTime() < now.getTime();
}