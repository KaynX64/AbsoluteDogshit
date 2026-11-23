import assert from 'node:assert/strict';
import { test } from 'node:test';

const port = process.env.VALETUDO_BENCHMARK_REDIS_PORT;

test('an invalidated Redis queue read cannot publish its stale refill', { skip: !port }, async () => {
  Object.assign(process.env, {
    REDIS_HOST: '127.0.0.1', REDIS_PORT: port, REDIS_PASSWORD: process.env.VALETUDO_BENCHMARK_REDIS_PASSWORD ?? '',
  });
  const { redis, initRedis } = await import('../src/utils/redisClient.js');
  const { readDailyQueue, invalidateDailyQueue } = await import('../src/appointments/dailyQueueCache.js');
  await initRedis();
  try {
    await invalidateDailyQueue();
    const loading = Promise.withResolvers();
    const result = Promise.withResolvers();
    const stale = readDailyQueue(() => { loading.resolve(); return result.promise; });
    await loading.promise;
    await invalidateDailyQueue();
    result.resolve(['old']);
    assert.deepEqual(await stale, ['old']);
    assert.deepEqual(await readDailyQueue(async () => ['new']), ['new']);
    assert.deepEqual(await readDailyQueue(async () => assert.fail('Expected the new cached queue')), ['new']);
  } finally {
    await invalidateDailyQueue();
    redis.disconnect();
  }
});
