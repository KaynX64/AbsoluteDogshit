import Icon from '../../shared/ui/Icon';
import { qualificationDate, qualificationLabel } from './qualificationApi';

const fieldLabels: Record<string, string> = {
  form: 'Application details', affiliation: 'Campus affiliation', trainingHistory: 'Training history / assessment request',
  reason: 'Reason / notes', assessment: 'Clinic assessment', requestedLevel: 'Requested responder level',
  requested_level: 'Requested responder level', status: 'Application status', result: 'Assessment result',
  identityVerified: 'Identity verified', affiliationVerified: 'Campus affiliation verified', orientationCompleted: 'Campus orientation completed',
  professionalCredentialsVerified: 'Professional credentials verified', competencies: 'Competency checks',
  sceneSafety: 'Scene safety', escalation: 'Emergency escalation', firstAid: 'First aid', basicLifeSupport: 'Basic life support',
  privacy: 'Privacy and responder boundaries', appUse: 'SOS app use', assessor: 'Assessor', assessmentDate: 'Assessment date',
  method: 'Training / assessment method', requiredCredentialExpiry: 'Required credential expiry', notes: 'Assessment notes',
  appointmentId: 'Appointment number', evidenceId: 'Evidence number', expiresAt: 'Appointment expiry', expires_at: 'Appointment expiry',
};
const readable = (key: string) => fieldLabels[key] || key.replace(/([a-z])([A-Z])/g, '$1 $2').replaceAll('_', ' ').replace(/^./, value => value.toUpperCase());
const titles: Record<string, string> = {
  created: 'Application created', save: 'Draft saved', submit: 'Application submitted', accept_nomination: 'Nomination accepted', evidence_added: 'Evidence attached',
  withdraw: 'Application withdrawn', start_review: 'Review started', save_assessment: 'Assessment saved',
  needs_information: 'More information requested', training_required: 'Further training required',
  approve: 'Application approved', reject: 'Application not approved', suspended: 'Appointment suspended', revoked: 'Appointment revoked',
  synthetic_demo_submitted: 'Demo application submitted', synthetic_demo_approved: 'Demo application approved',
};
export const qualificationEventTitle = (action: string) => titles[action.toLowerCase()] || readable(action.toLowerCase());

function Value({ value, name }: { value: unknown; name: string }) {
  if (value == null || value === '') return <>Not recorded</>;
  if (typeof value === 'boolean') return <>{value ? 'Yes' : 'No'}</>;
  if (Array.isArray(value)) return value.length ? <ul>{value.map((item, index) => <li key={index}><Value value={item} name={name} /></li>)}</ul> : <>None recorded</>;
  if (typeof value === 'object') return <QualificationRecordFields data={value as Record<string, unknown>} />;
  if (['assessmentDate', 'requiredCredentialExpiry', 'expiresAt', 'expires_at'].includes(name)) return <>{qualificationDate(String(value))}</>;
  if (['status', 'result', 'requestedLevel', 'requested_level', 'level'].includes(name)) return <>{qualificationLabel(String(value))}</>;
  return <>{String(value)}</>;
}

const isGroup = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);
const longFields = new Set(['trainingHistory', 'notes', 'reason']);

export function QualificationRecordFields({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(([key]) => key !== 'synthetic');
  if (!entries.length) return <span className="qualification-muted">No additional details recorded.</span>;
  const facts = entries.filter(([, value]) => typeof value !== 'boolean' && !isGroup(value));
  const checks = entries.filter(([, value]) => typeof value === 'boolean');
  const groups = entries.filter(([, value]) => isGroup(value));
  return <div className="qualification-record-fields">
    {!!facts.length && <dl className="qualification-event-facts">{facts.map(([key, value]) => <div key={key}
      className={longFields.has(key) || typeof value === 'string' && value.length > 90 ? 'qualification-wide' : undefined}>
      <dt>{readable(key)}</dt><dd>{key === 'result'
        ? <span className="qualification-result" data-result={String(value)}><Value value={value} name={key} /></span>
        : <Value value={value} name={key} />}</dd>
    </div>)}</dl>}
    {!!checks.length && <ul className="qualification-record-checks">{checks.map(([key, value]) => <li key={key} data-checked={String(value)}>
      <Icon name={value ? 'check_circle' : 'radio_button_unchecked'} size={16} />
      <span>{readable(key)}</span><span className="qualification-check-value">{value ? 'Yes' : 'No'}</span>
    </li>)}</ul>}
    {groups.map(([key, value]) => <section className="qualification-record-group" key={key} aria-label={readable(key)}>
      <h4>{readable(key)}</h4><QualificationRecordFields data={value as Record<string, unknown>} />
    </section>)}
  </div>;
}

export default function QualificationEventDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;
  const { reason, synthetic, assessment, ...otherFields } = details;
  const fields = assessment ? { ...otherFields, assessment } : otherFields;
  return <div className="qualification-event-record">
    {reason != null && reason !== '' && <p className="qualification-event-note"><Value value={reason} name="reason" /></p>}
    {!!Object.keys(fields).length && <QualificationRecordFields data={fields} />}
    {(assessment === null || synthetic === true) && <div className="qualification-event-footnote">
      {assessment === null && <span>No clinic assessment recorded.</span>}
      {synthetic === true && <span>Demo record</span>}
    </div>}
  </div>;
}
