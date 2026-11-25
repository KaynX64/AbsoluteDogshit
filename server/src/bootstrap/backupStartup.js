// Starts the local backup scheduler when the API uses the repository's Compose stores.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const run = promisify(execFile);
const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const compose = ['compose', '--profile', 'backup'];
const loopbackHosts = new Set(['localhost', '127.0.0.1']);

function usesLocalComposeStores() {
  const address = process.env.S3_ENDPOINT || 'http://127.0.0.1:9000';
  if (!URL.canParse(address)) return false;
  const endpoint = new URL(address);
  return loopbackHosts.has(process.env.DB_HOST || '127.0.0.1') &&
    (Number(process.env.DB_PORT) || 3307) === 3307 &&
    (process.env.DB_NAME || 'valetudo_healthlink') === 'valetudo_healthlink' &&
    endpoint.protocol === 'http:' && endpoint.port === '9000' && loopbackHosts.has(endpoint.hostname);
}

// Share the scheduler's saved state and avoid replacing an already running container.
export async function ensureBackupScheduler(signal) {
  if (signal.aborted || process.env.BACKUP_AUTO_START === 'false' || !usesLocalComposeStores()) return;

  const options = { cwd: projectRoot, signal, windowsHide: true };
  let action = 'check';
  try {
    const { stdout } = await run('docker', [
      ...compose, 'ps', '--services', '--status', 'running', 'mysql', 'minio', 'backup',
    ], { ...options, timeout: 10_000 });
    const running = new Set(stdout.split(/\s+/));
    if (running.has('backup')) return;
    if (!running.has('mysql') || !running.has('minio')) {
      console.warn('[backup] Automatic startup skipped because the Compose MySQL and MinIO services must both be running.');
      return;
    }

    action = 'start';
    await run('docker', [
      ...compose, 'up', '--build', '--no-deps', '--no-recreate', '--wait', '--wait-timeout', '20', 'backup',
    ], { ...options, timeout: 180_000 });
    console.info('[backup] Docker backup scheduler started. Check the backup container logs for capture status.');
  } catch (error) {
    if (signal.aborted) return;
    if (error.code === 'ENOENT') {
      console.warn('[backup] Automatic startup skipped because Docker CLI is unavailable.');
    } else if (error.killed) {
      console.warn(`[backup] Docker Compose timed out during the scheduler ${action}.`);
    } else {
      console.warn(`[backup] Docker Compose could not ${action} the scheduler. Check that Docker is running and the backup service is available.`);
    }
  }
}
