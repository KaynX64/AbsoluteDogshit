import { useCallback, useEffect, useRef, useState } from 'react';
import { reportRequest, type HistoryRecord, type RecordPage } from './reportApi';
import { useIncidentReports } from './IncidentReportContext';
import { useResponderAccess } from './ResponderAccess';

export type RecordKind = 'history' | 'pending' | 'drafts' | 'filed';
export interface RecordFilters { search: string; period: string; from: string; to: string; status: string }

export function useResponderRecords(kind: RecordKind, filters: RecordFilters) {
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const request = useRef<AbortController | null>(null);
  const { summary, openId } = useIncidentReports();
  const { tier, refreshAccess } = useResponderAccess();
  const key = JSON.stringify(filters);
  const load = useCallback(async (cursor?: string) => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true); setError('');
    const query = new URLSearchParams({ ...JSON.parse(key), limit: '25' });
    if (cursor) query.set('before', cursor);
    const path = kind === 'history' ? '/history' : kind === 'filed' ? '/reports' : '/report-worklist';
    if (kind === 'drafts') query.set('view', 'drafts');
    try {
      const page = await reportRequest<RecordPage>(`${path}?${query}`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!Array.isArray(page.records)) throw new Error('Update the server to use responder history.');
      setRecords(current => cursor ? [...current, ...page.records.filter(row => !current.some(old => old.alertId === row.alertId))] : page.records);
      setNextCursor(page.nextCursor);
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err.message); if (err.status === 401 || err.status === 403) { setRecords([]); void refreshAccess(true); }
      }
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }, [kind, key, refreshAccess]);
  useEffect(() => {
    if (openId !== null) return;
    setRecords([]); setNextCursor(null);
    if (tier !== 'clinical') { setLoading(false); return; }
    setLoading(true);
    if (filters.period === 'custom' && (!filters.from || !filters.to)) { setLoading(false); return; }
    const timer = setTimeout(() => { void load(); }, 300);
    return () => { clearTimeout(timer); request.current?.abort(); };
  }, [tier, load, summary, openId, filters.period, filters.from, filters.to]);
  return { records, loading, error, nextCursor, reload: () => load(), more: () => nextCursor ? load(nextCursor) : Promise.resolve() };
}
