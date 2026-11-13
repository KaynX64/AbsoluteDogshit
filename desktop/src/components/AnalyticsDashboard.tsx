import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { flushSync } from 'react-dom';
import { API_BASE_URL } from '../config/api';
import Icon from './Icon';
import { Overview } from './analytics/tabs/Overview';
import { Clinical } from './analytics/tabs/Clinical';
import { Campus } from './analytics/tabs/Campus';
import { Pharmacy } from './analytics/tabs/Pharmacy';
import PrintReport from './analytics/PrintReport';
import { authHeaders, restrictSnapshot, timestamp, type AnalyticsData, type AnalyticsScope } from './analytics/data';
import { tabs, visibleTabs, hasReportData, type TabId } from './analytics/tabs';
import './analytics/dashboard.css';

export default function AnalyticsDashboard() {
  const id = useId();
  const [tab, setTab] = useState<TabId>('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const [printData, setPrintData] = useState<AnalyticsData | null>(null);
  const latestSnapshot = useRef<AnalyticsData | null>(null);
  const summaryRequest = useRef<AbortController | null>(null);
  const exportRequest = useRef<AbortController | null>(null);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  const jumpTarget = useRef<string | null>(null);
  const dashboard = useRef<HTMLElement>(null);
  const focusedBeforeRefresh = useRef<Element | null>(null);
  const availableTabs = data ? visibleTabs(data) : tabs;
  const activeTab = availableTabs.some(item => item.id === tab) ? tab : 'overview';
  const canReport = data?.scopes.includes('ANALYTICS_EXPORT') && hasReportData(data);

  const clearAccess = useCallback(() => {
    summaryRequest.current?.abort();
    exportRequest.current?.abort();
    latestSnapshot.current = null;
    setData(null);
    setPrintData(null);
    setFetchedAt(null);
    setLoading(false);
    setExporting(false);
    setExportStatus('');
    setTab('overview');
    setError('Your account cannot access analytics. Check your session or ask an administrator.');
  }, []);

  const refresh = useCallback(async () => {
    summaryRequest.current?.abort();
    const request = new AbortController();
    summaryRequest.current = request;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/analytics/summary`, { headers: authHeaders(), signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        clearAccess();
        return;
      }
      if (!response.ok) throw new Error('Analytics fetch failed');
      const result: AnalyticsData = await response.json();
      if (!Array.isArray(result.scopes)) throw new Error('Scoped analytics response required');
      if (!request.signal.aborted) {
        const focused = document.activeElement;
        focusedBeforeRefresh.current = dashboard.current?.contains(focused) ? focused : null;
        setPrintData(null);
        latestSnapshot.current = result;
        setData(result);
        setFetchedAt(new Date());
      }
    } catch {
      if (!request.signal.aborted) setError('Could not load analytics. Check your connection and retry.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, [clearAccess]);

  useEffect(() => {
    void refresh();
    const finishPrint = () => setPrintData(null);
    window.addEventListener('afterprint', finishPrint);
    window.addEventListener('focus', refresh);
    return () => {
      window.removeEventListener('focus', refresh);
      window.removeEventListener('afterprint', finishPrint);
      summaryRequest.current?.abort();
      exportRequest.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    const focused = focusedBeforeRefresh.current;
    if (focused && !focused.isConnected && document.activeElement === document.body) {
      document.getElementById(`${id}-${activeTab}`)?.focus();
    }
    focusedBeforeRefresh.current = null;
    if (data && activeTab !== tab) setTab('overview');
  }, [activeTab, data, id, tab]);

  useEffect(() => {
    if (jumpTarget.current) {
      document.getElementById(jumpTarget.current)?.focus();
      jumpTarget.current = null;
    }
  }, [tab]);

  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = availableTabs.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % availableTabs.length
      : event.key === 'ArrowLeft' ? (index + last) % availableTabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    setTab(availableTabs[next].id);
    document.getElementById(`${id}-${availableTabs[next].id}`)?.focus();
  }

  async function download(format: 'excel' | 'pdf' | 'print') {
    if (exportRequest.current || !data || !canReport) return;
    const menu = exportMenu.current;
    if (menu) {
      menu.open = false;
      menu.querySelector('summary')?.focus();
    }
    const request = new AbortController();
    exportRequest.current = request;
    setExporting(true);
    setExportStatus('Preparing report…');
    try {
      const path = format === 'print' ? 'report-access' : `export/${format}`;
      const response = await fetch(`${API_BASE_URL}/api/analytics/${path}`, { headers: authHeaders(), signal: request.signal });
      if (request.signal.aborted) return;
      if (response.status === 401 || response.status === 403) {
        clearAccess();
        void refresh();
        return;
      }
      if (!response.ok) throw new Error('Export failed');
      if (format === 'print') {
        const { scopes }: { scopes: AnalyticsScope[] } = await response.json();
        if (request.signal.aborted) return;
        const permitted = restrictSnapshot(data, scopes.filter(scope => latestSnapshot.current?.scopes.includes(scope)));
        if (!permitted.scopes.includes('ANALYTICS_EXPORT') || !hasReportData(permitted)) {
          setExportStatus('Refresh analytics before printing newly granted sections.');
          return;
        }
        flushSync(() => setPrintData(permitted));
        try {
          window.print();
        } catch (error) {
          setPrintData(null);
          throw error;
        }
        setExportStatus('');
        return;
      }
      const blob = await response.blob();
      if (request.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `HealthLink-Analytics.${format === 'excel' ? 'xlsx' : 'pdf'}`;
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setExportStatus('Report download started.');
    } catch {
      if (!request.signal.aborted) setExportStatus('Could not prepare the report. Try again.');
    } finally {
      exportRequest.current = null;
      if (!request.signal.aborted) setExporting(false);
    }
  }

  return <main ref={dashboard} className="an-dashboard">
    <header className="an-header">
      <div><h1>Health analytics</h1><p>Clinic activity, campus health, and pharmacy stock</p></div>
      <div className="an-controls">
        <button type="button" aria-disabled={loading} onClick={() => { if (!loading) void refresh(); }}><Icon name="refresh" size={17} /> Refresh</button>
        {canReport && <details ref={exportMenu} className="an-export" onBlur={event => {
          if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
        }} onKeyDown={event => {
          if (event.key === 'Escape') {
            event.currentTarget.open = false;
            event.currentTarget.querySelector('summary')?.focus();
          }
        }}>
          <summary><Icon name="download" size={17} /> Export</summary>
          <div><button type="button" disabled={exporting} onClick={() => void download('excel')}>Download Excel</button>
            <button type="button" disabled={exporting} onClick={() => void download('pdf')}>Download PDF</button></div>
        </details>}
        {canReport && <button type="button" disabled={exporting} onClick={() => void download('print')}><Icon name="print" size={17} /> Print dashboard</button>}
      </div>
    </header>
    <div className="an-freshness" role="status">
      {fetchedAt && <>Fetched <time dateTime={fetchedAt.toISOString()}>{timestamp(fetchedAt)}</time></>}
      {loading && (fetchedAt ? ' · Refreshing…' : 'Loading analytics…')}
      {exportStatus && <span>{exportStatus}</span>}
    </div>
    {error && <div className="an-error" role="alert"><span>{error}{data && ' Showing the last successful results.'}</span>
      <button type="button" onClick={() => void refresh()}>Retry</button></div>}
    {!data && loading && <div className="an-kpis an-skeleton" aria-hidden="true">{tabs.map(item => <div key={item.id} />)}</div>}
    {data && <>
      <div role="tablist" aria-label="Analytics sections" className="an-tabs">
        {availableTabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}`}
          aria-selected={activeTab === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={activeTab === item.id ? 0 : -1}
          onKeyDown={event => switchTab(event, index)} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {availableTabs.map(item => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
        aria-labelledby={`${id}-${item.id}`} tabIndex={0} hidden={activeTab !== item.id}>
        {item.id === 'overview' && <Overview data={data} jump={next => {
          jumpTarget.current = next === 'campus' ? 'an-respiratory' : 'an-reorder';
          setTab(next);
        }} />}
        {item.id === 'clinical' && <Clinical data={data} onAccessDenied={() => { clearAccess(); void refresh(); }} />}
        {item.id === 'campus' && <Campus data={data} />}
        {item.id === 'pharmacy' && <Pharmacy data={data} />}
      </div>)}
      {printData && fetchedAt && <PrintReport data={printData} fetchedAt={fetchedAt} />}
    </>}
  </main>;
}
