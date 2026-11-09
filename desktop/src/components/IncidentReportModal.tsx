// desktop/src/components/IncidentReportModal.tsx
//
// Post-resolution incident documentation popup.
//
// When ANY responder (mobile or desktop, clinical or community) closes an
// SOS as resolved, every desktop console shows this popup. The operator
// types the incident narrative and confirms the date & time the incident
// was resolved; the patient's name, ID number and contact number are
// pre-fetched from the server (GET /api/emergency/:alertId/incident-report)
// so they never have to be re-typed.
//
// The popup opens only from a live resolution event, not from historical
// resolved alerts when a console starts. The first console to submit wins —
// UNIQUE(alert_id) on INCIDENT_REPORTS plus the emergency:incident_reported
// event dismiss the popup everywhere else.
import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import { CLIENT_INSTANCE_ID } from '../services/clientInstance';
import { T, btnPrimary, btnGhost } from '../theme';
import Icon from './Icon';

interface PatientPrefill {
  userId: number;
  name: string;
  studentNo: string;
  phone: string;
  roleLabel: string;
  affiliation: string;
}

interface AlertPrefill {
  alertId: number;
  status: string;
  createdAt: string;
  resolvedAt: string | null;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
}

interface ExistingReport {
  reportId: number;
  resolvedAt: string;
  incidentDetails: string;
  treatmentNotes: string | null;
  documentedByName: string;
  createdAt: string;
}

interface PrefillData {
  patient: PatientPrefill;
  alert: AlertPrefill;
  report: ExistingReport | null;
}

