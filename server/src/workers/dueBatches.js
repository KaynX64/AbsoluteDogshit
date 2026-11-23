import { setImmediate as yieldTurn } from 'node:timers/promises';

export async function drainDueBatches(work, publish, signal) {
  while (!signal?.aborted) {
    const ids = await work();
    if (ids.length) await publish(ids);
    if (ids.length < 100) break;
    await yieldTurn();
  }
}
