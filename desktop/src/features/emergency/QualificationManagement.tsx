import { useState } from 'react';
import Dialog from '../../shared/ui/Dialog';
import { qualificationApi as api } from './qualificationApi';

type Props = {
  actor: any; reviewers: any[]; enforced: boolean; busy: boolean; feedback: { text: string; error: boolean }; onClose: () => void;
  run: (work: () => Promise<unknown>, success?: string, reload?: boolean) => Promise<void>;
  confirmAction: (title: string, detail: string) => Promise<boolean>;
};
export default function QualificationManagement({ actor, reviewers, enforced, busy, feedback, onClose, run, confirmAction }: Props) {
  const [search, setSearch] = useState(''), [candidate, setCandidate] = useState(''), [candidates, setCandidates] = useState<any[]>([]);
  const [searched, setSearched] = useState(false);
  return <Dialog label="Nominations and reviewers" busy={busy} onDismiss={onClose}>
    <div className="qualification-management">
      <header className="dialog-header"><h2 tabIndex={-1} data-dialog-initial>{actor.admin ? 'Nominations and reviewers' : 'Nominate an account'}</h2></header>
      <div className="dialog-body">
        <div className="qualification-feedback" role={feedback.error ? 'alert' : 'status'}>{feedback.text}</div>
        <section className="qualification-section"><h3>Nominate an account</h3><p className="qualification-muted">The applicant must accept the nomination and responder responsibilities before submission.</p>
          <form className="qualification-toolbar" onSubmit={event => { event.preventDefault(); void run(async () => {
            const rows = await api('/candidates?q=' + encodeURIComponent(search)); setCandidates(rows); setCandidate(''); setSearched(true);
          }, '', false); }}><label>Account name or ID<input value={search} disabled={busy} onChange={event => { setSearch(event.target.value); setCandidate(''); setCandidates([]); setSearched(false); }} /></label>
            <button disabled={busy || !search.trim()}>Search</button></form>
          {searched && candidates.length === 0 && <p role="status">No matching accounts. Try another name or ID.</p>}
          <label>Account<select value={candidate} disabled={busy} onChange={event => setCandidate(event.target.value)}><option value="">Choose an account</option>
            {candidates.map(row => <option value={row.user_id} key={row.user_id}>{row.name} · {row.roles}</option>)}</select></label>
          <div className="qualification-toolbar"><button className="qualification-primary" disabled={busy || !candidate} onClick={() => void run(() => api('/applications', 'POST', {
            userId: Number(candidate), requestedLevel: 'community', affiliation: '', trainingHistory: '',
          }), 'Nomination created; the applicant must accept.')}>Nominate</button>
            {actor.admin && <button disabled={busy || !candidate} onClick={() => void run(() => api(`/reviewers/${candidate}`, 'PUT', { isActive: true }), 'Clinic reviewer designated.')}>Designate nurse/doctor reviewer</button>}
          </div>
        </section>
        {actor.admin && <section className="qualification-section"><h3>Designated clinic reviewers</h3><p className="qualification-muted">Only active nurse and doctor accounts can review applications.</p>
          {reviewers.length === 0 && <p>No clinic reviewers designated.</p>}
          {reviewers.map(row => <div className="qualification-reviewer" key={row.user_id}><span><strong>{row.name}</strong><small>{row.is_active ? 'Active' : 'Inactive'}</small></span>
            {Boolean(row.is_active) && <button disabled={busy} onClick={async () => {
              if (await confirmAction('Remove reviewer designation', 'This account will no longer be able to decide responder applications.'))
                void run(() => api(`/reviewers/${row.user_id}`, 'PUT', { isActive: false }), 'Reviewer designation removed.');
            }}>Remove designation</button>}</div>)}
        </section>}
        {actor.admin && !enforced && <section className="qualification-section"><h3>Reviewed roster</h3><p>Enable the reviewed roster only after the operational staff appointments are approved.</p>
          <button disabled={busy} onClick={async () => {
            if (await confirmAction('Enable reviewed roster', 'All SOS access will require an active clinic-approved appointment. Unapproved accounts will lose responder access. At least one approved response staff appointment is required.'))
              void run(() => api('/enable', 'POST', {}), 'Reviewed roster enabled.');
          }}>Enable reviewed roster</button>
        </section>}
      </div>
      <footer className="dialog-footer"><button disabled={busy} onClick={onClose}>Done</button></footer>
    </div>
  </Dialog>;
}
