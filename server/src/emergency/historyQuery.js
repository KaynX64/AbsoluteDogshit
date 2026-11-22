import { createHash } from 'node:crypto';

export class HistoryInputError extends Error {}

export function historyOptions(query, kind, now = Date.now()) {
  const limit = query.limit === undefined ? 25 : Number(query.limit);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new HistoryInputError('Page size must be between 1 and 100.');
  const search = typeof query.search === 'string' ? query.search.trim() : '';
  if (search.length > 120) throw new HistoryInputError('Search is limited to 120 characters.');
  const status = query.status || 'all';
  if (!['all', 'resolved', 'false_alarm'].includes(status)) throw new HistoryInputError('Invalid outcome filter.');
  const period = query.period || (kind === 'history' || kind === 'filed' ? '30' : 'all');
  if (!['30', 'all', 'custom'].includes(period)) throw new HistoryInputError('Invalid date filter.');
  const day = value => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new HistoryInputError('Choose valid dates.');
    const at = Date.parse(value + 'T00:00:00+08:00');
    if (!Number.isFinite(at) || new Date(at + 8 * 3600000).toISOString().slice(0, 10) !== value) throw new HistoryInputError('Choose valid dates.');
    return at / 1000;
  };
  let start = null, end = null;
  if (period === '30') {
    const today = new Date(now + 8 * 3600000).toISOString().slice(0, 10);
    end = day(today) + 86400;
    start = end - 30 * 86400;
  } else if (period === 'custom') {
    start = day(query.from); end = day(query.to) + 86400;
    if (start >= end) throw new HistoryInputError('The end date must not precede the start date.');
  }
  // Rolling date bounds are not included: a cursor remains valid across midnight.
  const scope = createHash('sha256').update(JSON.stringify([kind, search, status, period, query.from, query.to])).digest('hex').slice(0, 16);
  let cursor = null;
  if (query.before) {
    try {
      cursor = JSON.parse(Buffer.from(query.before, 'base64url').toString());
      if (cursor.scope !== scope || !Number.isFinite(cursor.at) || !Number.isSafeInteger(cursor.id) || cursor.id < 1) throw new Error();
    } catch { throw new HistoryInputError('Invalid page cursor.'); }
  }
  return { limit, search, status, start, end, scope, cursor };
}

export function pageResult(rows, options) {
  const more = rows.length > options.limit;
  const records = rows.slice(0, options.limit);
  const last = records.at(-1);
  return {
    records,
    nextCursor: more && last ? Buffer.from(JSON.stringify({ scope: options.scope, at: last.sortAt, id: last.sortId })).toString('base64url') : null,
  };
}

export const likeTerm = value => '%' + value.replace(/[!%_]/g, match => '!' + match) + '%';
export const isoSeconds = value => value == null ? null : new Date(Number(value) * 1000).toISOString();
