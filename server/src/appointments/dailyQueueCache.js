import { isRedisActive, redis } from '../utils/redisClient.js';

const cacheKey = 'queue:today';
const generationKey = 'queue:today:generation';

export async function invalidateDailyQueue() {
  if (!isRedisActive()) return;
  try {
    await redis.multi().incr(generationKey).del(cacheKey).exec();
  } catch {
    // The existing cache expires after 30 seconds during Redis trouble.
  }
}

export async function readDailyQueue(load) {
  if (!isRedisActive()) return load();
  let generation;
  try {
    const [current, cached] = await redis.mget(generationKey, cacheKey);
    generation = current ?? '0';
    if (cached) return JSON.parse(cached);
  } catch {
    return load();
  }
  const rows = await load();
  try {
    await redis.eval(`
      if (redis.call('GET', KEYS[1]) or '0') == ARGV[1] then
        redis.call('SET', KEYS[2], ARGV[2], 'EX', 30)
      end`, 2, generationKey, cacheKey, generation, JSON.stringify(rows));
  } catch {
    // Preserve the database result when the cache write fails.
  }
  return rows;
}
