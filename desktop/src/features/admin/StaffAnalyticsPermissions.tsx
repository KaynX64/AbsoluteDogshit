import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { T, btnGhost, btnPrimary } from '../../theme';
import { authHeaders, type AnalyticsScope } from '../analytics/data';

type Settings = {
  permissions: { code: AnalyticsScope; label: string; description: string }[];
  defaults: AnalyticsScope[];
  override: AnalyticsScope[] | null;
};

export default function StaffAnalyticsPermissions({ userId }: { userId: number }) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [draft, setDraft] = useState<AnalyticsScope[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ message: string; error?: boolean } | null>(null);
  const endpoint = `${API_BASE_URL}/api/admin/users/${userId}/analytics-permissions`;

  useEffect(() => {
    const request = new AbortController();
    setLoading(true);
    fetch(endpoint, { headers: authHeaders(), signal: request.signal })
      .then(async response => {
        if (!response.ok) throw new Error('Could not load analytics permissions. Close and reopen the account to retry.');
        const result: Settings = await response.json();
        if (request.signal.aborted) return;
        setSettings(result);
        setDraft(result.override);
      })
      .catch(error => {
        if (!request.signal.aborted) setFeedback({ message: error.message, error: true });
      })
      .finally(() => { if (!request.signal.aborted) setLoading(false); });
    return () => request.abort();
  }, [endpoint]);

  async function save() {
    setSaving(true);
    setFeedback(null);
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes: draft }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Could not save analytics permissions.');
      setSettings(result);
      setDraft(result.override);
      setFeedback({ message: 'Analytics permissions saved.' });
    } catch (error) {
      setFeedback({ message: error instanceof Error ? error.message : 'Could not save analytics permissions.', error: true });
    } finally {
      setSaving(false);
    }
  }

  const selected = draft ?? settings?.defaults ?? [];
  const dirty = JSON.stringify(draft?.slice().sort() ?? null) !== JSON.stringify(settings?.override?.slice().sort() ?? null);
  return <fieldset style={{ border: `1px solid ${T.border}`, borderRadius: 12, padding: 14, margin: '0 0 20px', minWidth: 0 }}>
    <legend style={{ fontWeight: 700 }}>Analytics permissions</legend>
    {loading && <p role="status">Loading analytics permissions…</p>}
    {settings && <>
      <label style={{ display: 'block', fontWeight: 700, marginBottom: 10 }}>
        <input type="checkbox" checked={draft === null} disabled={saving}
          onChange={event => setDraft(event.target.checked ? null : [...settings.defaults])} /> Use role defaults
      </label>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 205px), 1fr))', gap: 10 }}>
        {settings.permissions.map(({ code, label, description }) => <label key={code} style={{ display: 'flex', alignItems: 'start', gap: 8 }}>
          <input type="checkbox" checked={selected.includes(code)} disabled={draft === null || saving} onChange={event => {
            setDraft(event.target.checked ? [...selected, code] : selected.filter(item => item !== code));
          }} />
          <span><strong>{label}</strong><br /><small style={{ color: T.textSub }}>{description}</small></span>
        </label>)}
      </div>
      {draft !== null && !draft.some(code => code !== 'ANALYTICS_EXPORT') &&
        <p style={{ color: T.textSub }}>With no sections selected, this account cannot open or export analytics.</p>}
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button type="button" style={btnPrimary} disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save analytics permissions'}
        </button>
        {dirty && <button type="button" style={btnGhost} disabled={saving} onClick={() => setDraft(settings.override)}>Discard analytics changes</button>}
      </div>
    </>}
    {feedback && <p role={feedback.error ? 'alert' : 'status'}>{feedback.message}</p>}
  </fieldset>;
}
