import { expireDuePrescriptions } from '../services/prescriptions/expirePrescriptions.js';

export async function processPrescriptionExpiry(io) {
  const ids = await expireDuePrescriptions();
  if (ids.length === 0) return;

  console.log(`[Prescription Expiry Worker] Marked ${ids.length} prescription(s) as expired.`);
  io?.emit('prescription:status_changed', {
    status: 'expired',
    count: ids.length,
    prescription_ids: ids,
  });
}
