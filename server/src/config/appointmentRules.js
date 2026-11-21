// Defines clinic booking hours and appointment slot rules.
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
// Round a clinic time down to the start of its hour block.
export function getHourBlock(hhmm) {
  const h = String(hhmm).split(':')[0].padStart(2, '0');
  return `${h}:00`;
}

// Shift an hour block within the same calendar day.
export function addHourBlock(hourBlock, hours = 1) {
  const [h] = hourBlock.split(':').map(Number);
  const next = h + hours;
  if (next < 0 || next >= 24) return null;
  return `${String(next).padStart(2, '0')}:00`;
}

// Convert a clinic clock time to minutes since midnight.
export function minutesOf(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  return h * 60 + m;
}

// Return the reason a time falls outside the bookable clinic schedule.
export function scheduleSlotIssue(time, clinic) {
  const minute = minutesOf(time);
  const opens = minutesOf(clinic.openTime);
  if (minute < opens || minute >= minutesOf(clinic.closeTime)) return 'OUTSIDE_CLINIC_HOURS';
  if (minute >= minutesOf(clinic.lunchStart) && minute < minutesOf(clinic.lunchEnd)) return 'LUNCH_BREAK';
  return (minute - opens) % clinic.slotMinutes === 0 ? null : 'OFF_SLOT_GRID';
}

// Compare a local booking date and time to the current time.
export function isPastSlot(hhmm, dateStr) {
  const now = new Date();
  const target = new Date(`${dateStr}T${hhmm}:00`);
  return target.getTime() < now.getTime();
}

// Verify that the input is a real calendar date in YYYY-MM-DD form.
export function isCalendarDate(date) {
  if (typeof date !== 'string' || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(date)) return false;
  const instant = new Date(`${date}T00:00:00Z`);
  return Number.isFinite(instant.getTime()) && instant.toISOString().slice(0, 10) === date;
}

// Flutter sends clinic-local wall time. Offset-bearing ISO input is converted
// to the server's clinic-local clock before validation and storage.
export function parseBookingTime(input) {
  if (typeof input !== 'string') return null;
  const parts = /^(\d{4}-\d{2}-\d{2})[T ]((?:[01]\d|2[0-3]):[0-5]\d)(?::(00)(?:\.0{1,3})?)?(Z|[+-]\d{2}:\d{2})?$/.exec(input);
  if (!parts || !isCalendarDate(parts[1])) return null;
  let [, date, time, , offset] = parts;
  if (offset) {
    const instant = new Date(`${date}T${time}:00${offset}`);
    if (!Number.isFinite(instant.getTime())) return null;
    // Pad a date or time component to two digits.
    const pad = (value) => String(value).padStart(2, '0');
    date = `${instant.getFullYear()}-${pad(instant.getMonth() + 1)}-${pad(instant.getDate())}`;
    time = `${pad(instant.getHours())}:${pad(instant.getMinutes())}`;
  }
  return { date, time, dateTime: `${date} ${time}:00` };
}

// Group existing bookings by clinic hour and appointment type.
export function groupBookingsByHour(bookings) {
  const hours = {};
  for (const booking of bookings) {
    const hour = getHourBlock(booking.time_slot);
    const counts = hours[hour] ??= Object.create(null);
    counts[booking.appointment_type] = (counts[booking.appointment_type] || 0) + 1;
  }
  return hours;
}

// Check whether a booking in the previous block requires a recovery hour.
export function isRecoveryBlocked(hour, hours, rules) {
  const previousHour = addHourBlock(hour, -1);
  if (!rules.cascadeNextHour || !previousHour) return false;
  // Check whether a type reached its hourly limit in the previous block.
  return rules.appointmentTypes.some(({ name, hourlyCapacity }) => (hours[previousHour]?.[name] || 0) >= hourlyCapacity);
}

// Calculate remaining availability by appointment type for one hour block.
export function availabilityForHour(hour, hours, rules, unavailable = false) {
  const counts = hours[hour] || {};
  if (rules.mode === 'exclusive-hour') {
    // Total bookings across all appointment types in the block.
    const booked = Object.values(counts).reduce((sum, value) => sum + value, 0);
    const capacity = rules.hourlyCapacity;
    // Apply the shared capacity result to each type in an exclusive hour.
    return Object.fromEntries(rules.appointmentTypes.map((name) => [name, { booked, capacity, available: !unavailable && booked < capacity }]));
  }
  // Calculate availability using each type's own capacity.
  return Object.fromEntries(rules.appointmentTypes.map(({ name, hourlyCapacity: capacity }) => {
    const booked = counts[name] || 0;
    return [name, { booked, capacity, available: !unavailable && booked < capacity }];
  }));
}
