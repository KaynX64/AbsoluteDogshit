import { useEffect, useRef, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { T, btnPrimary, calloutDanger, inputStyle } from '../../theme';

type Configuration = { smtpConfigured: boolean; recipients: string[] };
type TestResult = { address: string; accepted: boolean };
type Template = 'confirmation' | 'reminder' | 'cancellation';

async function requestEmailTest<T>(signal: AbortSignal, body?: { template: Template; recipients: string[] }): Promise<T> {
  const response = await fetch(`${API_BASE_URL}/api/admin/server-policy/email-test`, {
    method: body ? 'POST' : 'GET', signal,
    headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Could not reach the email test service.');
  return data;
}

export default function AppointmentEmailTestPanel() {
  const [configuration, setConfiguration] = useState<Configuration | null>(null);
  const [template, setTemplate] = useState<Template>('confirmation');
  const [saved, setSaved] = useState<string[]>([]);
  const [manual, setManual] = useState('');
  const [results, setResults] = useState<TestResult[]>([]);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const sendRequest = useRef<AbortController | null>(null);
  const recipients = [...new Set([...saved, manual.trim().toLowerCase()].filter(Boolean))];

  useEffect(() => {
    const controller = new AbortController();
    void requestEmailTest<Configuration>(controller.signal).then(data => {
      if (!controller.signal.aborted) setConfiguration(data);
    }).catch(failure => {
      if (!controller.signal.aborted) setError(failure.message);
    });
    return () => {
      controller.abort();
      sendRequest.current?.abort();
    };
  }, []);

  async function send() {
    if (sendRequest.current || !configuration?.smtpConfigured || !recipients.length || recipients.length > 5) return;
    const controller = new AbortController();
    sendRequest.current = controller;
    setSending(true);
    setError('');
    setResults([]);
    try {
      const data = await requestEmailTest<{ results: TestResult[] }>(controller.signal, { template, recipients });
      if (!controller.signal.aborted) setResults(data.results);
    } catch (failure) {
      if (!controller.signal.aborted) setError((failure as Error).message);
    } finally {
      sendRequest.current = null;
      if (!controller.signal.aborted) setSending(false);
    }
  }

  return (
    <form aria-labelledby="appointment-email-test-heading" onSubmit={event => { event.preventDefault(); void send(); }}
      style={{ border: `1px solid ${T.border}`, borderRadius: T.radius.md, padding: 16, marginTop: 20 }}>
      <h3 id="appointment-email-test-heading" style={{ marginTop: 0 }}>Send a test email</h3>
      {!configuration && !error && <p role="status">Loading email settings…</p>}
      {configuration && !configuration.smtpConfigured && <p role="alert" style={calloutDanger()}>SMTP is unavailable. Check the server email configuration.</p>}
      {error && <p role="alert" style={calloutDanger()}>{error}</p>}
      {configuration && (
        <fieldset disabled={sending || !configuration.smtpConfigured} style={{ padding: 0, margin: 0, border: 0 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12 }}>
            <label style={{ flex: '1 1 180px' }}>Template
              <select value={template} style={inputStyle} onChange={event => setTemplate(event.target.value as Template)}>
                <option value="confirmation">Confirmation</option>
                <option value="reminder">Reminder</option>
                <option value="cancellation">Cancellation</option>
              </select>
            </label>
            <label style={{ flex: '1 1 220px' }}>Manual email address
              <input type="email" maxLength={254} value={manual} style={inputStyle} onChange={event => setManual(event.target.value)} />
            </label>
          </div>
          {configuration.recipients.length > 0 && (
            <fieldset style={{ border: 0, padding: 0, margin: '12px 0' }}>
              <legend style={{ fontWeight: 600 }}>Saved recipients</legend>
              {configuration.recipients.map(address => (
                <label key={address} style={{ display: 'flex', alignItems: 'center', gap: 8, overflowWrap: 'anywhere' }}>
                  <input type="checkbox" checked={saved.includes(address)} onChange={event => {
                    const checked = event.target.checked;
                    setSaved(current => checked ? [...current, address] : current.filter(recipient => recipient !== address));
                  }} />
                  <span>{address}</span>
                </label>
              ))}
            </fieldset>
          )}
          <p style={{ color: T.textSub }}>Each recipient gets a separate email with sample appointment details. Select up to five.</p>
          <button type="submit" disabled={sending || !recipients.length || recipients.length > 5} style={btnPrimary}>
            {sending ? 'Sending…' : 'Send test email'}
          </button>
        </fieldset>
      )}
      {results.length > 0 && (
        <div role="status" aria-label="Test email results">
          <ul>
            {results.map(({ address, accepted }) => (
              <li key={address} style={{ overflowWrap: 'anywhere' }}><strong>{accepted ? 'Accepted by SMTP' : 'Send failed'}</strong> · {address}</li>
            ))}
          </ul>
        </div>
      )}
    </form>
  );
}
