// server/src/utils/redisClient.js
import { createClient } from 'redis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

export const redis = createClient({ url: redisUrl });

redis.on('error', (err) => {
  console.warn('⚠️ [Redis] Client Warning/Error:', err.message);
});

(async () => {
  try {
    await redis.connect();
    console.log('⚡ [Redis] Connected successfully.');
  } catch (err) {
    console.warn('⚠️ [Redis] Could not connect to Redis server. Operating with fallback.');
  }
})();

export async function getCache(key) {
  try {
    if (!redis.isOpen) return null;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    return null;
  }
}

export async function setCache(key, value, ttlSeconds = 60) {
  try {
    if (!redis.isOpen) return;
    await redis.set(key, JSON.stringify(value), { EX: ttlSeconds });
  } catch (err) {
    // Fail silently so Redis failures don't break request flow
  }
}

export async function invalidateCache(pattern) {
  try {
    if (!redis.isOpen) return;
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(keys);
    }
  } catch (err) {
    // Fail silently
  }
}