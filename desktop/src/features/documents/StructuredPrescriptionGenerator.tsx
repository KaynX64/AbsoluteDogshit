import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { btnGhost, btnPrimary } from '../../theme';
import { navigateTabs } from '../../shared/ui/tabKeyboard';
import type { MedicineMaster } from './FormularySelect';
import MedicationEditor from './MedicationEditor';
import StructuredPrescriptionReview from './StructuredPrescriptionReview';
import { draftError, emptyAcknowledgements, newMedication, type MedicationDraft, type PrescriptionDraft,
  type PrescriptionGeneratorProps, type PrescribingReview } from './prescribingTypes';
import './structured-prescribing.css';

export default function StructuredPrescriptionGenerator({ patientUserId, appointmentId, verifiedPatient, initialNotes,
  isArchived = false, signatureEnrolled, onPrescriptionIssued, onPrescriptionError, onSignatureRequired,
  active = true }: PrescriptionGeneratorProps) {
  const [items, setItems] = useState<MedicationDraft[]>(() => [newMedication()]);
  const [selected, setSelected] = useState(0);
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);
  const [query, setQuery] = useState('');
  const [notes, setNotes] = useState(initialNotes || '');
  const [expires, setExpires] = useState('');
  const [capable, setCapable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<PrescribingReview | null>(null);
  const [ack, setAck] = useState(emptyAcknowledgements);
  const [issued, setIssued] = useState<number | null>(null);
  const [unresolved, setUnresolved] = useState(false);
  const submitted = useRef<string | null>(null);
  const requestId = useRef<string | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const headers = () => ({ Authorization: `Bearer ${localStorage.getItem('valetudo_token')}`, 'Content-Type': 'application/json' });
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; revision.current++; }; }, []);
  useEffect(() => {
    if (!active || isArchived) return;
    const abort = new AbortController();
    setLoading(true);
    Promise.all([
      fetch(`${API_BASE_URL}/api/documents/prescription-capabilities`, { headers: headers(), signal: abort.signal }),
      fetch(`${API_BASE_URL}/api/inventory/medicines`, { headers: headers(), signal: abort.signal }),
    ]).then(async ([capabilities, catalog]) => {
      if (!capabilities.ok || !catalog.ok) throw Error('Unable to load prescribing support. Update the server or retry.');
      const capability = await capabilities.json(); const catalogData = await catalog.json();
      if (abort.signal.aborted) return;
      const ready = capability.contract_versions?.includes(2) && capability.structured_issuance_enabled === true;
      setCapable(ready); setMedicines(catalogData);
      setError(ready ? '' : 'Structured prescribing is not enabled on the server. Existing prescriptions remain available in history.');
    }).catch(problem => { if (!abort.signal.aborted) { setCapable(false); setError(problem.message); } })
      .finally(() => { if (!abort.signal.aborted) setLoading(false); });
    return () => abort.abort();
  }, [active, isArchived]);
  const invalidate = () => { revision.current++; setReview(null); setAck(emptyAcknowledgements()); requestId.current = null; setError(''); };
  const changeItems = (next: MedicationDraft[]) => { if (busy || issued) return; invalidate(); setItems(next); };
  const updateItem = (item: MedicationDraft) => changeItems(items.map(it => it.item_key === item.item_key ? item : it));
  const draft = (): PrescriptionDraft => ({ contract_version: 2, patient_user_id: patientUserId,
    appointment_id: appointmentId, expires_at: expires, notes, items });
  const reviewDraft = async () => {
    if (busy || unresolved || !capable || issued) return;
    if (signatureEnrolled === false) { onSignatureRequired?.(); setError('Enroll your signature before issuing.'); return; }
    if (!appointmentId || !patientUserId) { setError('Choose a patient in the consultation queue.'); return; }
    const invalid = draftError(draft());
    if (invalid) { if (invalid.item != null) setSelected(invalid.item); setError(invalid.message); return; }
    const current = revision.current;
    setBusy(true); setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/api/documents/prescriptions/review`, {
        method: 'POST', headers: headers(), body: JSON.stringify(draft()),
      });
      const result = await response.json();
      if (!mounted.current || current !== revision.current) return;
      if (!response.ok) {
        const first = result.errors?.[0];
        const match = first?.field?.match(/^items\.(\d+)\./);
        if (match) setSelected(Number(match[1]));
        throw Error([result.error, first ? `${first.field}: ${first.message}` : ''].filter(Boolean).join(' '));
      }
      setReview(result); setAck(emptyAcknowledgements());
      requestId.current = crypto.randomUUID();
    } catch (problem) {
      if (mounted.current && current === revision.current) setError(problem instanceof Error ? problem.message : 'Review failed. Retry.');
    } finally { if (mounted.current) setBusy(false); }
  };
  const issue = async () => {
    if (!review || busy || !requestId.current) return;
    const current = revision.current;
    setBusy(true); setError('');
    submitted.current ??= JSON.stringify({ ...draft(), review_token: review.review_token,
      issuance_request_id: requestId.current, acknowledgements: ack });
    setUnresolved(true);
    try {
      // Keep the submitted input and UUID stable across network retries.
      const response = await fetch(`${API_BASE_URL}/api/documents/prescriptions`, {
        method: 'POST', headers: headers(), body: submitted.current,
      });
      const result = await response.json();
      if (!mounted.current || current !== revision.current) return;
      if (!response.ok) {
        if (response.status >= 400 && response.status < 500 && result.code !== 'REQUEST_IN_PROGRESS') {
          submitted.current = null; setUnresolved(false);
        }
        if (result.code === 'SIGNATURE_NOT_ENROLLED') onSignatureRequired?.();
        throw Error(result.error || 'Could not issue. Retry the same request, or refresh the review.');
      }
      submitted.current = null; setUnresolved(false);
      setReview(null); setIssued(result.prescriptionId);
      onPrescriptionIssued?.(result);
    } catch (problem) {
      if (mounted.current && current === revision.current) {
        const message = (problem instanceof Error ? problem.message : 'Issuance failed.') +
          (submitted.current ? ' Retry issuance to resolve its status before editing; the exact submitted request is retained.' : '');
        setError(message); onPrescriptionError?.(message);
      }
    } finally { if (mounted.current) setBusy(false); }
  };
  const move = (delta: number) => {
    const index = selected + delta;
    if (index < 0 || index >= items.length) return;
    const next = [...items]; [next[selected], next[index]] = [next[index], next[selected]];
    changeItems(next); setSelected(index);
  };
  if (isArchived) return <p>Archived prescriptions and their recorded directions are available under Patient records → Prescriptions.</p>;
  return <div className="structured-prescribing" aria-label="Structured prescribing">
    <div className="rx-v2-items" aria-label="Prescription medicines">
      <div className="rx-v2-item-strip" role="tablist" aria-label="Medicines" onKeyDown={event => navigateTabs(event, true)}>
        {items.map((item, index) => <button type="button" role="tab" key={item.item_key}
          id={`rx-item-${item.item_key}`} aria-controls="rx-item-editor" aria-selected={selected === index}
          tabIndex={selected === index ? 0 : -1}
          disabled={busy} onClick={() => { setSelected(index); setQuery(''); }}>
          {index + 1}. {item.generic_name || 'New medicine'} · {item.fulfillment === 'clinic' ? 'Clinic' : 'External'}</button>)}
      </div>
      <button type="button" aria-label="Add medicine" disabled={busy || !!issued || items.length >= 20}
        onClick={() => { changeItems([...items, newMedication()]); setSelected(items.length); setQuery(''); }}>+ Add</button>
      <button type="button" aria-label="Move medicine earlier" disabled={busy || !!issued || selected === 0} onClick={() => move(-1)}>←</button>
      <button type="button" aria-label="Move medicine later" disabled={busy || !!issued || selected === items.length - 1} onClick={() => move(1)}>→</button>
      <button type="button" aria-label="Remove medicine" disabled={busy || !!issued || items.length === 1} onClick={() => {
        changeItems(items.filter((_, index) => index !== selected)); setSelected(Math.max(0, selected - 1));
      }}>Remove</button>
    </div>
    <div id="rx-item-editor" role="tabpanel" aria-labelledby={`rx-item-${items[selected].item_key}`} className="rx-v2-content">
      <MedicationEditor item={items[selected]} medicines={medicines} query={query} setQuery={setQuery}
        update={updateItem} disabled={busy || !!issued} />
      <div className="rx-v2-directions">
        <label htmlFor="rx-instructions">Patient directions — required<textarea id="rx-instructions" maxLength={2000}
          disabled={busy || !!issued} value={items[selected].directions} onChange={event => updateItem({ ...items[selected], directions: event.target.value })} /></label>
        <label htmlFor="rx-notes">Patient advice — printed on prescription<textarea id="rx-notes" maxLength={2000}
          disabled={busy || !!issued} value={notes} onChange={event => { invalidate(); setNotes(event.target.value); }} /></label>
      </div>
    </div>
    <footer className="rx-v2-footer">
      <label htmlFor="rx-validity">Prescription valid until<input id="rx-validity" type="date" value={expires} disabled={busy || !!issued}
        onChange={event => { invalidate(); setExpires(event.target.value); }} /></label>
      {issued ? <button type="button" style={btnGhost} onClick={() => {
        invalidate(); setItems([newMedication()]); setSelected(0); setNotes(''); setIssued(null); setExpires('');
      }}>New prescription</button> : <button type="button" style={btnPrimary} disabled={busy || loading || !capable} onClick={() => void reviewDraft()}>
        {busy ? 'Checking…' : 'Review prescription'}</button>}
      <span className="rx-v2-feedback" role={error ? 'alert' : 'status'}>{error || (issued ? `Prescription #${issued} recorded.` : loading ? 'Loading prescribing support…' : `${items.length}/20 medicines. No automatic dose or quantity calculation.`)}</span>
    </footer>
    {review && <StructuredPrescriptionReview review={review} patient={`${verifiedPatient.first_name} ${verifiedPatient.last_name}`}
      acknowledgements={ack} onAcknowledge={setAck} busy={busy} locked={unresolved} error={error} onClose={() => setReview(null)}
      onRefresh={() => void reviewDraft()} onConfirm={() => void issue()} />}
  </div>;
}
