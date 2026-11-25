// Defines the Admin Terminal's built-in diagnostics and exposes process status.

import { collectSystemStatus } from './systemStatus.js';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { isRedisActive } from '../utils/redisClient.js';
import { getWorkerStats } from '../workers/scheduler.js';
import { loadMetrics } from './loadMetrics.js';

import { events, recordOperation } from './operationEvents.js';
export { recordOperation };

export const instanceId = randomUUID();
// Return this API instance's identity, uptime, and recent Terminal events.
export function serverStatus() {
  return { instanceId, uptimeSeconds: Math.floor(process.uptime()), events: [...events] };
}

export const commands = Object.freeze({
  // Collect system and dependency status for the Terminal status command.
  status: async () => ({ instanceId, ...await collectSystemStatus(), load: loadMetrics() }),
  // Check MySQL connectivity and report whether Redis is ready or in fallback mode.
  health: async () => {
    await pool.query('SELECT 1');
    return { database: 'reachable', redis: isRedisActive() ? 'connected' : 'fallback' };
  },
  workers: getWorkerStats,
  // Convert the process memory counters to whole mebibytes for the Terminal.
  memory: () => Object.fromEntries(Object.entries(process.memoryUsage()).map(/* Convert one process memory counter from bytes to mebibytes. */ ([label, bytes]) => [label + 'MiB', Math.round(bytes / 1048576)])),
});
