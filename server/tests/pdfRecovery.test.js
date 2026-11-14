import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.DB_PASSWORD ||= 'fixture';
process.env.ENCRYPTION_KEY ||= 'a'.repeat(64);
process.env.ENCRYPTION_SALT ||= 'fixture-salt-for-recovery';
process.env.S3_ACCESS_KEY ||= 'fixture';
process.env.S3_SECRET_KEY ||= 'fixture';
const { recoverMissingPdfs } = await import('../src/documents/pdfRecovery.js');

test('PDF recovery isolates both thrown errors and null results and defers failed rows', async () => {
  const queries = [];
  const database = {
    async query(sql, parameters) {
      queries.push({ sql, parameters });
      if (sql.includes('ORDER BY')) return [[{ id: 1 }, { id: 2 }, { id: 3 }]];
      if (sql.startsWith('UPDATE')) return [{ affectedRows: 1 }];
      return [[{ oldest: '2025-01-01' }]];
    },
  };
  const summary = await recoverMissingPdfs({
    database,
    types: [['PRESCRIPTIONS', 'prescription_id', 'issued_at', ' AND deleted_at IS NULL', async (id, connection) => {
      assert.equal(connection, database);
      if (id === 1) throw new Error('fixture render failure');
      return id === 2 ? null : 'saved.pdf';
    }]],
  });
  assert.match(queries[0].sql, /ORDER BY prescription_id ASC LIMIT 20/);
  assert.match(queries[0].sql, /pdf_retry_at <= UTC_TIMESTAMP/);
  assert.deepEqual(queries.filter(query => query.sql.startsWith('UPDATE')).map(query => query.parameters), [[1], [2]]);
  assert.deepEqual(summary, { attempted: 3, recovered: 1, failed: 2, queryFailures: 0, oldestPendingAt: '2025-01-01' });
});
