// Checks dependencies, opens the server listener, and starts the background scheduler.

import { once } from 'node:events';
import { logActiveLimits } from '../config/limits.js';
import { getServerPolicy } from '../config/serverPolicy.js';
import { startScheduler } from '../workers/scheduler.js';
import { sendDueAppointmentReminders } from '../workers/appointmentReminderWorker.js';
import { processAppointmentNoShows } from '../workers/noShowWorker.js';
import { processPrescriptionExpiry } from '../workers/prescriptionExpiryWorker.js';
import { backfillDocumentPdfs } from '../workers/documentPdfBackfillWorker.js';
import { initializeDependencies } from './dependencies.js';

// Initialize dependencies, open the listener, and start the registered background workers.
export async function startServer(server, { io, isHttps, signal }) {
  const port = process.env.PORT || 5000;

  await initializeDependencies(signal);
  signal.throwIfAborted();
  const listening = once(server, 'listening');
  server.listen(port);
  await listening;
  signal.throwIfAborted();

  logActiveLimits(getServerPolicy().limits);
  console.log(`✅ Valetudo HealthLink API & WebSockets running on ${isHttps ? 'HTTPS/WSS' : 'HTTP/WS'} port ${port}`);
  const stopWorkers = startScheduler([
    { name: 'Reminder Worker', intervalMs: 15 * 60 * 1000, /* Send due appointment reminders with realtime notifications. */ run: () => sendDueAppointmentReminders(io) },
    { name: 'Auto-No-Show Worker', intervalMs: 60 * 1000, /* Process scheduled appointments that have passed the no-show grace period. */ run: () => processAppointmentNoShows(io), runImmediately: true },
    { name: 'Prescription Expiry Worker', intervalMs: 30 * 60 * 1000, /* Expire due prescriptions and publish their status changes. */ run: () => processPrescriptionExpiry(io), runImmediately: true },
    { name: 'PDF Backfill Worker', intervalMs: 5 * 60 * 1000, run: backfillDocumentPdfs, runImmediately: true },
  ]);
  // Stop the scheduled workers when the listener closes.
  server.once('close', () => { void stopWorkers(); });
  return stopWorkers;
}
