// Starts the local backup scheduler when the API uses the repository's Compose stores.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { followBackupStatus } from './backupStatus.js';

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
export async function ensureBackupScheduler(signal, { showStatus = false } = {}) {
  const autoStart = process.env.BACKUP_AUTO_START !== 'false';
  if (signal.aborted || (!autoStart && !showStatus) || !usesLocalComposeStores()) return;

  const options = { cwd: projectRoot, signal, windowsHide: true };
  const since = new Date().toISOString();
  let action = 'check';
  try {
    const { stdout } = await run('docker', [
      ...compose, 'ps', '--all', '--no-trunc', '--format',
      '{{.Project}} {{.Service}} {{.State}} {{.ID}} {{.Label "com.docker.compose.oneoff"}}',
      'mysql', 'minio', 'backup',
    ], { ...options, timeout: 10_000 });
    const containers = stdout.trim().split(/\r?\n/).filter(Boolean).map(line => {
      const [project, service, state, id, oneOff] = line.split(/\s+/);
      return { project, service, state, id, manual: oneOff?.toLowerCase() === 'true' };
    });
    const running = containers.filter(container => container.state === 'running');
    const services = new Set(running.filter(container => !container.manual).map(container => container.service));

    if (showStatus && containers.length > 0) {
      followBackupStatus(containers[0].project, since, running.filter(container => container.service === 'backup'), options);
    }
    if (services.has('backup')) {
      if (showStatus) console.info('[backup] Docker backup scheduler is running.');
      return;
    }
    if (!autoStart) {
      console.info('[backup] Docker backup scheduler is stopped and automatic startup is disabled.');
      return;
    }
    if (!services.has('mysql') || !services.has('minio')) {
      console.warn('[backup] Automatic startup skipped because the Compose MySQL and MinIO services must both be running.');
      return;
    }

    action = 'start';
    await run('docker', [
      ...compose, 'up', '--build', '--no-deps', '--no-recreate', '--wait', '--wait-timeout', '20', 'backup',
    ], { ...options, timeout: 180_000 });
    console.info('[backup] Docker backup scheduler started.');
  } catch (error) {
    if (signal.aborted) return;
    if (error.code === 'ENOENT') {
      console.warn('[backup] Docker CLI is unavailable.');
    } else if (error.killed) {
      console.warn(`[backup] Docker Compose timed out during the scheduler ${action}.`);
    } else {
      console.warn(`[backup] Docker Compose could not ${action} the scheduler. Check that Docker is running and the backup service is available.`);
    }
  }
}
