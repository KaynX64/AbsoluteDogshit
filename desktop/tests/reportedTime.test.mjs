import assert from 'node:assert/strict';
import { test } from 'node:test';

process.env.TZ = 'America/Los_Angeles';
const { formatReportedTime } = await import('../src/features/emergency/reportedTime.ts');

test('SOS dispatch displays the reported instant in Philippine time', () => {
  assert.equal(formatReportedTime('2026-11-20T16:05:00.000Z'), '12:05 AM');
  assert.equal(formatReportedTime('2026-11-21T00:05:00+08:00'), '12:05 AM');
});

test('SOS dispatch displays a placeholder when the timestamp is unavailable', () => {
  assert.equal(formatReportedTime(null), '—');
  assert.equal(formatReportedTime('invalid'), '—');
});
