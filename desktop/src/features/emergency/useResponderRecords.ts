import { useCallback, useEffect, useRef, useState } from 'react';
import { reportRequest, type HistoryRecord, type RecordPage } from './reportApi';
import { useIncidentReports } from './IncidentReportContext';
import { useResponderAccess } from './ResponderAccess';
import { RecordPageCache } from './RecordPageCache';

export type RecordKind = 'history' | 'pending' | 'drafts' | 'filed';
export interface RecordFilters { search: string; period: string; from: string; to: string; status: string }
export const defaultRecordFilters = (kind: RecordKind): RecordFilters => ({ search: '', period: kind === 'filed' || kind === 'history' ? '30' : 'all', from: '', to: '', status: 'all' });
const cacheKey = (kind: RecordKind, filters: RecordFilters) => JSON.stringify([kind, {
  search: filters.search, period: filters.period, from: filters.from, to: filters.to, status: filters.status,
}]);
function fetchRecords(kind: RecordKind, filters: RecordFilters, signal: AbortSignal, cursor?: string) {
  const query = new URLSearchParams({ ...filters, limit: '25' });
  if (cursor) query.set('before', cursor);
  if (kind === 'drafts') query.set('view', 'drafts');
  const path = kind === 'history' ? '/history' : kind === 'filed' ? '/reports' : '/report-worklist';
  return reportRequest<RecordPage>(`${path}?${query}`, { signal }).then(page => {
    if (!Array.isArray(page.records)) throw new Error('Update the server to use responder history.');
    return page;
  });
}
interface ViewState { key: string; page?: RecordPage; loading: boolean; error: string }

export function useResponderRecords(kind: RecordKind, filters: RecordFilters) {
  const [cache] = useState(() => new RecordPageCache<RecordPage>());
  const [state, setState] = useState<ViewState>({ key: '', loading: true, error: '' });
  const [busy, setBusy] = useState(false);
  const request = useRef<AbortController | null>(null);
  const previousSearch = useRef(filters.search);
  const { summary, openId } = useIncidentReports();
  const { tier, refreshAccess } = useResponderAccess();
  const key = cacheKey(kind, filters);
  // A keyed snapshot also prevents one frame of the previous tab's records.
  const saved = cache.peek(key);
  const view = state.key === key ? state : { key, page: saved, loading: !saved, error: '' };
  const prefetch = useCallback((next: RecordKind) => {
    if (tier !== 'clinical' || (next === 'filed' && !summary?.canViewFiled)) return;
    const defaults = defaultRecordFilters(next);
    void cache.read(cacheKey(next, defaults), signal => fetchRecords(next, defaults, signal)).catch((err: any) => {
      if (err.status === 401 || err.status === 403) { cache.clear(); void refreshAccess(true); }
    });
  }, [cache, tier, summary?.canViewFiled, refreshAccess]);
  const load = useCallback(async (cursor?: string, force = false) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    const snapshot = cache.peek(key);
    setBusy(true); setState({ key, page: snapshot, loading: !snapshot, error: '' });
    try {
      const page = cursor ? await fetchRecords(kind, JSON.parse(key)[1], controller.signal, cursor)
        : await cache.read(key, signal => fetchRecords(kind, JSON.parse(key)[1], signal), force);
      if (controller.signal.aborted) return;
      const result = cursor && snapshot ? { ...page, records: [...snapshot.records, ...page.records.filter(row => !snapshot.records.some(old => old.alertId === row.alertId))] } : page;
      if (cursor) cache.put(key, result);
      setState({ key, page: result, loading: false, error: '' });
      if (kind !== 'history') for (const next of ['pending', 'drafts', 'filed'] as RecordKind[]) {
        if (next !== kind && !cache.peek(cacheKey(next, defaultRecordFilters(next)))) prefetch(next);
      }
    } catch (err: any) {
      if (!controller.signal.aborted && err.name !== 'AbortError') {
        setState({ key, page: snapshot, loading: false, error: err.message });
        if (err.status === 401 || err.status === 403) { cache.clear(); setState({ key, loading: false, error: err.message }); void refreshAccess(true); }
      }
    } finally { if (!controller.signal.aborted) setBusy(false); }
  }, [cache, key, kind, refreshAccess, prefetch]);

  useEffect(() => { cache.invalidate(); }, [cache, summary, openId]);
  useEffect(() => {
    // Drop all protected snapshots on access loss, including filtered archives.
    if (tier !== 'clinical' || !summary?.canViewFiled) cache.clear();
  }, [cache, tier, summary?.canViewFiled]);
  useEffect(() => () => { request.current?.abort(); cache.clear(); }, [cache]);
  useEffect(() => {
    if (tier !== 'clinical' || openId !== null) return;
    if (filters.period === 'custom' && (!filters.from || !filters.to)) { setBusy(false); setState({ key, loading: false, error: '' }); return; }
    const debounce = previousSearch.current !== filters.search;
    previousSearch.current = filters.search;
    // Tab selection is immediate; only typing a search waits for inactivity.
    const timer = setTimeout(() => { void load(); }, debounce ? 300 : 0);
    return () => { clearTimeout(timer); request.current?.abort(); cache.cancel(key); };
  }, [cache, tier, load, summary, openId, key, filters.period, filters.from, filters.to, filters.search]);
  return { records: view.page?.records ?? [] as HistoryRecord[], loading: view.loading, refreshing: busy && !view.loading,
    error: view.error, nextCursor: view.page?.nextCursor, prefetch, reload: () => load(undefined, true),
    more: () => view.page?.nextCursor ? load(view.page.nextCursor) : Promise.resolve() };
}
