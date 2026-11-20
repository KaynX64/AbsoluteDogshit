import Dialog from '../../shared/ui/Dialog';
import { btnGhost, btnPrimary } from '../../theme';
import type { PrescribingReview, ReviewAcknowledgements } from './prescribingTypes';

export default function StructuredPrescriptionReview({ review, patient, acknowledgements: ack, onAcknowledge, busy, locked,
  error, onClose, onConfirm, onRefresh }: {
  review: PrescribingReview; patient: string; acknowledgements: ReviewAcknowledgements;
  onAcknowledge: (value: ReviewAcknowledgements) => void; busy: boolean; locked: boolean; error: string;
  onClose: () => void; onConfirm: () => void; onRefresh: () => void;
}) {
  const { safety, draft } = review;
  const blocked = safety.findings.some(it => it.severity === 'contraindicated');
  const limited = safety.coverage !== 'local_rules_checked' || safety.unverified_item_keys.length > 0;
  const ready = ack.patient_reviewed && (!limited || ack.coverage_reviewed) &&
    (!safety.duplicate_groups.length || ack.duplicates_reviewed) &&
    safety.findings.filter(it => it.severity === 'severe').every(it => ack.severe_reasons[it.id]?.trim());
  return <Dialog label="Review prescription" busy={busy || locked} onDismiss={onClose}>
    <div className="modal-card rx-v2-review">
      <header className="dialog-header"><h3 tabIndex={-1} data-dialog-initial>Review prescription</h3>
        <p>{patient} · Valid until {draft.expires_at}</p></header>
      <div className="dialog-body">
        {draft.items.map((item, index) => <article key={item.item_key}>
          <h4>{index + 1}. {item.generic_name}{item.brand_name ? ` (${item.brand_name})` : ''}</h4>
          <p>{item.fulfillment === 'clinic' ? 'Clinic dispensing' : 'External pharmacy — not dispensed by the infirmary'}
            {!item.catalog_medicine_id && ' · Manually identified medicine'}</p>
          <dl><dt>Preparation</dt><dd>{item.strength} · {item.form}</dd>
            <dt>Dose / route</dt><dd>{item.dose_amount} {item.dose_unit} · {item.route}</dd>
            <dt>Schedule</dt><dd>{item.schedule.kind === 'fixed' ? item.schedule.frequency : item.schedule.kind === 'prn'
              ? `As needed for ${item.schedule.prn_reason}; limits: ${item.schedule.prn_limits}` : 'Custom — see directions'}</dd>
            <dt>Course</dt><dd>{[item.duration_days ? `${item.duration_days} days` : '', item.review_on ? `Review on ${item.review_on}` : ''].filter(Boolean).join(' · ')}</dd>
            <dt>Supply</dt><dd>{item.quantity} {item.quantity_unit}{item.pack_size && ` (${item.pack_size})`}</dd>
            <dt>Directions</dt><dd>{item.directions}</dd></dl>
        </article>)}
        {draft.notes && <article><h4>Patient advice — printed on prescription</h4><p>{draft.notes}</p></article>}
        <section className="rx-v2-safety" aria-label="Safety review">
          <h4>{safety.coverage === 'local_rules_checked' ? 'Local interaction rules checked' : safety.coverage === 'partial' ? 'Partial interaction-check coverage' : 'Interaction check not performed'}</h4>
          <p>{safety.scope}</p>
          {!safety.findings.length && safety.coverage !== 'not_checked' && <p>No listed interactions found among the identified pairs. This is not a complete safety assessment.</p>}
          {safety.findings.map(warning => <article key={warning.id}>
            <strong>{warning.severity}: {warning.medicine_a} / {warning.medicine_b}</strong>
            <p>{warning.description}</p>{warning.recommendation && <p>{warning.recommendation}</p>}
            {warning.severity === 'severe' && <label>Override reason
              <textarea maxLength={1000} disabled={busy || locked} value={ack.severe_reasons[warning.id] || ''}
                onChange={event => onAcknowledge({ ...ack, severe_reasons: { ...ack.severe_reasons, [warning.id]: event.target.value } })} />
            </label>}
          </article>)}
          {blocked && <p role="alert">A contraindicated combination cannot be issued. Return to the form.</p>}
          <label><input type="checkbox" checked={ack.patient_reviewed} disabled={busy || locked}
            onChange={event => onAcknowledge({ ...ack, patient_reviewed: event.target.checked })} /> I reviewed the patient's allergies and current medicines.</label>
          {limited && <label><input type="checkbox" checked={ack.coverage_reviewed} disabled={busy || locked}
            onChange={event => onAcknowledge({ ...ack, coverage_reviewed: event.target.checked })} /> I manually reviewed medicines and safety considerations outside this check's coverage.</label>}
          {safety.duplicate_groups.length > 0 && <label><input type="checkbox" checked={ack.duplicates_reviewed} disabled={busy || locked}
            onChange={event => onAcknowledge({ ...ack, duplicates_reviewed: event.target.checked })} /> I reviewed the duplicate generic-name warnings and retained these items deliberately.</label>}
        </section>
      </div>
      <footer className="dialog-footer">
        {error && <p className="dialog-error" role="alert">{error}</p>}
        <button type="button" style={btnGhost} disabled={busy || locked} onClick={onClose}>Return to form</button>
        <button type="button" style={btnGhost} disabled={busy || locked} onClick={onRefresh}>Refresh review</button>
        <button type="button" style={btnPrimary} disabled={busy || blocked || !ready} onClick={onConfirm}>
          {busy ? 'Issuing…' : locked ? 'Retry issuance' : 'Confirm and issue prescription'}</button>
      </footer>
    </div>
  </Dialog>;
}
