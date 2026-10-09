// server/tests/analyticsStats.test.js  (Audit Issue #5)
// Run with: node --test server/tests/analyticsStats.test.js   (a default test key is set if ENCRYPTION_KEY is unset)
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.ENCRYPTION_KEY ||= 'x'.repeat(40);
const { encrypt } = await import('../src/utils/cryptoVault.js');
const { countDiagnoses, countRiskGroups } = await import('../src/utils/analyticsStats.js');

function fakeTable(rows, idCol) {
  const calls = { n: 0, maxRows: 0 };
  const query = async (_sql, [lastId, limit]) => {
    calls.n++;
    const out = rows.filter((r) => r[idCol] > lastId).slice(0, limit);
    calls.maxRows = Math.max(calls.maxRows, out.length);
    return [out, []];
  };
  return { query, calls };
}

test('countDiagnoses reads in bounded batches and counts correctly', async () => {
  const names = ['Influenza', 'Asthma', 'Migraine'];
  const rows = Array.from({ length: 2500 }, (_, i) => ({ emr_id: i + 1, diagnosis: encrypt(names[i % 3]) }));
  const { query, calls } = fakeTable(rows, 'emr_id');

  const result = await countDiagnoses(query, { batchSize: 1000 });

  assert.equal(result.reduce((a, d) => a + d.count, 0), 2500);
  assert.equal(calls.n, 3); // 1000 + 1000 + 500
  assert.ok(calls.maxRows <= 1000, 'never loads more than one batch into memory');
  assert.equal(result[0].count, 834); // Influenza is the most frequent
});

test('countDiagnoses buckets tampered ciphertext and legacy plaintext safely', async () => {
  const rows = [
    { emr_id: 1, diagnosis: 'enc:v1:00:11:22' },
    { emr_id: 2, diagnosis: 'Legacy plaintext' },
    { emr_id: 3, diagnosis: encrypt('   ') }, // encrypts to '' -> default label
  ];
  const { query } = fakeTable(rows, 'emr_id');
  const labels = (await countDiagnoses(query)).map((d) => d.diagnosis);

  assert.ok(labels.includes('Unreadable record (integrity check failed)'));
  assert.ok(labels.includes('Legacy plaintext'));
  assert.ok(!labels.some((l) => l.includes('[ENCRYPTED PHI')), 'raw failure marker must not reach reports');
});

test('countDiagnoses caps distinct output', async () => {
  const rows = Array.from({ length: 50 }, (_, i) => ({ emr_id: i + 1, diagnosis: encrypt(`Dx ${i}`) }));
  const { query } = fakeTable(rows, 'emr_id');
  assert.equal((await countDiagnoses(query, { maxDistinct: 10 })).length, 10);
});

test('countRiskGroups counts conditions and allergies across batches', async () => {
  const rows = Array.from({ length: 30 }, (_, i) => ({
    profile_id: i + 1,
    chronic_conditions: encrypt(i % 3 === 0 ? 'Asthma' : i % 3 === 1 ? 'Hypertension, Diabetes' : ''),
    allergies: encrypt(i % 2 ? 'Peanuts' : 'None'),
  }));
  const { query } = fakeTable(rows, 'profile_id');
  const r = await countRiskGroups(query, { batchSize: 7 });

  assert.equal(r.total, 30);
  assert.equal(r.asthma_count, 10);
  assert.equal(r.hypertension_count, 10);
  assert.equal(r.diabetes_count, 10);
  assert.equal(r.severe_allergies_count, 15);
});