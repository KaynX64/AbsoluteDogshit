import { useState } from 'react';
import Icon from '../../shared/ui/Icon';
import QualificationEventDetails, { QualificationRecordFields, qualificationEventTitle } from './QualificationEventDetails';
import { editableQualifications, openQualifications, qualificationDate as date, qualificationLabel as label, type QualificationDraft } from './qualificationApi';

const checks: Record<string, string> = {
  identityVerified: 'Identity verified', affiliationVerified: 'Campus affiliation verified', orientationCompleted: 'Campus orientation completed',
  professionalCredentialsVerified: 'Required professional credentials verified',
};
const competencies: Record<string, string> = { sceneSafety: 'Scene safety', escalation: 'Emergency escalation', firstAid: 'First aid',
  basicLifeSupport: 'Basic life support', privacy: 'Privacy and responder boundaries', appUse: 'SOS app use' };
const assessmentGroups = [{ title: 'Eligibility verification', items: checks }, { title: 'Practical competencies', items: competencies }];
type Props = {
  detail: any; overview: any; appointment: any; draft: QualificationDraft; dirty: boolean; busy: boolean; loading: boolean;
  patch: (value: Partial<QualificationDraft>) => void; action: (value: string) => void; reloadDraft: () => void;
  endAppointment: (status: string) => void; files: (file: File) => void; download: (file: any) => void;
};

