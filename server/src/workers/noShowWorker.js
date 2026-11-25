// Applies the active no-show rule and publishes updates for affected appointments.

import { getServerPolicy } from '../config/serverPolicy.js';
import { markDueAppointmentsNoShow } from '../appointments/noShow.js';
import { drainDueBatches } from './dueBatches.js';

// Mark overdue appointments using the active policy and broadcast committed changes.
export function processAppointmentNoShows(io, signal) {
  const { graceMinutes } = getServerPolicy().limits.noShow;
  return drainDueBatches(() => markDueAppointmentsNoShow(graceMinutes), ids => {
    console.log(`[Auto-No-Show] Marked ${ids.length} appointment(s) as no-show.`);
    for (const id of ids) {
      io?.emit('appointment:status_changed', {
        appointment_id: id,
        status: 'no_show',
      });
    }
    io?.emit('queue:updated');
  }, signal);
}
