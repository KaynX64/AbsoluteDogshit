// server/src/utils/redisClient.js
import 'dotenv/config';
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;
const REDIS_PASSWORD = process.env.REDIS_PASSWORD || undefined;

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
  password: REDIS_PASSWORD, // <-- S-06 / S-28: Pass the Redis password
  lazyConnect: true,
  retryStrategy: (times) => {
    // Retry every 3 seconds, up to 5 attempts before pausing
    if (times > 5) return null;
    return 3000;
  },
});

let isConnected = false;

redis.on('connect', () => {
  isConnected = true;
  console.log(`⚡ [Redis Cache] Connected to Redis server at ${REDIS_HOST}:${REDIS_PORT}`);
});

redis.on('ready', () => {
  isConnected = true;
});

redis.on('close', () => {
  isConnected = false;
});

redis.on('error', (err) => {
  isConnected = false;
  console.warn(`⚠️ [Redis Cache Warning] Redis unavailable (${err.message}). Falling back to direct MySQL queries.`);
});

export async function initRedis() {
  try {
    await redis.connect();
  } catch (err) {
    console.warn(`⚠️ [Redis Init] Could not connect to Redis on boot. Running in fallback mode.`);
  }
}

export function isRedisActive() {
  return isConnected && redis.status === 'ready';
}

/**
 * Cache-aside get helper
 */
export async function getCache(key) {
  if (!isRedisActive()) return null;
  try {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (_) {
    return null;
  }
}

/**
 * Cache-aside set helper (default TTL: 120 seconds)
 */
export async function setCache(key, value, ttlSeconds = 120) {
  if (!isRedisActive()) return;
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (_) {}
}

/**
 * Invalidate cache key or pattern
 */
export async function invalidateCache(patternOrKey) {
  if (!isRedisActive()) return;
  try {
    if (patternOrKey.includes('*')) {
      // ── SEC-09 Remediation: non-blocking keyspace sweep ────────────
      // redis.keys() issues the O(N) KEYS command, which walks the ENTIRE
      // keyspace in one synchronous, server-blocking call — stalling every
      // other cache lookup, rate limiter and session check behind it.
      // SCAN iterates the same keyspace in small batches (COUNT 100) and
      // yields between batches, so both the Node event loop and the Redis
      // server stay responsive. The stream is paused while each batch is
      // deleted so the deletion queue stays bounded; a failed batch does
      // not abort the sweep.
      await new Promise((resolve, reject) => {
        const stream = redis.scanStream({ match: patternOrKey, count: 100 });
        stream.on('data', (batchKeys) => {
          if (batchKeys.length === 0) return;
          stream.pause();
          redis
            .del(...batchKeys)
            .catch(() => {})
            .then(() => stream.resume());
        });
        stream.on('error', reject);
        stream.on('end', resolve);
      });
    } else {
      await redis.del(patternOrKey);
    }
  } catch (_) {}
}