export default function QualificationDetail({ detail, overview, appointment, draft, dirty, busy, loading, patch, action,
  reloadDraft, endAppointment, files, download }: Props) {
  const own = Number(detail.user_id) === overview.actor.userId;
  const canStartReview = !own && overview.actor.reviewer && detail.status === 'submitted';
  const canReview = !own && overview.actor.reviewer && detail.status === 'under_review';
  const canEdit = own && editableQualifications.includes(detail.status);
  const assessment = draft.assessment;
  const [decision, setDecision] = useState('');
  const setAssessment = (value: any) => patch({ assessment: { ...assessment, ...value } });
  const appointmentStatus = appointment?.appointment_status || appointment?.status;
  const field = (key: string, title: string, type = 'text') => <label>{title}<input type={type} value={assessment[key] || ''}
    disabled={busy || !canReview} maxLength={key === 'notes' ? 4000 : 200} onChange={event => setAssessment({ [key]: event.target.value })} /></label>;
  return <>
    <header className="qualification-detail-heading">
      <div><span className="qualification-meta">{label(detail.application_type)} · #{detail.application_id}</span>
        <h2>{detail.applicant?.name || detail.applicant_name || (own ? 'My application' : `Application #${detail.application_id}`)}</h2>
        {detail.applicant && <p className="qualification-muted">{detail.applicant.email} · {detail.applicant.campus_identifier || 'No campus ID'}</p>}</div>
      <span className="qualification-pill" data-status={detail.status}>{label(detail.status)}</span>
    </header>
    <div className="qualification-detail-body" id="qualification-detail-content" key={detail.application_id} aria-busy={loading}>
      {dirty && draft.revision !== detail.revision && <div className="qualification-notice" role="status">This record has changed. Your edits are kept; reload the latest version before saving.
        <button type="button" disabled={busy} onClick={reloadDraft}>Reload latest version</button></div>}
      {detail.fixture_key && <p className="qualification-demo-notice"><Icon name="info" size={16} />Synthetic demo data</p>}
      {detail.decision_reason && <p className="qualification-notice"><strong>Clinic feedback:</strong> {detail.decision_reason}</p>}
      <section className="qualification-section"><h3>Application details</h3>
        <p className="qualification-muted">{detail.source === 'nomination' ? 'Clinic nomination' : detail.source === 'legacy' ? 'Existing designation imported for review' : 'Self-application'}
          {detail.applicant?.registered_affiliation ? ` · ${detail.applicant.registered_affiliation}` : ''}</p>
        {canEdit ? <div className="qualification-form">
          <label>Requested responder level<select value={draft.level} disabled={busy} onChange={event => patch({ level: event.target.value })}>
            <option value="community">Community responder</option><option value="staff">Response staff — requires a staff role</option></select></label>
          <label>Campus affiliation<input value={draft.affiliation} disabled={busy} maxLength={200} onChange={event => patch({ affiliation: event.target.value })} /></label>
          <label className="qualification-wide">Training history or requested campus assessment<textarea value={draft.training} disabled={busy} maxLength={4000} onChange={event => patch({ training: event.target.value })} /></label>
          <label className="qualification-check qualification-wide"><input type="checkbox" checked={draft.accepted} disabled={busy} onChange={event => patch({ accepted: event.target.checked })} />
            I accept campus responder responsibilities, escalation rules and privacy requirements.</label>
        </div> : <dl className="qualification-facts">
          <div><dt>Requested level</dt><dd>{label(detail.requested_level)}</dd></div><div><dt>Campus affiliation</dt><dd>{detail.form?.affiliation || 'Not provided'}</dd></div>
          <div className="qualification-wide"><dt>Training history / assessment request</dt><dd>{detail.form?.trainingHistory || 'Not provided'}</dd></div>
        </dl>}
      </section>
      <section className="qualification-section"><h3>Evidence <span className="qualification-section-count">{detail.evidence?.length || 0}</span></h3>
        <p className="qualification-muted">External certificates are optional. A documented clinic assessment may establish competency.</p>
        {!detail.evidence?.length && <p className="qualification-muted">No evidence attached.</p>}
        {detail.evidence?.map((file: any) => <button className="qualification-file" disabled={busy} key={file.evidence_id} onClick={() => download(file)}>
          <Icon name="attach_file" size={16} />{file.file_name} · {Math.ceil(file.file_size / 1024)} KB</button>)}
        {(canEdit || canReview) && <label>Attach PDF, JPEG or PNG (up to 5 MB)<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={busy} onChange={event => {
          const file = event.target.files?.[0]; if (file) files(file); event.target.value = '';
        }} /></label>}
      </section>
      {(canStartReview || canReview || detail.assessment) && <section className="qualification-section"><h3>Clinic assessment</h3>
        {(canStartReview || canReview) && <p className="qualification-muted">{canStartReview
          ? 'This application is read-only until you select Start review. Then record the assessment and choose a decision.'
          : 'Verify eligibility and record the practical assessment before making a decision.'}</p>}
        {!canReview && !canStartReview ? <QualificationRecordFields data={detail.assessment} /> : <div className="qualification-form">
          {assessmentGroups.map(({ items, title }) => <fieldset className="qualification-assessment-checks qualification-wide" key={title}>
            <legend>{title}</legend><div>{Object.entries(items).map(([key, title]) => <label className="qualification-check" key={key}>
            <input type="checkbox" checked={(key in checks ? assessment[key] : assessment.competencies?.[key]) === true} disabled={!canReview || busy}
              onChange={event => setAssessment(key in checks ? { [key]: event.target.checked } : { competencies: { ...assessment.competencies, [key]: event.target.checked } })} />{title}</label>)}</div>
          </fieldset>)}
          {field('assessor', 'Assessor')}{field('assessmentDate', 'Assessment date', 'date')}{field('method', 'Training or assessment method')}
          {field('requiredCredentialExpiry', 'Required credential expiry (midnight Manila), if applicable', 'date')}
          <label>Assessment result<select value={assessment.result || 'not_assessed'} disabled={!canReview || busy} onChange={event => setAssessment({ result: event.target.value })}>
            <option value="not_assessed">Not assessed</option><option value="passed">Passed</option><option value="failed">Needs further training</option></select></label>
          <label className="qualification-wide">Assessment notes<textarea value={assessment.notes || ''} disabled={!canReview || busy} maxLength={4000} onChange={event => setAssessment({ notes: event.target.value })} /></label>
        </div>}
        {canReview && <label>Decision rationale or requested changes<textarea value={draft.reason} disabled={busy} maxLength={4000} onChange={event => patch({ reason: event.target.value })} /></label>}
      </section>}
      {appointment?.appointment_id && <section className="qualification-section"><h3>Appointment: {label(appointmentStatus).toLowerCase()}</h3>
        <p className="qualification-muted">{label(appointment.level || appointment.appointment_level)} · Valid until {date(appointment.expires_at)}</p>
        {(overview.actor.admin || overview.actor.reviewer) && ['active', 'suspended'].includes(appointmentStatus) && <div className="qualification-appointment-controls">
          <label>Suspension or revocation reason<textarea value={draft.reason} disabled={busy} onChange={event => patch({ reason: event.target.value })} maxLength={4000} /></label>
          <div className="qualification-toolbar">{['suspended', 'revoked'].map(state => <button key={state} disabled={busy || !draft.reason.trim() || state === appointmentStatus}
            onClick={() => endAppointment(state)}>{state === 'revoked' ? 'Revoke' : 'Suspend'}</button>)}</div>
        </div>}
      </section>}
      <section className="qualification-section qualification-history"><h3>Decision history <span className="qualification-section-count">{detail.events?.length || 0}</span></h3>
        {!detail.events?.length && <p className="qualification-muted">No decisions recorded yet.</p>}
        <ol className="qualification-timeline">{detail.events?.map((entry: any) => <li key={entry.event_id}>
          <article className="qualification-event">
            <header className="qualification-event-heading"><div><h4>{qualificationEventTitle(entry.action)}</h4>
              <span className="qualification-muted">{entry.actor_name || 'System'}</span></div>
              <time className="qualification-muted" dateTime={entry.created_at}>{date(entry.created_at)}</time>
            </header>
            <QualificationEventDetails details={entry.details} />
          </article></li>)}</ol>
      </section>
    </div>
    {(canEdit || canStartReview || canReview || (own && openQualifications.includes(detail.status))) && <footer className="qualification-detail-actions">
      <span className="qualification-save-state">{busy ? 'Saving…' : dirty ? 'Unsaved changes' : 'Up to date'}</span>
      <div className="qualification-toolbar">
        {canEdit && <>
          {detail.source === 'nomination' && !detail.nomination_accepted_at && <button disabled={busy || !draft.accepted} onClick={() => action('accept_nomination')}>Accept nomination</button>}
          <button disabled={busy} onClick={() => action('save')}>Save draft</button>
          <button className="qualification-primary" disabled={busy || !draft.accepted} onClick={() => action('submit')}>Submit for clinic review</button>
        </>}
        {own && openQualifications.includes(detail.status) && <button disabled={busy} onClick={() => action('withdraw')}>Withdraw</button>}
        {canStartReview && <button className="qualification-primary" disabled={busy} onClick={() => action('start_review')}>Start review</button>}
        {canReview && <>
          <button disabled={busy} onClick={() => action('save_assessment')}>Save assessment</button>
          <select aria-label="Review decision" value={decision} disabled={busy} onChange={event => setDecision(event.target.value)}>
            <option value="">Request changes / reject…</option><option value="needs_information">Request information</option>
            <option value="training_required">Require training</option><option value="reject">Reject</option>
          </select>
          <button disabled={busy || !decision || !draft.reason.trim()} onClick={() => action(decision)}>Apply decision</button>
          <button className="qualification-primary" disabled={busy || !draft.reason.trim()} onClick={() => action('approve')}>Approve appointment</button>
        </>}
      </div>
    </footer>}
  </>;
}
