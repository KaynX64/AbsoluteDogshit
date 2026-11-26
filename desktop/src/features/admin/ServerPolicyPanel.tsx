import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { T, btnGhost, btnPrimary, calloutDanger, calloutInfo, calloutSuccess, inputStyle } from '../../theme';
import AppointmentEmailTestPanel from './AppointmentEmailTestPanel';

type Value = string | number | boolean | number[];
type DraftValue = Value | string[];
type Values = Record<string, Value>;
type Field =
  { key: string; label: string; section: string } & (
    { type: 'integer'; min: number; max: number } |
    { type: 'minute-list'; min: number; max: number; maxItems: number } |
    { type: 'time' | 'boolean' }
  );
type Policy = { version: number; values: Values; defaults: Values; overrides: Values; fields: Field[] };
type Update = { version: number; overrides: Values };
type Preview = { outsideSchedule: number; earlierNoShows: number; update: Update };

const endpoint = `${API_BASE_URL}/api/admin/server-policy`;
const reminderKey = 'appointmentReminderLeadMinutes';
const sameValue = (left: Value, right: Value) => Array.isArray(left)
  ? Array.isArray(right) && left.length === right.length && left.every((minutes, index) => minutes === right[index])
  : left === right;

function formatMinutes(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const remaining = minutes % 60;
  return [hours && `${hours} ${hours === 1 ? 'hour' : 'hours'}`, remaining && `${remaining} ${remaining === 1 ? 'minute' : 'minutes'}`]
    .filter(Boolean).join(' ');
}

const labelFor = (value: Value) => Array.isArray(value) ? value.map(formatMinutes).join(', ')
  : typeof value === 'boolean' ? (value ? 'Enabled' : 'Disabled') : value;

