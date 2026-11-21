// Collects host resources, server version and uptime, and MySQL, Redis, and MinIO health.

import os from 'node:os';
import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { HeadBucketCommand } from '@aws-sdk/client-s3';
import { pool } from '../db/pool.js';
import { redis, isRedisActive } from '../utils/redisClient.js';
import { s3, BUCKET_NAME } from '../utils/s3Vault.js';

const runFile = promisify(execFile);
const { version: serverVersion } = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
let coreProbe;

// Report host memory totals and read Linux's available memory estimate when available.
async function memorySnapshot() {
  const totalBytes = os.totalmem();
  let availableBytes = os.freemem();
  if (process.platform === 'linux') {
    try {
      const info = await readFile('/proc/meminfo', 'utf8');
      const availableKiB = info.match(/^MemAvailable:\s+(\d+) kB/m)?.[1];
      if (availableKiB !== undefined) availableBytes = Number(availableKiB) * 1024;
    } catch {
      // Fall back to the portable free-memory reading.
    }
  }
  availableBytes = Math.min(totalBytes, availableBytes);
  return { totalBytes, availableBytes, usedBytes: totalBytes - availableBytes };
}

// Determine the number of physical CPU cores using the host's platform facilities.
async function physicalCores() {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await runFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '(Get-CimInstance Win32_Processor | Measure-Object NumberOfCores -Sum).Sum'], { windowsHide: true, timeout: 3000 });
      return Number(stdout.trim()) || null;
    }
    if (process.platform === 'darwin') {
      const { stdout } = await runFile('/usr/sbin/sysctl', ['-n', 'hw.physicalcpu'], { timeout: 3000 });
      return Number(stdout.trim()) || null;
    }
    if (process.platform === 'linux') {
      const info = await readFile('/proc/cpuinfo', 'utf8');
      // Form a physical package and core identifier from a Linux CPU record.
      const pairs = info.split(/\r?\n\r?\n/).flatMap(block => {
        const cpuPackage = block.match(/^physical id\s*:\s*(\d+)/m)?.[1];
        const core = block.match(/^core id\s*:\s*(\d+)/m)?.[1];
        return cpuPackage !== undefined && core !== undefined ? [cpuPackage + ':' + core] : [];
      });
      return new Set(pairs).size || null;
    }
  } catch {
    // Some virtual machines do not expose physical topology.
  }
  return null;
}

const activeProbes = new Map();

// Reuse one pending check per service and bound the wait for its result.
async function probe(service, work, fallback = 'Unavailable') {
  let timer;
  try {
    if (!activeProbes.has(service)) {
      activeProbes.set(service, Promise.resolve().then(work).finally(/* Release the service's pending probe entry when the check settles. */ () => activeProbes.delete(service)));
    }
    const version = await Promise.race([
      activeProbes.get(service),
      new Promise(/* Schedule a timeout promise for the dependency probe. */ (_, reject) => { timer = setTimeout(/* Reject the probe wait after its diagnostic deadline. */ () => reject(new Error('Probe timed out')), 3500); }),
    ]);
    return { status: 'Operational', version: version || null };
  } catch {
    return { status: fallback, version: null };
  } finally {
    clearTimeout(timer);
  }
}

// Check bucket reachability and read the available object-storage version details.
async function minioVersion() {
  const bucket = await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }), { abortSignal: AbortSignal.timeout(3000) });
  // S3-compatible endpoints do not have to disclose their release.
  const version = bucket.$response?.headers?.['x-minio-version'];
  return version || process.env.MINIO_RELEASE || null;
}

let pending;
// Share a single pending status snapshot across simultaneous requests.
export function collectSystemStatus() {
  pending ??= sampleSystemStatus().finally(/* Clear the shared snapshot promise so the next request can sample again. */ () => { pending = undefined; });
  return pending;
}

// Collect hardware and dependency checks into the operation status response.
async function sampleSystemStatus() {
  const [cores, ram, mysql, redisStatus, minio] = await Promise.all([
    coreProbe ??= physicalCores(),
    memorySnapshot(),
    probe('mysql', /* Read the MySQL version as part of its health check. */ async () => {
      const [[result]] = await pool.query({ sql: 'SELECT VERSION() AS version', timeout: 3000 });
      return result.version;
    }),
    probe('redis', /* Ping Redis and read its reported server version. */ async () => {
      if (!isRedisActive()) throw new Error('Redis unavailable');
      return (await redis.info('server')).match(/^redis_version:([^\r\n]+)/m)?.[1];
    }, 'Fallback'),
    probe('minio', minioVersion),
  ]);

  return {
    overall: mysql.status !== 'Operational' ? 'Unavailable'
      : [redisStatus, minio].every(/* Check whether all optional services are operational. */ service => service.status === 'Operational') ? 'Operational' : 'Degraded',
    serverVersion,
    environment: `${os.type()} ${os.release()} (${os.arch()})`,
    cores,
    threads: os.cpus().length || os.availableParallelism(),
    ram,
    uptimeSeconds: Math.floor(os.uptime()),
    processUptimeSeconds: Math.floor(process.uptime()),
    mysql, redis: redisStatus, minio,
  };
}
