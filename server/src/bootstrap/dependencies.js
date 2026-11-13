import { pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';
import { loadServerPolicy } from '../utils/serverPolicyStore.js';
import { initRedis, redis } from '../utils/redisClient.js';
import { ensureBucketExists, s3 } from '../utils/s3Vault.js';

export async function initializeDependencies(signal) {
  await runMigrations(pool);
  signal.throwIfAborted();
  await loadServerPolicy();
  signal.throwIfAborted();

  await Promise.all([
    initRedis(),
    ensureBucketExists(AbortSignal.any([signal, AbortSignal.timeout(10_000)])),
  ]);
  signal.throwIfAborted();
}

export async function closeDependencies() {
  redis.disconnect();
  s3.destroy();
  await pool.end();
}
