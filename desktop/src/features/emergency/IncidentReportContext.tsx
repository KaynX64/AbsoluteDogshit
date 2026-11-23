import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';
import { useResponderAccess } from './ResponderAccess';
import { reportRequest, type ReportSummary } from './reportApi';

const ReportContext = createContext<{
  summary: ReportSummary | null; error: string; refresh: () => Promise<void>;
  openReport: (id: number) => void; closeReport: () => void; openId: number | null;
}>({ summary: null, error: '', refresh: async () => {}, openReport: () => {}, closeReport: () => {}, openId: null });
export const useIncidentReports = () => useContext(ReportContext);

export function IncidentReportProvider({ children }: { children: ReactNode }) {
  const { tier, canUpdateStatus, refreshAccess } = useResponderAccess();
  const [summary, setSummary] = useState<ReportSummary | null>(null);
  const [error, setError] = useState('');
  const [queue, setQueue] = useState<number[]>([]);
  const request = useRef<AbortController | null>(null);
  const socket = useDesktopSocket();
  const refresh = useCallback(async () => {
    if (tier !== 'clinical' || request.current) return;
    const controller = new AbortController(); request.current = controller;
    try {
      const data = await reportRequest<ReportSummary>('/report-summary', { signal: controller.signal });
      if (!data || !Number.isFinite(data.pending) || !Number.isFinite(data.overdue) || !Number.isFinite(data.drafts)) throw new Error('Update the server to load report counts.');
      if (!controller.signal.aborted) { setSummary(data); setError(''); }
    } catch (err: any) {
      if (!controller.signal.aborted) {
        setError(err.message || 'Report counts could not be loaded.');
        if (err.status === 401 || err.status === 403) { setSummary(null); void refreshAccess(true); }
      }
    } finally { if (request.current === controller) request.current = null; }
  }, [tier, refreshAccess]);
  const openReport = useCallback((id: number) => {
    if (canUpdateStatus('resolved') && Number.isSafeInteger(id) && id > 0) setQueue(current => current.includes(id) ? current : [...current, id]);
  }, [canUpdateStatus]);
  const closeReport = useCallback(() => setQueue(current => current.slice(1)), []);

  useEffect(() => {
    if (tier !== 'clinical') { setSummary(null); setQueue([]); return; }
    void refresh();
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void refresh(); }, 200); };
    const unsubscribe = subscribeToDesktopEvents(socket, on => {
      on('emergency:status_change', schedule);
      on('emergency:incident_reported', schedule);
      on('emergency:report_work_changed', schedule);
      on('reconnect', schedule);
      on('emergency:incident_report_required', ({ alertId }: { alertId: number }) => openReport(Number(alertId)));
    });
    window.addEventListener('focus', schedule);
    return () => {
      clearTimeout(timer); request.current?.abort(); request.current = null;
      unsubscribe(); window.removeEventListener('focus', schedule);
    };
  }, [tier, socket, refresh, openReport]);
  return <ReportContext.Provider value={{ summary, error, refresh, openReport, closeReport, openId: tier === 'clinical' ? queue[0] ?? null : null }}>{children}</ReportContext.Provider>;
}

export function ResponderReportBadge({ children }: { children: ReactNode }) {
  const { summary } = useIncidentReports();
  return <>{children}{summary && summary.pending > 0 && <span className="rh-badge">{summary.pending} pending</span>}</>;
}
