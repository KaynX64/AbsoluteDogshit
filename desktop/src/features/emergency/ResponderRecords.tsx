import { useEffect, useState } from 'react';
import Icon from '../../shared/ui/Icon';
import { navigateTabs } from '../../shared/ui/tabKeyboard';
import { useIncidentReports } from './IncidentReportContext';
import { useResponderAccess } from './ResponderAccess';
import { useResponderRecords, type RecordKind, type RecordFilters } from './useResponderRecords';
import { needsAttention, reportedDate, outcomeLabel, type HistoryRecord } from './reportApi';
import ResponderRecordDetail from './ResponderRecordDetail';
import EmergencyAlertBanner from './EmergencyAlertBanner';

export default function ResponderRecords({ history = false }: { history?: boolean }) {
  const { tier } = useResponderAccess();
  const { summary, error: countError, refresh, openReport } = useIncidentReports();
  const [tab, setTab] = useState<RecordKind>('pending');
  const kind = history ? 'history' : tab === 'filed' && !summary?.canViewFiled ? 'pending' : tab;
  const [filters, setFilters] = useState<RecordFilters>({ search: '', period: history ? '30' : 'all', from: '', to: '', status: 'all' });
  const [selected, setSelected] = useState<HistoryRecord | null>(null);
  const page = useResponderRecords(kind, filters);
  useEffect(() => {
    if (summary && !summary.canViewFiled && tab === 'filed') {
      setSelected(null); setTab('pending'); setFilters({ search: '', period: 'all', from: '', to: '', status: 'all' });
    }
  }, [summary?.canViewFiled, tab]);
  const tabs: Array<{ key: RecordKind; label: string; icon: string }> = [
    { key: 'pending', label: 'Needs report', icon: 'assignment_late' }, { key: 'drafts', label: 'My drafts', icon: 'edit_note' },
    ...(summary?.canViewFiled ? [{ key: 'filed' as const, label: 'Filed', icon: 'task_alt' }] : []),
  ];
  const changeTab = (value: RecordKind) => { setSelected(null); setTab(value); setFilters({ search: '', period: value === 'filed' ? '30' : 'all', from: '', to: '', status: 'all' }); };
  const patch = (value: Partial<RecordFilters>) => { setFilters(current => ({ ...current, ...value })); };
  if (tier !== 'clinical') return <div className="rh-empty">History and incident reports are restricted to authorized response staff.</div>;
  return <div className="rh-workspace">
    <EmergencyAlertBanner />
    <header className="rh-heading" data-workspace-view><div><span className="rh-eyebrow">Campus response records</span><h1><Icon name={history ? 'history' : 'assignment'} size={28} /> {history ? 'Alert history' : 'Incident reports'}</h1>
      <p>{history ? 'Review closed incidents, reported locations and the recorded response timeline.' : 'Complete outstanding documentation, resume your private desktop drafts and review filed reports.'}</p></div>
      <button className="rh-button" onClick={() => { void page.reload(); void refresh(); }}><Icon name="refresh" size={18} />Refresh</button></header>
    {!history && summary && <div className="rh-actions" aria-label="Report counts"><span className="rh-badge">{summary.pending} need a report</span><span className="rh-badge rh-badge--attention">{summary.overdue} over 24 hours</span><span className="rh-badge">{summary.drafts} private drafts</span></div>}
    {countError && <div className="rh-alert" role="status">{countError} <button className="rh-button" onClick={() => void refresh()}>Retry counts</button></div>}
    {!history && <div className="rh-tabs" role="tablist" aria-label="Incident report views" onKeyDown={event => navigateTabs(event, false)}>{tabs.map(item => <button key={item.key} id={`report-tab-${item.key}`} role="tab" aria-selected={kind === item.key} aria-controls="responder-record-panel" tabIndex={kind === item.key ? 0 : -1}
      onClick={() => changeTab(item.key)}><Icon name={item.icon} size={18} />{item.label}</button>)}</div>}
    <div className="rh-toolbar">
      <label className="rh-search"><Icon name="search" size={19} /><input aria-label="Search responder records" placeholder="Search incident, report, name, ID or location" value={filters.search} onChange={event => patch({ search: event.target.value })} /></label>
      {history && <label>Outcome<select value={filters.status} onChange={event => patch({ status: event.target.value })}><option value="all">All closed alerts</option><option value="resolved">Resolved</option><option value="false_alarm">False alarms</option></select></label>}
      <label>Dates<select value={filters.period} onChange={event => patch({ period: event.target.value })}><option value="30">Last 30 days</option><option value="all">All time</option><option value="custom">Choose dates</option></select></label>
      {filters.period === 'custom' && <><label>From<input type="date" value={filters.from} onChange={event => patch({ from: event.target.value })} /></label><label>To<input type="date" value={filters.to} onChange={event => patch({ to: event.target.value })} /></label></>}
      <button className="rh-button" onClick={() => setFilters({ search: '', status: 'all', period: history || kind === 'filed' ? '30' : 'all', from: '', to: '' })}>Clear filters</button>
    </div>
    <section id="responder-record-panel" role={!history ? 'tabpanel' : undefined} aria-labelledby={!history ? `report-tab-${kind}` : undefined} className="rh-card" data-workspace-view>
      {page.loading && <p role="status">Loading records…</p>}
      {page.error && <div className="rh-alert" role="alert">{page.error} <button className="rh-button" onClick={() => void page.reload()}>Retry</button></div>}
      {!page.loading && !page.error && page.records.length === 0 && <div className="rh-empty"><Icon name={kind === 'pending' ? 'task_alt' : 'search_off'} size={36} /><h2>{filters.search ? 'No matching records' : kind === 'pending' ? 'No outstanding reports' : 'No records in this view'}</h2><p>{filters.period === 'custom' && (!filters.from || !filters.to) ? 'Choose both dates to search.' : 'Try another search or date range. Pending work remains visible until filed.'}</p></div>}
      {page.records.length > 0 && <div className="rh-table-wrap"><table className="rh-table"><thead><tr><th>Incident / person</th><th>Location / time</th><th>Outcome / documentation</th><th>Actions</th></tr></thead><tbody>
        {page.records.map(row => <tr key={row.alertId}><td><strong>SOS-{row.alertId}{row.reportId ? ` · IR-${row.reportId}` : ''}</strong><small>{row.patient.name}</small><small>{row.patient.identifier}</small></td>
          <td>{row.location || 'Location not recorded'}<small>{reportedDate(kind === 'filed' ? row.filedAt : row.resolvedAt)}</small>{row.documentedByName && <small>Filed by {row.documentedByName}</small>}</td>
          <td><span className="rh-badge">{outcomeLabel(row.status)}</span><small>{row.needsReport ? row.hasDraft ? 'My draft saved' : 'Report needed' : row.reportId ? 'Report filed' : 'Report not required'}</small>
            {needsAttention(row) && <span className="rh-badge rh-badge--attention">Over 24 hours</span>}{row.deferredAt && <small>Last deferred {reportedDate(row.deferredAt)}</small>}</td>
          <td><div className="rh-actions"><button className="rh-button" onClick={() => setSelected(row)}>View</button>{row.needsReport && <button className="rh-button rh-button--primary" onClick={() => openReport(row.alertId)}>{row.hasDraft ? 'Resume draft' : 'Write report'}</button>}</div></td></tr>)}
      </tbody></table></div>}
      {page.nextCursor && <button className="rh-button" disabled={page.loading} onClick={() => void page.more()}>Load more records</button>}
    </section>
    {selected && <ResponderRecordDetail record={selected} filed={kind === 'filed'} onClose={() => setSelected(null)} />}
  </div>;
}
