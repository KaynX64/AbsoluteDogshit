// server/src/utils/redisClient.js
import Redis from 'ioredis';

const REDIS_HOST = process.env.REDIS_HOST || '127.0.0.1';
const REDIS_PORT = Number(process.env.REDIS_PORT) || 6379;

export const redis = new Redis({
  host: REDIS_HOST,
  port: REDIS_PORT,
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
 * Invalidate cache key
 */
export async function invalidateCache(key) {
  if (!isRedisActive()) return;
  try {
    await redis.del(key);
  } catch (_) {}
}