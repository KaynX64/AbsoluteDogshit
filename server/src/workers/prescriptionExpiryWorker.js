// Runs prescription expiry and notifies clients of committed status changes.

import { expireDuePrescriptions } from '../documents/prescriptions/expirePrescriptions.js';
import { drainDueBatches } from './dueBatches.js';

// Expire eligible prescriptions and broadcast their committed status changes.
export function processPrescriptionExpiry(io, signal) {
  return drainDueBatches(expireDuePrescriptions, ids => {
    console.log(`[Prescription Expiry Worker] Marked ${ids.length} prescription(s) as expired.`);
    io?.emit('prescription:status_changed', { status: 'expired', count: ids.length, prescription_ids: ids });
  }, signal);
}
