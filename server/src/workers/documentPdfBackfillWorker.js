// Recovers missing clinical PDFs and tracks the oldest pending document for telemetry.

import { createHash } from 'node:crypto';
import { pool } from '../db/pool.js';
import { recoverMissingPdfs } from '../documents/pdfRecovery.js';

export async function backfillDocumentPdfs() {
  const connection = await pool.getConnection();
  let reusable = false;
  let locked = false;
  let lockName;
  try {
    const [[{ databaseName }]] = await connection.query('SELECT DATABASE() AS databaseName');
    lockName = 'valetudo-pdfs:' + createHash('sha1').update(databaseName.toLowerCase()).digest('hex');
    const [[{ acquired }]] = await connection.query('SELECT GET_LOCK(?, 0) AS acquired', [lockName]);
    if (acquired === 0) {
      reusable = true;
      return { skipped: true };
    }
    if (acquired !== 1) throw new Error('Could not acquire PDF recovery lock.');
    locked = true;
    const metrics = await recoverMissingPdfs({ database: connection });
    return { metrics, degraded: metrics.failed > 0 || metrics.queryFailures > 0 };
  } finally {
    if (locked) {
      try {
        const [[{ released }]] = await connection.query('SELECT RELEASE_LOCK(?) AS released', [lockName]);
        reusable = released === 1;
      } catch {
        reusable = false;
      }
    }
    if (reusable) connection.release();
    else connection.destroy();
  }
}
