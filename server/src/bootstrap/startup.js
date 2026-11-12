import { logActiveLimits } from '../config/limits.js';
import { getServerPolicy } from '../config/serverPolicy.js';
import { loadServerPolicy } from '../utils/serverPolicyStore.js';
import { startReminderScheduler } from '../utils/reminderWorker.js';
import { ensureBucketExists } from '../utils/s3Vault.js';
import { initRedis } from '../utils/redisClient.js';
import { pool } from '../db/pool.js';
import { runMigrations } from '../db/migrate.js';

export async function startServer(server, { io, isHttps }) {
  const PORT = process.env.PORT || 5000;

  await runMigrations(pool);
  await loadServerPolicy();
  server.listen(PORT, async () => {
    console.log(`✅ Valetudo HealthLink API & WebSockets running on ${isHttps ? 'HTTPS/WSS' : 'HTTP/WS'} port ${PORT}`);
    await initRedis().catch(error => {
      console.warn('[startup] Redis initialization failed. Cache fallback remains available.', error?.code || error?.name);
    });
    await ensureBucketExists().catch(error => {
      console.warn('[startup] Object storage initialization failed. Document storage may be unavailable.', error?.code || error?.name);
    });
    logActiveLimits(getServerPolicy().limits);
    startReminderScheduler(io);
  });
}
