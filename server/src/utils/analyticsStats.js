// server/src/utils/analyticsStats.js
//
// Fix for Audit Part 2, Issue #5 (Denial-of-Service & In-Memory PHI Decryption).
//
// Diagnoses and chronic conditions are stored as AES-256-GCM ciphertext with a random IV,
// so MySQL cannot GROUP BY / COUNT them. They must be decrypted in Node. The old routes
// did `SELECT diagnosis FROM EMR_RECORDS` (the WHOLE table) on every request, in four
// different handlers, and decrypted every row in one synchronous loop.
//
// This module keeps the decrypt-in-Node design but makes it safe:
//   1. KEYSET BATCHING  - rows are read BATCH_SIZE at a time (WHERE id > last ORDER BY id),
//                         so memory stays flat no matter how many records exist.
//   2. EVENT-LOOP YIELD - we yield (setImmediate) between batches so other requests,
//                         sockets and the SOS pipeline are never starved.
//   3. CACHING          - result is cached (Redis when available, in-process otherwise)
//                         so repeated dashboard loads / exports cost nothing.
//   4. SINGLE-FLIGHT    - concurrent cache misses share ONE computation instead of
//                         each launching a full-table scan (cache-stampede protection).
//   5. BOUNDED OUTPUT   - only the top MAX_DISTINCT diagnoses are kept/cached.
//
// Long-term: store a coded, non-identifying `diagnosis_category` (e.g. ICD-10 chapter)
// at write time so this becomes a plain SQL GROUP BY with no decryption at all.
import { pool } from '../db.js';
import { decrypt } from './cryptoVault.js';
import { getCache, setCache } from './redisClient.js';

const BATCH_SIZE = Number(process.env.ANALYTICS_BATCH_SIZE) || 1000;
const CACHE_TTL_SECONDS = Number(process.env.ANALYTICS_CACHE_TTL) || 600; // 10 min
const MAX_DISTINCT = 500;

const DECRYPT_FAILED = '[ENCRYPTED PHI - INTEGRITY VERIFICATION FAILED]';
const DEFAULT_DIAGNOSIS = 'General Health Check';
const UNREADABLE_LABEL = 'Unreadable record (integrity check failed)';

const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

// ─── Pure aggregators (take a query function so they are unit-testable) ──────

/**
 * Counts diagnoses across all live EMR records using keyset pagination.
 * @param {(sql: string, params: any[]) => Promise<[any[], any]>} queryFn mysql2-style query
 * @returns {Promise<{diagnosis: string, count: number}[]>} sorted by count desc
 */
export async function countDiagnoses(queryFn, { batchSize = BATCH_SIZE, maxDistinct = MAX_DISTINCT } = {}) {
  const counts = new Map();
  let lastId = 0;

  for (;;) {
    const [rows] = await queryFn(
      `SELECT emr_id, diagnosis
         FROM EMR_RECORDS
        WHERE emr_id > ?
          AND diagnosis IS NOT NULL AND diagnosis != ''
          AND deleted_at IS NULL
        ORDER BY emr_id ASC
        LIMIT ?`,
      [lastId, batchSize]
    );
    if (rows.length === 0) break;

    for (const row of rows) {
      let plain = decrypt(row.diagnosis);
      if (plain === DECRYPT_FAILED) plain = UNREADABLE_LABEL;
      else plain = (plain || '').trim() || DEFAULT_DIAGNOSIS;
      counts.set(plain, (counts.get(plain) || 0) + 1);
    }

    lastId = rows[rows.length - 1].emr_id;
    if (rows.length < batchSize) break;
    await yieldToEventLoop();
  }

  return [...counts.entries()]
    .map(([diagnosis, count]) => ({ diagnosis, count }))
    .sort((a, b) => b.count - a.count || a.diagnosis.localeCompare(b.diagnosis))
    .slice(0, maxDistinct);
}

/**
 * High-risk group counts from encrypted HEALTH_PROFILES, using keyset pagination.
 * `total` is the number of profiles scanned (replaces the old riskProfiles.length).
 */
export async function countRiskGroups(queryFn, { batchSize = BATCH_SIZE } = {}) {
  const out = {
    hypertension_count: 0,
    asthma_count: 0,
    diabetes_count: 0,
    severe_allergies_count: 0,
    total: 0,
  };
  let lastId = 0;

  for (;;) {
    const [rows] = await queryFn(
      `SELECT profile_id, chronic_conditions, allergies
         FROM HEALTH_PROFILES
        WHERE profile_id > ? AND deleted_at IS NULL
        ORDER BY profile_id ASC
        LIMIT ?`,
      [lastId, batchSize]
    );
    if (rows.length === 0) break;

    for (const hp of rows) {
      const cond = (decrypt(hp.chronic_conditions) || '').toLowerCase();
      const allergy = (decrypt(hp.allergies) || '').toLowerCase();

      if (cond.includes('hypertension') || cond.includes('blood pressure')) out.hypertension_count++;
      if (cond.includes('asthma')) out.asthma_count++;
      if (cond.includes('diabetes')) out.diabetes_count++;
      if (allergy && allergy !== 'none' && allergy !== 'none recorded' && allergy !== 'n/a') {
        out.severe_allergies_count++;
      }
    }

    out.total += rows.length;
    lastId = rows[rows.length - 1].profile_id;
    if (rows.length < batchSize) break;
    await yieldToEventLoop();
  }

  return out;
}

// ─── Cache + single-flight wrapper ───────────────────────────────────────────
const memoryCache = new Map(); // key -> { value, expiresAt }   (used when Redis is down)
const inflight = new Map(); // key -> Promise                  (stampede protection)

async function cached(key, compute) {
  // 1. Redis (shared across server instances)
  const fromRedis = await getCache(key);
  if (fromRedis) return fromRedis;

  // 2. In-process fallback so the protection still works without Redis
  const mem = memoryCache.get(key);
  if (mem && mem.expiresAt > Date.now()) return mem.value;

  // 3. Single-flight: everyone who misses waits on the same computation
  if (inflight.has(key)) return inflight.get(key);

  const promise = (async () => {
    try {
      const value = await compute();
      memoryCache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_SECONDS * 1000 });
      await setCache(key, value, CACHE_TTL_SECONDS);
      return value;
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, promise);
  return promise;
}

const DIAG_KEY = 'analytics:diagnosis-counts:v1';
const RISK_KEY = 'analytics:risk-groups:v1';
const runQuery = (sql, params) => pool.query(sql, params);

/** Full sorted diagnosis list (max 500). Callers slice what they need. */
export const getDiagnosisCounts = () => cached(DIAG_KEY, () => countDiagnoses(runQuery));

/** { hypertension_count, asthma_count, diabetes_count, severe_allergies_count, total } */
export const getRiskCounts = () => cached(RISK_KEY, () => countRiskGroups(runQuery));

/** Call after bulk EMR/profile changes if you need the dashboard to refresh immediately. */
export async function invalidateAnalyticsCache() {
  memoryCache.clear();
  await setCache(DIAG_KEY, null, 1);
  await setCache(RISK_KEY, null, 1);
}