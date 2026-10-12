// desktop/src/components/SignatureEnrollment.tsx
// "My signature" panel for DOCTOR / DENTIST. Works in the Electron app or a
// browser on the tablet. Same screen is used to enroll AND to renew.
import { useCallback, useEffect, useRef, useState } from 'react';
import SignaturePad from './SignaturePad';
import type { SignaturePadHandle } from './SignaturePad';
import { T, cardStyle, sectionTitle, btnPrimary, btnGhost } from '../theme';
import { API_BASE_URL } from '../config/api';

const authHeader = () => ({ Authorization: `Bearer ${localStorage.getItem('valetudo_token')}` });

export default function SignatureEnrollment({ onClose }: { onClose?: () => void }) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [current, setCurrent] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const s = await fetch(`${API_BASE_URL}/api/signature/me/status`, { headers: authHeader() });
      const st = await s.json();
      setUpdatedAt(st.updated_at || null);
      if (st.enrolled) {
        const r = await fetch(`${API_BASE_URL}/api/signature/me/image`, { headers: authHeader() });
        if (r.ok) setCurrent(URL.createObjectURL(await r.blob()));
      } else {
        setCurrent(null);
        setDrawing(true); // first time: go straight to the pad
      }
    } catch {
      setMsg({ ok: false, text: 'Could not reach the server.' });
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    const blob = await padRef.current?.toPngBlob();
    if (!blob) return setMsg({ ok: false, text: 'Please draw your signature first.' });
    setBusy(true);
    setMsg(null);
    try {
      const r = await fetch(`${API_BASE_URL}/api/signature/me`, {
        method: 'PUT',
        headers: { ...authHeader(), 'Content-Type': 'image/png' },
        body: blob,
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Save failed.');
      setMsg({ ok: true, text: 'Signature saved. New documents will use it.' });
      setDrawing(false);
      setEmpty(true);
      await load();
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ ...cardStyle, padding: 24, maxWidth: 640 }}>
      <p style={sectionTitle}>My signature</p>

      {current && !drawing && (
        <>
          <div style={{ margin: '16px 0', padding: 16, background: T.surfaceMuted, borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
            <img src={current} alt="Current signature" style={{ maxHeight: 90, maxWidth: '100%' }} />
          </div>
          <p style={{ fontSize: 12, color: T.textSub, margin: '0 0 16px' }}>
            {updatedAt ? `Last updated ${new Date(updatedAt).toLocaleString()}. ` : ''}
            Documents you already issued keep the signature they were signed with.
          </p>
          <div style={{ display: 'flex', gap: 10 }}>
            <button style={btnPrimary} onClick={() => { setDrawing(true); setMsg(null); }}>Renew signature</button>
            {onClose && <button style={btnGhost} onClick={onClose}>Close</button>}
          </div>
        </>
      )}

      {drawing && (
        <>
          <p style={{ fontSize: 13, color: T.textSub, margin: '12px 0' }}>
            Sign with your stylus or finger. It is saved as a transparent image and stamped on the prescriptions and clearances you issue.
          </p>
          <SignaturePad ref={padRef} onChange={setEmpty} />
          <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
            <button style={btnGhost} onClick={() => padRef.current?.clear()}>Clear</button>
            {current && <button style={btnGhost} onClick={() => { setDrawing(false); setMsg(null); }}>Cancel</button>}
            <button
              style={{ ...btnPrimary, opacity: empty || busy ? 0.5 : 1 }}
              disabled={empty || busy}
              onClick={save}
            >
              {busy ? 'Saving…' : 'Save signature'}
            </button>
          </div>
        </>
      )}

      {msg && (
        <p style={{ marginTop: 14, fontSize: 12.5, color: msg.ok ? T.success : T.danger }}>{msg.text}</p>
      )}
    </div>
  );
}