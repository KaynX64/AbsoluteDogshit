// Applies the active no-show rule and publishes updates for affected appointments.

import { getServerPolicy } from '../config/serverPolicy.js';
import { markDueAppointmentsNoShow } from '../appointments/noShow.js';

export async function processAppointmentNoShows(io) {
  const { graceMinutes } = getServerPolicy().limits.noShow;
  const ids = await markDueAppointmentsNoShow(graceMinutes);
  if (ids.length === 0) return;

  console.log(`[Auto-No-Show] Marked ${ids.length} appointment(s) as no-show.`);

  if (io) {
    for (const id of ids) {
      io.emit('appointment:status_changed', {
        appointment_id: id,
        status: 'no_show',
      });
    }
    io.emit('queue:updated');
  }
}
