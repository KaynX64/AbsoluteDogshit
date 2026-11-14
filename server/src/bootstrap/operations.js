// Defines the Admin Terminal's built-in diagnostics and exposes process status.

import { collectSystemStatus } from './systemStatus.js';
import { randomUUID } from 'node:crypto';
import { pool } from '../db/pool.js';
import { isRedisActive } from '../utils/redisClient.js';
import { getWorkerStats } from '../workers/scheduler.js';

import { events, recordOperation } from './operationEvents.js';
export { recordOperation };

export const instanceId = randomUUID();
export function serverStatus() {
  return { instanceId, uptimeSeconds: Math.floor(process.uptime()), events: [...events] };
}

export const commands = Object.freeze({
  status: async () => ({ instanceId, ...await collectSystemStatus() }),
  health: async () => {
    await pool.query('SELECT 1');
    return { database: 'reachable', redis: isRedisActive() ? 'connected' : 'fallback' };
  },
  workers: getWorkerStats,
  memory: () => Object.fromEntries(Object.entries(process.memoryUsage()).map(([label, bytes]) => [label + 'MiB', Math.round(bytes / 1048576)])),
});
