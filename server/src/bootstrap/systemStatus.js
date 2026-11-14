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

async function probe(service, work, fallback = 'Unavailable') {
  let timer;
  try {
    if (!activeProbes.has(service)) {
      activeProbes.set(service, Promise.resolve().then(work).finally(() => activeProbes.delete(service)));
    }
    const version = await Promise.race([
      activeProbes.get(service),
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Probe timed out')), 3500); }),
    ]);
    return { status: 'Operational', version: version || null };
  } catch {
    return { status: fallback, version: null };
  } finally {
    clearTimeout(timer);
  }
}

async function minioVersion() {
  const bucket = await s3.send(new HeadBucketCommand({ Bucket: BUCKET_NAME }), { abortSignal: AbortSignal.timeout(3000) });
  // S3-compatible endpoints do not have to disclose their release.
  const version = bucket.$response?.headers?.['x-minio-version'];
  return version || process.env.MINIO_RELEASE || null;
}

let pending;
export function collectSystemStatus() {
  pending ??= sampleSystemStatus().finally(() => { pending = undefined; });
  return pending;
}

async function sampleSystemStatus() {
  const [cores, ram, mysql, redisStatus, minio] = await Promise.all([
    coreProbe ??= physicalCores(),
    memorySnapshot(),
    probe('mysql', async () => {
      const [[result]] = await pool.query({ sql: 'SELECT VERSION() AS version', timeout: 3000 });
      return result.version;
    }),
    probe('redis', async () => {
      if (!isRedisActive()) throw new Error('Redis unavailable');
      return (await redis.info('server')).match(/^redis_version:([^\r\n]+)/m)?.[1];
    }, 'Fallback'),
    probe('minio', minioVersion),
  ]);

  return {
    overall: mysql.status !== 'Operational' ? 'Unavailable'
      : [redisStatus, minio].every(service => service.status === 'Operational') ? 'Operational' : 'Degraded',
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