async function request(path: string, method: string, signal: AbortSignal, update?: Update) {
  const res = await fetch(endpoint + path, {
    method, signal,
    headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}`, 'Content-Type': 'application/json' },
    body: update ? JSON.stringify(update) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Could not load or update the server policy.'), {
    fields: data.fields as Record<string, string> | undefined,
    status: res.status,
  });
  return data;
}

export default function ServerPolicyPanel() {
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(true);
  const [message, setMessage] = useState('');
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);
  const [stale, setStale] = useState(false);
  const activeRequest = useRef<AbortController | null>(null);

  const load = () => void runRequest('GET');
  useEffect(() => {
    load();
    return () => {
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, []);

  async function runRequest(method: 'GET' | 'POST' | 'PUT', update?: Update) {
    if (activeRequest.current) return;
    const controller = new AbortController();
    activeRequest.current = controller;
    setBusy(true);
    setMessage('');
    setSaved(false);
    setFieldErrors({});
    setPreview(null);
    try {
      const data = await request(method === 'POST' ? '/preview' : '', method, controller.signal, update);
      if (controller.signal.aborted) return;
      if (method === 'POST' && update) setPreview({ outsideSchedule: data.outsideSchedule, earlierNoShows: data.earlierNoShows, update });
      else {
        setPolicy(data);
        setDraft(data.values);
        setStale(false);
        if (method === 'PUT') setSaved(true);
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      const failure = error as Error & { fields?: Record<string, string>; status?: number };
      setMessage(failure.message);
      setFieldErrors(failure.fields ?? {});
      if (failure.status === 409 || failure.status === 403) setStale(true);
      if (failure.status === 403) setPolicy(null);
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null;
        setBusy(false);
      }
    }
  }

  const edit = (key: string, value: DraftValue) => {
    setDraft((current) => ({ ...current, [key]: value }));
    setPreview(null);
    setSaved(false);
    setFieldErrors({});
    if (!stale) setMessage('');
  };

  const review = () => {
    if (!policy || busy || stale) return;
    const overrides: Values = {};
    const errors: Record<string, string> = {};
    for (const field of policy.fields) {
      const { key, type } = field;
      const raw = draft[key];
      if (type === 'minute-list') {
        const entries = Array.isArray(raw) ? raw : [];
        const minutes = entries.map(entry => /^\d+$/.test(String(entry)) ? Number(entry) : NaN).sort((a, b) => b - a);
        if (minutes.length < 1 || minutes.length > field.maxItems || new Set(minutes).size !== minutes.length ||
            minutes.some(value => !Number.isSafeInteger(value) || value < field.min || value > field.max)) {
          errors[key] = `Enter one to ${field.maxItems} distinct whole-minute values from ${field.min} to ${field.max.toLocaleString()}.`;
        } else if (!sameValue(minutes, policy.defaults[key])) overrides[key] = minutes;
        continue;
      }
      if (Array.isArray(raw)) continue;
      const value = type === 'integer' ? (/^\d+$/.test(String(raw)) ? Number(raw) : NaN) : raw;
      if (sameValue(value, policy.defaults[key])) continue;
      if (type === 'integer' && (!Number.isSafeInteger(value) || Number(value) < field.min || Number(value) > field.max)) {
        errors[key] = `Enter a whole number from ${field.min} to ${field.max}.`;
      } else overrides[key] = value;
    }
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      setMessage('Correct the highlighted settings.');
    } else void runRequest('POST', { version: policy.version, overrides });
  };

  if (!policy) return (
    <div>
      {busy && <p role="status">Loading server policy…</p>}
      {message && <p role="alert" style={calloutDanger()}>{message}</p>}
      {!busy && <button type="button" onClick={load} style={btnGhost}>Reload policy</button>}
    </div>
  );

  const reminderField = policy.fields.find(field => field.key === reminderKey && field.type === 'minute-list');
  const reminderValues = draft[reminderKey];
  return (<>
    <form onSubmit={(event) => { event.preventDefault(); review(); }} noValidate>
      <p style={calloutInfo()}>
        Effective version {policy.version}. Saved overrides take effect on the server immediately. Existing rate-limit windows keep their expiry.
      </p>
      {saved && <p role="status" style={calloutSuccess()}>Server policy saved and active.</p>}
      {message && <p role="alert" style={calloutDanger()}>{message}</p>}
      {(['Limits', 'Appointment rules'] as const).map((section) => (
        <fieldset key={section} disabled={busy || stale} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: '0 0 16px', padding: 16 }}>
          <legend style={{ fontWeight: 700, color: T.text }}>{section}</legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
            {policy.fields.filter((field) => field.section === section).map((field, index) => {
              const id = `server-policy-${section === 'Limits' ? 'limit' : 'schedule'}-${index}`;
              return (
                <div key={field.key}>
                  <label htmlFor={id} style={{ display: 'block', fontWeight: 600, color: T.text }}>{field.label}</label>
                  {field.type === 'boolean' ? (
                    <select id={id} style={inputStyle} value={String(draft[field.key])} onChange={(event) => edit(field.key, event.target.value === 'true')}>
                      <option value="true">Enabled</option><option value="false">Disabled</option>
                    </select>
                  ) : (
                    <input id={id} type={field.type === 'time' ? 'time' : 'text'} inputMode={field.type === 'integer' ? 'numeric' : undefined}
                      style={inputStyle} value={String(draft[field.key])} aria-invalid={Boolean(fieldErrors[field.key])}
                      aria-describedby={`${id}-help`} onChange={(event) => edit(field.key, event.target.value)} />
                  )}
                  <small id={`${id}-help`} style={{ color: fieldErrors[field.key] ? T.danger : T.textSub }}>
                    {fieldErrors[field.key] || `Effective ${labelFor(policy.values[field.key])} · Baseline ${labelFor(policy.defaults[field.key])}`}
                  </small>
                </div>
              );
            })}
          </div>
          {section === 'Appointment rules' && <p style={{ color: T.textSub }}>Capacity is measured in 60-minute blocks. Existing appointments count toward new capacity.</p>}
        </fieldset>
      ))}
      {reminderField?.type === 'minute-list' && Array.isArray(reminderValues) && (
        <fieldset disabled={busy || stale} style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, margin: '0 0 16px', padding: 16 }}>
          <legend style={{ fontWeight: 700, color: T.text }}>Appointment reminders</legend>
          <p style={{ marginTop: 0 }}>{reminderField.label} (minutes)</p>
          {reminderValues.map((entry, index) => (
            <div key={index} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <label htmlFor={`appointment-reminder-${index}`}>Reminder {index + 1}</label>
              <input id={`appointment-reminder-${index}`} type="text" inputMode="numeric" value={entry}
                style={{ ...inputStyle, width: 105 }} aria-invalid={Boolean(fieldErrors[reminderKey])}
                aria-describedby="appointment-reminder-help" onChange={event => edit(reminderKey,
                  reminderValues.map((value, position) => position === index ? event.target.value : String(value)))} />
              {/^[1-9]\d{0,4}$/.test(String(entry)) && <small>{formatMinutes(Number(entry))} before</small>}
              <button type="button" style={btnGhost} disabled={reminderValues.length === 1}
                aria-label={`Remove reminder ${index + 1}`}
                onClick={() => edit(reminderKey, reminderValues.filter((_, position) => position !== index).map(String))}>Remove</button>
            </div>
          ))}
          <button type="button" style={btnGhost} disabled={reminderValues.length >= reminderField.maxItems}
            onClick={() => edit(reminderKey, [...reminderValues.map(String), ''])}>Add reminder</button>
          <small id="appointment-reminder-help" style={{ display: 'block', marginTop: 8, color: fieldErrors[reminderKey] ? T.danger : T.textSub }}>
            {fieldErrors[reminderKey] || `Effective ${labelFor(policy.values[reminderKey])} · Baseline ${labelFor(policy.defaults[reminderKey])}. The server checks every 15 minutes.`}
          </small>
        </fieldset>
      )}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <button type="submit" style={btnPrimary} disabled={busy || stale}>Preview changes</button>
        <button type="button" style={btnGhost} disabled={busy || stale} onClick={() => { setDraft(policy.defaults); setPreview(null); setSaved(false); setMessage(''); setFieldErrors({}); }}>Use baseline values</button>
        <button type="button" style={btnGhost} disabled={busy} onClick={load}>Reload policy</button>
      </div>
      {preview && (
        <section style={calloutInfo()} aria-label="Policy change preview">
          <h3>Review policy changes</h3>
          <ul>
            {policy.fields.filter(({ key }) => !sameValue(preview.update.overrides[key] ?? policy.defaults[key], policy.values[key]))
              .map(({ key, label }) => <li key={key}>{label}: {labelFor(policy.values[key])} → {labelFor(preview.update.overrides[key] ?? policy.defaults[key])}</li>)}
          </ul>
          <p>{preview.outsideSchedule} future appointments are outside the proposed schedule and will keep their bookings.</p>
          <p>{preview.earlierNoShows} scheduled appointments may become eligible for earlier no-show processing.</p>
          {reminderField && !sameValue(preview.update.overrides[reminderKey] ?? policy.defaults[reminderKey], policy.values[reminderKey]) &&
            <p>New reminder times apply to upcoming appointments and can make a reminder due on the next check.</p>}
          <button type="button" style={btnPrimary} onClick={() => void runRequest('PUT', preview.update)}>Apply server policy</button>
        </section>
      )}
    </form>
    <AppointmentEmailTestPanel />
  </>);
}
