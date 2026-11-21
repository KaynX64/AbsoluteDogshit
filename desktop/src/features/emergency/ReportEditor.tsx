import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import Icon from '../../shared/ui/Icon';
import { useReportDraft } from './useReportDraft';
import { reportRequest, reportedDate, ReportApiError } from './reportApi';
import { useIncidentReports } from './IncidentReportContext';
import { useResponderAccess } from './ResponderAccess';

export interface ReportEditorHandle { close: () => void }
export const ReportEditor = forwardRef<ReportEditorHandle, { alertId: number; onClose: () => void }>(function ReportEditor({ alertId, onClose }, ref) {
  const draft = useReportDraft(alertId);
  const { refresh } = useIncidentReports();
  const { canUpdateStatus, refreshAccess } = useResponderAccess();
  const [submitting, setSubmitting] = useState(false);
  const [leave, setLeave] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const [leaving, setLeaving] = useState(false);
  const closing = useRef(false);
  const busy = submitting || draft.saving || leaving;
  const saveReturn = async () => {
    if (submitting || closing.current) return;
    if (draft.filed) { onClose(); return; }
    closing.current = true; setLeaving(true);
    try {
      if (await draft.save(true)) { await refresh(); if (draft.active.current) onClose(); }
      else if (draft.active.current) setLeave(true);
    } finally { closing.current = false; if (draft.active.current) setLeaving(false); }
  };
  useImperativeHandle(ref, () => ({ close: () => { void saveReturn(); } }));
  const file = async () => {
    if (busy || !canUpdateStatus('resolved')) return;
    if (draft.fields.incidentDetails.trim().length < 5 || !draft.fields.resolvedAt) {
      draft.setError('Describe the incident with at least 5 characters and confirm its resolution date.'); return;
    }
    setSubmitting(true);
    try {
      if (!await draft.save()) return;
      const data = draft.current.current;
      await reportRequest(`/${alertId}/incident-report`, { method: 'POST', body: JSON.stringify({
        incident_details: data.incidentDetails.trim(), treatment_notes: data.treatmentNotes.trim() || null, resolved_at: data.resolvedAt,
      }) });
      if (!draft.active.current) return;
      draft.setFiled(true); await refresh(); if (draft.active.current) onClose();
    } catch (err: any) {
      if (!draft.active.current) return;
      draft.setError(err.message);
      if (err instanceof ReportApiError && err.code === 'REPORT_ALREADY_FILED') { draft.setFiled(true); await refresh(); }
      if (err.status === 401 || err.status === 403) await refreshAccess(true);
    } finally { if (draft.active.current) setSubmitting(false); }
  };
  const inputDate = draft.fields.resolvedAt ? new Date(Date.parse(draft.fields.resolvedAt) + 8 * 3600000).toISOString().slice(0, 16) : '';
  return <div className="rh-modal">
    <div className="dialog-header"><div><span className="rh-eyebrow">Incident documentation · SOS-{alertId}</span>
      <h2 data-dialog-initial tabIndex={-1}><Icon name="edit_document" size={22} /> Incident report</h2></div>
      <button className="rh-button" disabled={submitting} onClick={() => void saveReturn()} aria-label="Save report and return"><Icon name="close" size={18} /></button></div>
    {draft.loading ? <p role="status">Loading incident and saved draft…</p> : <>
      {draft.prefill && <div className="rh-card"><strong>{draft.prefill.patient.name}</strong>
        <div className="rh-muted">{draft.prefill.patient.studentNo} · {draft.prefill.patient.roleLabel} · {draft.prefill.patient.phone || 'No contact recorded'}</div>
        <p className="rh-muted">Reported {reportedDate(draft.prefill.alert.createdAt)}</p></div>}
      {draft.filed && <p className="rh-alert" role="status">This incident already has a filed report. Filed reports are read-only. Your current text remains here until you close this window.</p>}
      {draft.error && <div className="rh-alert" role="alert">{draft.error}
        {draft.conflict ? <div className="rh-actions">
          <button className="rh-button" onClick={() => setLeave(true)}>Reload saved draft…</button>
          <button className="rh-button" onClick={async () => { try { await navigator.clipboard.writeText(`${draft.fields.incidentDetails}\n\n${draft.fields.treatmentNotes}`); setCopyStatus('Text copied.'); } catch { setCopyStatus('Select and copy the text below before reloading.'); } }}>Copy my text</button><span>{copyStatus}</span>
        </div> : !draft.filed && <button className="rh-button" disabled={busy} onClick={() => void (draft.ready ? draft.save() : draft.load())}>Retry</button>}
      </div>}
      <form className="rh-editor" onSubmit={event => { event.preventDefault(); void file(); }}>
        <label>Resolution date and time · Philippine time<input type="datetime-local" value={inputDate} disabled={busy || draft.filed || draft.conflict}
          onChange={event => draft.change({ resolvedAt: event.target.value ? new Date(event.target.value + '+08:00').toISOString() : null })} /></label>
        <label>Incident details <span className="rh-muted">What happened and how the incident was handled</span>
          <textarea maxLength={4000} value={draft.fields.incidentDetails} readOnly={!draft.ready || leaving || submitting || draft.filed || draft.conflict} onChange={event => draft.change({ incidentDetails: event.target.value })} /></label>
        <label>Treatment / handover notes <span className="rh-muted">Optional · record only what was actually provided or handed over</span>
          <textarea maxLength={4000} value={draft.fields.treatmentNotes} readOnly={!draft.ready || leaving || submitting || draft.filed || draft.conflict} onChange={event => draft.change({ treatmentNotes: event.target.value })} /></label>
        <div className="rh-save-state" role="status" aria-live="polite">{submitting ? 'Filing report…' : draft.saving || leaving ? 'Saving draft…' : draft.error ? 'Draft not saved. Your text is retained in this window.' : draft.dirty ? 'Changes waiting to save…' : draft.hasSaved ? 'Saved · private to your account across desktop sessions' : 'No unsaved changes'}</div>
        <div className="dialog-footer">
          <button type="button" className="rh-button" disabled={submitting} onClick={() => void saveReturn()}><Icon name="save" size={17} />{draft.filed ? 'Close' : 'Save and return'}</button>
          {!draft.filed && <button type="submit" className="rh-button rh-button--primary" disabled={busy || draft.conflict || !draft.ready}><Icon name="task_alt" size={17} />File report</button>}
        </div>
      </form>
    </>}
    {leave && <div className="rh-alert" role="alert"><p>{draft.conflict ? 'Reloading replaces the text in this window with the saved desktop draft.' : 'The latest changes have not been saved. Keep editing, or explicitly leave without those changes.'}</p>
      <div className="rh-actions"><button className="rh-button" onClick={() => setLeave(false)}>Keep editing</button>
        <button className="rh-button" onClick={() => { setLeave(false); if (draft.conflict) void draft.load(); else onClose(); }}>{draft.conflict ? 'Replace with saved draft' : 'Leave without latest changes'}</button></div></div>}
  </div>;
});
