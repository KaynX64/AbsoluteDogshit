import { useCallback, useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { API_BASE_URL } from '../config/api';
import Icon from './Icon';
import { Campus, Clinical, Overview, Pharmacy } from './analytics/Sections';
import type { AnalyticsData } from './analytics/data';
import './analytics/dashboard.css';

const tabs = [
  { id: 'overview', label: 'Overview' },
  { id: 'clinical', label: 'Clinical Activity' },
  { id: 'campus', label: 'Campus Health' },
  { id: 'pharmacy', label: 'Pharmacy' },
] as const;
type TabId = typeof tabs[number]['id'];
const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('valetudo_token') || localStorage.getItem('token')}` });
const timestamp = (value: Date) => value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function PrintReport({ data, fetchedAt }: { data: AnalyticsData; fetchedAt: Date }) {
  return createPortal(
    <article className="an-dashboard an-print">
      <header><h1>HealthLink analytics</h1><p>PSU Lingayen Infirmary · Fetched {timestamp(fetchedAt)}</p></header>
      <section><h2>Overview</h2><Overview data={data} print /></section>
      <section><h2>Clinical Activity</h2><Clinical data={data} print /></section>
      <section><h2>Campus Health</h2><Campus data={data} print /></section>
      <section><h2>Pharmacy</h2><Pharmacy data={data} print /></section>
    </article>,
    document.body,
  );
}

export default function AnalyticsDashboard() {
  const id = useId();
  const [tab, setTab] = useState<TabId>('overview');
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [fetchedAt, setFetchedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exportStatus, setExportStatus] = useState('');
  const [exporting, setExporting] = useState(false);
  const summaryRequest = useRef<AbortController | null>(null);
  const exportRequest = useRef<AbortController | null>(null);
  const exportMenu = useRef<HTMLDetailsElement>(null);
  const jumpTarget = useRef<string | null>(null);

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
        setData(null);
        setFetchedAt(null);
        setError('Your account cannot access analytics. Check your session or ask an administrator.');
        return;
      }
      if (!response.ok) throw new Error('Analytics fetch failed');
      const result: AnalyticsData = await response.json();
      if (!request.signal.aborted) {
        setData(result);
        setFetchedAt(new Date());
      }
    } catch {
      if (!request.signal.aborted) setError('Could not load analytics. Check your connection and retry.');
    } finally {
      if (!request.signal.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    return () => {
      summaryRequest.current?.abort();
      exportRequest.current?.abort();
    };
  }, [refresh]);

  useEffect(() => {
    if (jumpTarget.current) {
      document.getElementById(jumpTarget.current)?.focus();
      jumpTarget.current = null;
    }
  }, [tab]);

  function switchTab(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const last = tabs.length - 1;
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index + last) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? last : null;
    if (next === null) return;
    event.preventDefault();
    setTab(tabs[next].id);
    document.getElementById(`${id}-${tabs[next].id}`)?.focus();
  }

  async function download(format: 'excel' | 'pdf') {
    if (exportRequest.current) return;
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
      const response = await fetch(`${API_BASE_URL}/api/analytics/export/${format}`, { headers: authHeaders(), signal: request.signal });
      if (!response.ok) throw new Error('Export failed');
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
      if (!request.signal.aborted) setExportStatus('Could not export the report. Use Export to try again.');
    } finally {
      exportRequest.current = null;
      if (!request.signal.aborted) setExporting(false);
    }
  }

  return <main className="an-dashboard">
    <header className="an-header">
      <div><h1>Health analytics</h1><p>Clinic activity, campus health, and pharmacy stock</p></div>
      <div className="an-controls">
        <button type="button" aria-disabled={loading} onClick={() => { if (!loading) void refresh(); }}><Icon name="refresh" size={17} /> Refresh</button>
        <details ref={exportMenu} className="an-export" onBlur={event => {
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
        </details>
        <button type="button" disabled={!data} onClick={() => window.print()}><Icon name="print" size={17} /> Print dashboard</button>
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
        {tabs.map((item, index) => <button key={item.id} type="button" role="tab" id={`${id}-${item.id}`}
          aria-selected={tab === item.id} aria-controls={`${id}-panel-${item.id}`} tabIndex={tab === item.id ? 0 : -1}
          onKeyDown={event => switchTab(event, index)} onClick={() => setTab(item.id)}>{item.label}</button>)}
      </div>
      {tabs.map(item => <div key={item.id} role="tabpanel" id={`${id}-panel-${item.id}`}
        aria-labelledby={`${id}-${item.id}`} tabIndex={0} hidden={tab !== item.id}>
        {item.id === 'overview' && <Overview data={data} jump={next => {
          jumpTarget.current = next === 'campus' ? 'an-respiratory' : 'an-reorder';
          setTab(next);
        }} />}
        {item.id === 'clinical' && <Clinical data={data} />}
        {item.id === 'campus' && <Campus data={data} />}
        {item.id === 'pharmacy' && <Pharmacy data={data} />}
      </div>)}
      {fetchedAt && <PrintReport data={data} fetchedAt={fetchedAt} />}
    </>}
  </main>;
}
