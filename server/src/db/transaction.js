// Runs database work with a pooled transaction and handles commit, rollback, and release.

import { pool } from './pool.js';
import { setTimeout as delay } from 'node:timers/promises';
import { recordTransactionRetry } from '../bootstrap/loadMetrics.js';

export const isLockContention = error => ['ER_LOCK_DEADLOCK', 'ER_LOCK_WAIT_TIMEOUT'].includes(error.code);
const retryable = new WeakSet();

// Run work with a pooled connection and handle commit, rollback, and cleanup.
async function runTransaction(work, { readCommitted, retry, shortWait }) {
  const connection = await pool.getConnection();
  let reusable = true;
  let phase = 'setup';
  try {
    if (shortWait) await connection.query('SET SESSION innodb_lock_wait_timeout = 1');
    if (readCommitted) await connection.query('SET TRANSACTION ISOLATION LEVEL READ COMMITTED');
    await connection.beginTransaction();
    phase = 'work';
    const result = await work(connection);
    phase = 'commit';
    await connection.commit();
    return result;
  } catch (error) {
    try {
      await connection.rollback();
      if (retry && phase === 'work' && isLockContention(error)) {
        reusable = false;
        retryable.add(error);
      }
    } catch {
      reusable = false;
    }
    if (phase === 'setup') reusable = false;
    if (phase === 'commit') {
      reusable = false;
      error.commitUncertain = true;
    }
    throw error;
  } finally {
    if (reusable && shortWait) {
      try { await connection.query('SET SESSION innodb_lock_wait_timeout = DEFAULT'); }
      catch { reusable = false; }
    }
    if (reusable) connection.release();
    else connection.destroy();
  }
}

export async function inTransaction(work, { readCommitted = false, retries = 0 } = {}) {
  for (let attempt = 0; ; attempt++) {
    try { return await runTransaction(work, { readCommitted, retry: attempt < retries, shortWait: retries > 0 }); }
    catch (error) {
      if (!retryable.delete(error)) throw error;
      recordTransactionRetry();
      await delay(20 * (attempt + 1) + Math.floor(Math.random() * 20));
    }
  }
}
