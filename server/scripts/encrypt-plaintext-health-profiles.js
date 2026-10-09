// server/scripts/encrypt-plaintext-health-profiles.js
//
// Encrypts HEALTH_PROFILES fields that were stored as plaintext (never encrypted).
// Dry run by default. Pass --apply to write.
//
//   node scripts/encrypt-plaintext-health-profiles.js           # dry run, writes nothing
//   node scripts/encrypt-plaintext-health-profiles.js --apply   # encrypts the rows
//
// Safety:
//  - only touches non-empty values that do NOT start with "enc:v"
//  - each UPDATE is guarded by "AND col = <value we read>", so a row edited
//    during the run is skipped, never overwritten
//  - every new ciphertext is decrypted and compared before it is written
//  - never prints patient data, only row ids and counts
import { pool } from '../src/db.js';
import { encrypt, decrypt, ACTIVE_VERSION } from '../src/utils/cryptoVault.js';

const APPLY = process.argv.includes('--apply');
const TABLE = 'HEALTH_PROFILES';
const PK = 'profile_id';
const COLUMNS = ['allergies', 'chronic_conditions'];
const BATCH = 200;

if (ACTIVE_VERSION !== 'v2') {
  console.error('ENCRYPTION_SALT is not set, so new data would be written as enc:v1. Set it first.');
  process.exit(1);
}

console.log(APPLY ? '== APPLY MODE: rows will be rewritten ==' : '== DRY RUN: nothing will be written ==');

const totals = { scanned: 0, converted: 0, failed: 0, skipped: 0 };
const conn = await pool.getConnection();

try {
  for (const col of COLUMNS) {
    const stats = { scanned: 0, converted: 0, failed: 0, skipped: 0 };
    let lastId = 0;

    for (;;) {
      const [rows] = await conn.query(
        `SELECT ?? AS id, ?? AS val FROM ?? WHERE ?? > ? AND ?? <> '' AND ?? NOT LIKE 'enc:v%' ORDER BY ?? ASC LIMIT ?`,
        [PK, col, TABLE, PK, lastId, col, col, PK, BATCH]
      );
      if (rows.length === 0) break;

      if (APPLY) await conn.beginTransaction();
      try {
        for (const row of rows) {
          stats.scanned++;
          const next = encrypt(row.val);
          if (typeof next !== 'string' || !next.startsWith('enc:v2:') || decrypt(next) !== String(row.val)) {
            stats.failed++;
            console.log(`  ! ${col} ${PK}=${row.id}: round-trip check failed, left untouched`);
            continue;
          }
          if (!APPLY) {
            stats.converted++;
            continue;
          }
          const [result] = await conn.query(
            'UPDATE ?? SET ?? = ? WHERE ?? = ? AND ?? = ?',
            [TABLE, col, next, PK, row.id, col, row.val]
          );
          if (result.affectedRows === 1) stats.converted++;
          else stats.skipped++;
        }
        if (APPLY) await conn.commit();
      } catch (err) {
        if (APPLY) await conn.rollback();
        throw err;
      }

      lastId = rows[rows.length - 1].id;
      if (rows.length < BATCH) break;
    }

    console.log(`${TABLE}.${col}: scanned ${stats.scanned}, converted ${stats.converted}, failed ${stats.failed}, changed-during-run ${stats.skipped}`);
    for (const k of Object.keys(totals)) totals[k] += stats[k];
  }

  console.log(`TOTAL: scanned ${totals.scanned}, converted ${totals.converted}, failed ${totals.failed}, changed-during-run ${totals.skipped}`);
} finally {
  conn.release();
  await pool.end();
}