/** ISO string → value usable by <input type="datetime-local"> (local time). */
function toLocalInputValue(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function IncidentReportModal() {
  // ── Popup state ────────────────────────────────────────────────────
  const [openAlertId, setOpenAlertId] = useState<number | null>(null);
  const [queue, setQueue] = useState<number[]>([]);

  // ── Form state ─────────────────────────────────────────────────────
  const [data, setData] = useState<PrefillData | null>(null);
  const [loading, setLoading] = useState(false);
  const [resolvedAt, setResolvedAt] = useState('');
  const [incidentDetails, setIncidentDetails] = useState('');
  const [treatmentNotes, setTreatmentNotes] = useState('');
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const openAlertRef = useRef<number | null>(null);
  openAlertRef.current = openAlertId;
  const dismissedSessionRef = useRef(new Set<number>());
  const reportedAlertIdsRef = useRef(new Set<number>());
  const closePopupRef = useRef<(markDismissed: boolean) => void>(() => {});

  /* ── Open the popup for an alert (skips anything already dismissed) ── */
  const openFor = (alertId: number, allowQueued = false) => {
    if (reportedAlertIdsRef.current.has(alertId)) return;
    if (!allowQueued && dismissedSessionRef.current.has(alertId)) return;
    setOpenAlertId((current) => {
      if (current !== null && current !== alertId) {
        // A form is already open — queue this one instead of interrupting.
        setQueue((q) => (q.includes(alertId) ? q : [...q, alertId]));
        return current;
      }
      return alertId;
    });
  };

  /* ── Load the pre-fill payload for the popup ──────────────────────── */
  useEffect(() => {
    if (openAlertId === null) return;
    let cancelled = false;
    setLoading(true);
    setData(null);
    setFeedback(null);
    setIncidentDetails('');
    setTreatmentNotes('');

    const token = localStorage.getItem('valetudo_token');
    fetch(`${API_BASE_URL}/api/emergency/${openAlertId}/incident-report`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (res.status === 403) return { forbidden: true };
        if (!res.ok) throw new Error('Server error');
        return res.json();
      })
      .then((body: any) => {
        if (cancelled) return;
        if (body?.forbidden) {
          // Not an active responder after all — never show the popup.
          setOpenAlertId(null);
          return;
        }
        const prefill: PrefillData = body;
        setData(prefill);
        setResolvedAt(toLocalInputValue(prefill.alert?.resolvedAt));
        if (prefill.report) {
          reportedAlertIdsRef.current.add(openAlertId);
          closePopupRef.current(false);
        } else if ((window as any).electronAPI?.showNotification) {
          // The console window may be in the background — surface the
          // documentation request in the OS tray as well.
          (window as any).electronAPI.showNotification({
            title: 'LeoVital HealthLink — incident documentation required',
            body: `SOS #${openAlertId} (${prefill.patient?.name || 'campus member'}) was resolved. Open the console to file the incident report.`,
          });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setFeedback({ text: 'Could not load the incident details. Check your connection.', isError: true });
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [openAlertId]);

  /* ── Socket wiring ────────────────────────────────────────────────── */
  useEffect(() => {
    const token = localStorage.getItem('valetudo_token');
    if (!token) return;

    const socket: Socket = io(SOCKET_URL, {
      auth: { token, clientInstanceId: CLIENT_INSTANCE_ID },
      transports: ['websocket', 'polling'],
    });

    // The server sends this only to the desktop window that resolved the SOS.
    socket.on(
      'emergency:incident_report_required',
      ({ alertId }: { alertId: number }) => {
        if (alertId) openFor(Number(alertId), true);
      }
    );

    // Another console filed the report first → dismiss everywhere else.
    socket.on(
      'emergency:incident_reported',
      ({ alertId }: { alertId: number }) => {
        const id = Number(alertId);
        reportedAlertIdsRef.current.add(id);
        setQueue((q) => q.filter((a) => a !== id));
        if (openAlertRef.current === id) {
          closePopupRef.current(false);
        }
      }
    );

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Close / advance the queue ────────────────────────────────────── */
  const closePopup = (markDismissed: boolean) => {
    const closing = openAlertId;
    if (markDismissed && closing !== null) {
      dismissedSessionRef.current.add(closing);
    }
    setOpenAlertId(null);
    setData(null);
    setFeedback(null);
    // Surface the next queued undocumented incident, if any.
    setQueue((q) => {
      if (q.length > 0) {
        const [next, ...rest] = q;
        // Defer so the current popup finishes unmounting cleanly.
        setTimeout(() => setOpenAlertId(next), 150);
        return rest;
      }
      return q;
    });
  };
  closePopupRef.current = closePopup;

  /* ── Submit the report ────────────────────────────────────────────── */
  const submitReport = async () => {
    if (!data || openAlertId === null) return;
    const details = incidentDetails.trim();
    if (details.length < 5) {
      setFeedback({ text: 'Describe the incident (at least 5 characters).', isError: true });
      return;
    }
    if (!resolvedAt) {
      setFeedback({ text: 'Confirm the date & time the incident was resolved.', isError: true });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/emergency/${openAlertId}/incident-report`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          incident_details: details,
          treatment_notes: treatmentNotes.trim() || null,
          resolved_at: new Date(resolvedAt).toISOString(),
        }),
      });
      const body = await res.json().catch(() => ({}));

      if (res.status === 201) {
        reportedAlertIdsRef.current.add(openAlertId);
        setFeedback({ text: 'Incident report filed.', isError: false });
        setTimeout(() => {
          if (openAlertRef.current === openAlertId) closePopupRef.current(false);
        }, 1200);
      } else if (res.status === 409) {
        // Another console won the race — outcome is identical for us.
        reportedAlertIdsRef.current.add(openAlertId);
        setFeedback({ text: body.error || 'Already documented by another console.', isError: false });
        setTimeout(() => {
          if (openAlertRef.current === openAlertId) closePopupRef.current(false);
        }, 1600);
      } else {
        setFeedback({ text: body.error || 'Failed to file the incident report.', isError: true });
      }
    } catch (err: any) {
      setFeedback({ text: 'Network error: ' + err.message, isError: true });
    } finally {
      setSubmitting(false);
    }
  };

  /* ── Render ───────────────────────────────────────────────────────── */
  if (openAlertId === null) return null;

  const alreadyDocumented = data?.report != null;
  const a = data?.alert;
  const p = data?.patient;

  return (
    <div className="modal-backdrop">
      <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <h3
            style={{
              margin: 0,
              color: T.primary,
              fontSize: 17,
              fontWeight: 800,
              letterSpacing: -0.3,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <Icon name="assignment" size={20} tone="primary" />
            Incident documentation — SOS #{openAlertId}
          </h3>
          <button
            type="button"
            onClick={() => closePopup(true)}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: T.textSub,
              width: 32,
              height: 32,
              borderRadius: T.radius.sm,
              fontSize: 18,
              lineHeight: 1,
            }}
            title="Skip for now"
          >
            ×
          </button>
        </div>

        <p style={{ margin: '0 0 16px', fontSize: 12.5, color: T.textSub, lineHeight: 1.55 }}>
          An SOS was marked <b style={{ color: T.success }}>resolved</b> by a responder. Complete the
          incident record for the campus infirmary log — patient identity is pre-fetched from the
          server.
        </p>

        {loading ? (
          <div style={{ padding: '32px 0', textAlign: 'center', color: T.textSub, fontSize: 13 }}>
            Loading incident details…
          </div>
        ) : !data ? (
          <div style={{ padding: '24px 0', textAlign: 'center', color: T.textSub, fontSize: 13 }}>
            Incident details unavailable.
          </div>
        ) : (
          <>
            {/* Pre-fetched patient profile (read-only) */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(2, 1fr)',
                gap: 12,
                padding: '14px 18px',
                background: T.sage50,
                border: `1px solid ${T.borderSoft}`,
                borderRadius: T.radius.lg,
                marginBottom: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Patient name
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text }}>{p?.name || '—'}</div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  ID number
                </div>
                <div style={{ fontSize: 14.5, fontWeight: 800, color: T.text, fontFamily: T.mono }}>
                  {p?.studentNo || '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Contact number
                </div>
                <div style={{ fontSize: 14, fontWeight: 700, color: T.text, fontFamily: T.mono }}>
                  {p?.phone || '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Role / course
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {p ? `${p.roleLabel}${p.affiliation ? ` · ${p.affiliation}` : ''}` : '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  SOS triggered at
                </div>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                  {a?.createdAt ? new Date(a.createdAt).toLocaleString() : '—'}
                </div>
              </div>
              <div>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 1.2,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 4,
                  }}
                >
                  Location notes
                </div>
                <div style={{ fontSize: 12, fontWeight: 600, color: T.textSub, lineHeight: 1.45 }}>
                  {a?.notes || '—'}
                </div>
              </div>
            </div>

            {alreadyDocumented ? (
              <div
                style={{
                  padding: '18px 20px',
                  background: T.successSoft,
                  border: `1px solid ${T.successBorder}`,
                  borderRadius: T.radius.md,
                  color: T.success,
                  fontSize: 13.5,
                  fontWeight: 700,
                  textAlign: 'center',
                  marginBottom: 8,
                }}
              >
                <Icon name="check_circle" size={16} /> {feedback?.text || 'This incident is already documented.'}
              </div>
            ) : (
              <>
                {/* Date & time resolved (pre-filled from the server) */}
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="ir-resolved-at">
                    Date &amp; time incident was resolved <span style={{ color: T.textMuted }}>(pre-filled — adjust if needed)</span>
                  </label>
                  <input
                    id="ir-resolved-at"
                    type="datetime-local"
                    className="field-input"
                    value={resolvedAt}
                    onChange={(e) => setResolvedAt(e.target.value)}
                    disabled={submitting}
                  />
                  <p className="field-hint">Defaults to the timestamp stored when the responder marked the SOS resolved.</p>
                </div>

                {/* Incident narrative (typed) */}
                <div style={{ marginBottom: 14 }}>
                  <label className="field-label" htmlFor="ir-details">
                    Incident details <span style={{ color: T.danger }}>*</span>
                  </label>
                  <textarea
                    id="ir-details"
                    className="field-input"
                    rows={4}
                    placeholder="What happened, who was involved, and how the situation was handled…"
                    value={incidentDetails}
                    onChange={(e) => setIncidentDetails(e.target.value)}
                    disabled={submitting}
                    style={{ resize: 'vertical', minHeight: 88 }}
                  />
                </div>

                {/* Treatment notes (typed, optional) */}
                <div style={{ marginBottom: 16 }}>
                  <label className="field-label" htmlFor="ir-treatment">
                    Treatment / actions taken <span style={{ color: T.textMuted }}>(optional)</span>
                  </label>
                  <textarea
                    id="ir-treatment"
                    className="field-input"
                    rows={3}
                    placeholder="First aid given, referrals, hand-off to the infirmary…"
                    value={treatmentNotes}
                    onChange={(e) => setTreatmentNotes(e.target.value)}
                    disabled={submitting}
                    style={{ resize: 'vertical', minHeight: 66 }}
                  />
                </div>

                {feedback && (
                  <div
                    style={{
                      marginBottom: 14,
                      padding: '10px 14px',
                      borderRadius: T.radius.md,
                      fontSize: 12.5,
                      fontWeight: 700,
                      background: feedback.isError ? T.dangerSoft : T.successSoft,
                      border: `1px solid ${feedback.isError ? T.dangerBorder : T.successBorder}`,
                      color: feedback.isError ? T.danger : T.success,
                    }}
                  >
                    {feedback.text}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
                  <button type="button" onClick={() => closePopup(true)} style={btnGhost} disabled={submitting}>
                    Skip for now
                  </button>
                  <button
                    type="button"
                    onClick={submitReport}
                    style={{ ...btnPrimary, padding: '11px 22px' }}
                    disabled={submitting}
                  >
                    <Icon name="task_alt" size={15} /> {submitting ? 'Filing…' : 'File incident report'}
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
