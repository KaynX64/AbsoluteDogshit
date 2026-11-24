import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon';
import { useConfirmAction } from '../../shared/ui/ConfirmAction';
import { navigateTabs } from '../../shared/ui/tabKeyboard';
import { useTabMotion } from '../../shared/ui/selectionMotion';
import { useResponderAccess } from './ResponderAccess';
import { useQualificationRecords } from './useQualificationRecords';
import QualificationDetail from './QualificationDetail';
import QualificationManagement from './QualificationManagement';
import { qualificationApi as api, qualificationBase, qualificationDraft, qualificationDate as date,
  qualificationLabel as label, openQualifications, type QualificationDraft } from './qualificationApi';
import './qualifications.css';

type View = 'mine' | 'review';
const noRows: any[] = [];
export default function QualificationWorkspace() {
  const [view, setView] = useState<View>('mine');
  const [selections, setSelections] = useState<Record<View, number | null>>({ mine: null, review: null });
  const selected = selections[view];
  const records = useQualificationRecords(selected);
  const { overview, detail, refreshing, detailLoading, detailError } = records;
  const [drafts, setDrafts] = useState<Record<number, QualificationDraft>>({});
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState({ text: '', error: false });
  const [management, setManagement] = useState(false);
  const [filters, setFilters] = useState<Record<View, { search: string; status: string }>>({ mine: { search: '', status: 'all' }, review: { search: '', status: 'all' } });
  const locked = useRef(false), mounted = useRef(true);
  const { refreshAccess } = useResponderAccess();
  const { confirmAction, confirmation } = useConfirmAction();
  const rows = view === 'mine' ? overview?.applications || noRows : records.items || noRows;
  const actor = overview?.actor;
  const canManage = Boolean(actor?.admin || actor?.reviewer);
  const message = records.error || feedback.text || (!overview ? 'Loading qualification records…' : '');
  const filter = filters[view];
  const filtered = useMemo(() => rows.filter((row: any) => (filter.status === 'all' || row.status === filter.status) &&
    `${row.applicant_name || ''} ${row.application_id} ${label(row.application_type)} ${label(row.status)}`.toLowerCase().includes(filter.search.trim().toLowerCase())), [rows, filter]);
  const draft = detail ? drafts[detail.application_id] || qualificationDraft(detail) : null;
  const dirty = Boolean(detail && drafts[detail.application_id]);
  const appointment = detail && (detail.appointment || overview?.appointments?.find((row: any) => row.application_id === detail.application_id) ||
    records.items?.find((row: any) => row.application_id === detail.application_id && row.appointment_id));
  useTabMotion(view, ['mine', 'review'], mode => 'qualification-panel-' + mode);
  useTabMotion(String(selected || ''), rows.map((row: any) => String(row.application_id)), () => 'qualification-detail-content', Boolean(detail));
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (selected || !rows.length) return;
    const preferred = view === 'mine' ? rows.find((row: any) => openQualifications.includes(row.status)) || rows[0] : rows[0];
    setSelections(current => ({ ...current, [view]: preferred.application_id }));
  }, [rows, view, selected]);
  useEffect(() => {
    if (!overview) { setDrafts({}); return; }
    if (!canManage) {
      setView('mine'); setManagement(false);
      setDrafts(current => Object.fromEntries(Object.entries(current).filter(([, form]) => form.userId === Number(actor.userId))));
    }
  }, [overview?.actor.userId, overview?.actor.admin, overview?.actor.reviewer, canManage]);
  const patch = (value: Partial<QualificationDraft>) => {
    if (!detail || busy) return;
    setDrafts(current => ({ ...current, [detail.application_id]: { ...qualificationDraft(detail), ...current[detail.application_id], ...value } }));
  };
  const clearDraft = (id: number) => setDrafts(current => { const next = { ...current }; delete next[id]; return next; });
  const run = async (work: () => Promise<unknown>, success = '', reload = true, after?: () => void): Promise<void> => {
    if (locked.current) return;
    locked.current = true; setBusy(true); setFeedback({ text: '', error: false });
    try {
      await work();
      if (!mounted.current) return;
      if (reload) { records.invalidate(); await records.refresh(true); await refreshAccess(); }
      if (!mounted.current) return;
      after?.(); setFeedback({ text: success, error: false });
    } catch (err: any) {
      if (!mounted.current) return;
      setFeedback({ text: err.message, error: true });
      if ([401, 403, 409].includes(err.status)) await records.refresh(true);
    } finally { locked.current = false; if (mounted.current) setBusy(false); }
  };
  const action = async (name: string) => {
    if (!detail || !draft) return;
    if (name === 'withdraw' && !await confirmAction('Withdraw application', 'This application will close. An existing valid appointment remains unchanged.')) return;
    if (name === 'approve' && !await confirmAction('Approve responder appointment', 'This creates up to 12 months of responder access, capped by any required credential expiry.')) return;
    const id = detail.application_id;
    await run(() => api(`/applications/${id}`, 'PATCH', { action: name, revision: draft.revision, requestedLevel: draft.level,
      affiliation: draft.affiliation, trainingHistory: draft.training, acceptResponsibilities: draft.accepted, assessment: draft.assessment, reason: draft.reason }),
      name === 'save' ? 'Draft saved.' : name === 'save_assessment' ? 'Assessment saved.' : 'Qualification record updated.', true, () => {
        const latest = records.peekDetail(id);
        if (!latest || latest.revision <= draft.revision) return;
        const saved = qualificationDraft(latest);
        const retained = name === 'start_review' || name === 'accept_nomination' ? { ...draft, revision: saved.revision }
          : name === 'save_assessment' ? { ...saved, reason: draft.reason }
          : name === 'save' ? { ...saved, accepted: draft.accepted } : saved;
        if (JSON.stringify(retained) === JSON.stringify(saved)) clearDraft(id);
        else setDrafts(current => ({ ...current, [id]: retained }));
      });
  };
  const create = () => run(async () => {
    const row = await api('/applications', 'POST', { requestedLevel: overview.access.appointmentLevel || 'community', affiliation: '', trainingHistory: '' });
    setSelections(current => ({ ...current, mine: row.applicationId }));
  }, 'Draft created. Complete the details, then submit for clinic review.');
  const attach = (file: File) => {
    if (file.size > 5 * 1024 * 1024) { setFeedback({ text: 'Evidence must be no larger than 5 MB.', error: true }); return; }
    const body = new FormData(); body.append('file', file);
    void run(() => api(`/applications/${selected}/evidence`, 'POST', body), 'Evidence attached.');
  };
  const download = (file: any) => void run(async () => {
    const response = await fetch(qualificationBase + `/evidence/${file.evidence_id}`, { headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}` } });
    if (!response.ok) throw new Error('Evidence is unavailable or access was removed.');
    const url = URL.createObjectURL(await response.blob()), link = document.createElement('a');
    link.href = url; link.download = file.file_name; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, 'Evidence downloaded.', false);
  const endAppointment = async (status: string) => {
    if (!draft || !appointment) return;
    if (await confirmAction(status === 'revoked' ? 'Revoke appointment' : 'Suspend appointment', draft.reason))
      void run(() => api(`/appointments/${appointment.appointment_id}/end`, 'POST', { status, reason: draft.reason }), 'Appointment ' + status + '.', true, () => clearDraft(detail.application_id));
  };
  return <section className="qualification-workspace" aria-label="Responder qualifications">
    <header className="qualification-heading"><div className="qualification-heading-title"><Icon name="verified_user" size={28} />
      <div><h1>Responder qualifications</h1><div className="qualification-heading-caption">
        {!message && <p>Clinic assessment, approval and annual renewal.</p>}
        <div className="qualification-feedback" role={records.error || feedback.error ? 'alert' : 'status'}>{message}
          {records.error && <button disabled={refreshing} onClick={() => void records.refresh(true)}>Retry</button>}
        </div>
      </div></div></div>
      <button disabled={busy || refreshing} onClick={() => void records.refresh(true)}><Icon name="refresh" size={18} />{refreshing && overview ? 'Refreshing…' : 'Refresh'}</button></header>
    <div className="qualification-navigation">
      <div className="qualification-toolbar" role="tablist" aria-label="Qualification views" onKeyDown={event => navigateTabs(event, false)}>
        {([['mine', 'My qualification'], ...(canManage ? [['review', 'Applications and oversight']] : [])] as Array<[View, string]>).map(([mode, title]) =>
          <button key={mode} id={'qualification-tab-' + mode} role="tab" aria-selected={view === mode} aria-controls={'qualification-panel-' + mode}
            tabIndex={view === mode ? 0 : -1} disabled={busy} onClick={() => setView(mode)}><Icon name={mode === 'mine' ? 'person' : 'fact_check'} size={18} />{title}</button>)}
      </div>
      <div className="qualification-toolbar">
        {view === 'mine' && overview && !overview.applications.some((row: any) => openQualifications.includes(row.status)) &&
          <button className="qualification-primary" disabled={busy} onClick={create}>{overview.appointments.length ? 'Request renewal' : 'Apply to respond'}</button>}
        {view === 'review' && canManage && <button disabled={busy} onClick={() => { setFeedback({ text: '', error: false }); setManagement(true); }}>{actor.admin ? 'Nominations and reviewers' : 'Nominate an account'}</button>}
      </div>
    </div>
    {overview && !overview.enforced && <p className="qualification-notice">Roster preparation is in progress. Existing SOS access remains in place until the reviewed roster is enabled.</p>}
    {view === 'mine' && overview && <div className="qualification-status"><span><strong>{overview.access.authorized ? 'Qualified Responder' : overview.access.appointmentStatus ? label(overview.access.appointmentStatus) : 'No active responder appointment'}</strong>
      <span className="qualification-muted">{overview.access.appointmentLevel ? label(overview.access.appointmentLevel) : 'Apply for clinic assessment and campus response duties.'}</span></span>
      {overview.access.expiresAt && <span>Valid until {date(overview.access.expiresAt)}</span>}</div>}
    <div className="qualification-columns" id={'qualification-panel-' + view} role="tabpanel" aria-labelledby={'qualification-tab-' + view} data-workspace-view>
      <aside className="qualification-list-panel" aria-label="Application list">
        <header className="qualification-list-heading"><strong>{view === 'mine' ? 'My applications' : 'Applications'}</strong><span>{filtered.length} / {rows.length}</span></header>
        <div className="qualification-list-filters"><input aria-label="Search qualification applications" placeholder="Search loaded applications" value={filter.search}
          onChange={event => setFilters(current => ({ ...current, [view]: { ...filter, search: event.target.value } }))} />
          <select aria-label="Filter qualification status" value={filter.status} onChange={event => setFilters(current => ({ ...current, [view]: { ...filter, status: event.target.value } }))}>
            <option value="all">All statuses</option>{['draft', 'submitted', 'under_review', 'needs_information', 'training_required', 'approved', 'rejected', 'withdrawn'].map(status => <option key={status} value={status}>{label(status)}</option>)}
          </select></div>
        <div className="qualification-list" aria-label="Applications" aria-busy={!overview}>
          {!overview ? <p className="qualification-empty">Loading applications…</p> : !filtered.length ? <p className="qualification-empty">{rows.length ? 'No matching applications.' : 'No applications yet.'}</p> :
            filtered.map((row: any) => <button className="qualification-application" key={row.application_id} aria-pressed={selected === row.application_id} disabled={busy}
              onClick={() => setSelections(current => ({ ...current, [view]: row.application_id }))}>
              <span className="qualification-list-title"><strong>{view === 'review' ? row.applicant_name || `Application #${row.application_id}` : `${label(row.application_type)} #${row.application_id}`}</strong>
                {view === 'review' && <small>#{row.application_id}</small>}</span>
              <span className="qualification-list-meta"><span className="qualification-list-status" data-status={row.status}><span>{label(row.status)}</span></span>
                <time dateTime={row.created_at}>{date(row.created_at)}</time></span>
            </button>)}
          {view === 'review' && records.cursor && <button disabled={busy} onClick={() => void run(records.more, 'More applications loaded.', false)}>Load more</button>}
        </div>
        {view === 'mine' && overview?.notices.length > 0 && <details className="qualification-notifications"><summary>Notifications ({overview.notices.length})</summary>
          {overview.notices.map((notice: any) => <p key={notice.notice_id}>{date(notice.created_at)} · {notice.message}</p>)}</details>}
      </aside>
      <article className="qualification-card qualification-detail" aria-label="Selected application" aria-busy={detailLoading}>
        {detailError && <p className="qualification-notice" role="alert">{detailError} <button onClick={() => void records.refresh(true)}>Retry application</button></p>}
        {detail && draft && overview ? <QualificationDetail key={detail.application_id} detail={detail} overview={overview} appointment={appointment} draft={draft} dirty={dirty}
          busy={busy} loading={detailLoading} patch={patch} action={value => void action(value)} endAppointment={status => void endAppointment(status)} files={attach} download={download}
          reloadDraft={async () => { if (await confirmAction('Reload latest version', 'Replace unsaved local edits with the latest saved application?')) clearDraft(detail.application_id); }} /> :
          <div className="qualification-empty" role="status"><Icon name={selected ? 'hourglass_empty' : 'verified_user'} size={32} /><h2>{selected ? 'Loading application…' : 'Choose an application'}</h2>
            <p>{selected ? 'Preparing the application details.' : view === 'mine' ? 'Create an application to request campus assessment, or select an existing application.' : 'Select an application to review its details and decision history.'}</p></div>}
      </article>
    </div>
    {management && canManage && <QualificationManagement actor={actor} reviewers={records.reviewers || []} enforced={overview.enforced} busy={busy} feedback={feedback}
      onClose={() => setManagement(false)} run={run} confirmAction={confirmAction} />}
    {confirmation}
  </section>;
}
