// desktop/src/components/NurseConsole.tsx
import { useState, useEffect } from 'react';
import QrIntakeScanner from './QrIntakeScanner';
import InventoryManager from './InventoryManager';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

interface QueueItem {
  queue_id: number;
  ticket_no: string;
  first_name: string;
  last_name: string;
  student_no?: string;
  visit_type: string;
  status: string;
  arrival_time: string;
  is_emergency?: number;
}

interface ExpectedItem {
  appointment_id: number;
  patient_id: number;
  doctor_user_id: number;
  date_time: string;
  time_slot: string;
  date_str: string;
  appointment_type: string;
  status: string;
  notes: string;
  first_name: string;
  last_name: string;
  phone: string;
  student_no: string;
  course: string;
  blood_type: string;
  allergies: string;
  chronic_conditions: string;
  doctor_first_name: string;
  doctor_last_name: string;
  doctor_specialty: string;
}

interface ActiveTicket {
  queue_id: number;
  queue_number: number;
  status: string;
  appointment_id: number | null;
  ticket_no: string;
  arrival_time: string;
  visit_type: string;
  doctor_name: string;
}

export type NurseViewMode = 'triage' | 'expected' | 'inventory';

interface NurseConsoleProps {
  viewMode?: NurseViewMode;
  onViewModeChange?: (m: NurseViewMode) => void;
}

export default function NurseConsole({
  viewMode: controlledView,
}: NurseConsoleProps = {}) {
  const [internalView] = useState<NurseViewMode>('triage');
  const viewMode = controlledView ?? internalView;

  const [, setVerifiedPatient] = useState<any>(null);
  const [, setScannedToken] = useState('');

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [activeSosCount, setActiveSosCount] = useState<number>(0);

  /* ── Expected arrivals state ─────────────────────────────── */
  const [expected, setExpected] = useState<ExpectedItem[]>([]);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [expectedFeedback, setExpectedFeedback] = useState<{ text: string; ok: boolean } | null>(null);

  /* ── Confirm modal state ─────────────────────────────────── */
  const [confirmCheckIn, setConfirmCheckIn] = useState<ExpectedItem | null>(null);
  const [confirmTicketCheck, setConfirmTicketCheck] = useState<{
    loading: boolean;
    hasTicket: boolean;
    ticket: ActiveTicket | null;
  }>({ loading: false, hasTicket: false, ticket: null });

  /* ── Palette ─────────────────────────────────────────────── */
  const C = {
    primary:      '#1F4A34',
    primaryDark:  '#153627',
    primaryTint:  '#E2EBE1',
    surface:      '#FFFFFF',
    sage50:       '#F7F9F6',
    sage100:      '#EEF3EC',
    sage200:      '#E2EBE1',
    sage300:      '#C9D9C7',
    sage400:      '#A3B3A1',
    border:       '#DCE4DA',
    borderSoft:   '#E8EDE6',
    text:         '#191C1A',
    textSub:      '#5A635B',
    textMuted:    '#94A396',
    success:      '#15803D',
    successSoft:  '#DCFCE7',
    successBorder:'#BBF7D0',
    warning:      '#8C6826',
    warningSoft:  '#FEF3C7',
    warningBorder:'#FDE68A',
    danger:       '#7A2E26',
    dangerSoft:   '#FDE8E8',
    dangerBorder: '#F8B4B4',
  };

  /* ── Logic ───────────────────────────────────────────────── */
  const fetchLiveQueue = async () => {
    setLoadingQueue(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/queue/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setQueue(data);
    } catch (err) {
      console.error('Error loading live queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  const fetchActiveSosCount = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/emergency/active`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setActiveSosCount(data.length);
      }
    } catch (_) {}
  };

  const fetchExpected = async () => {
    setLoadingExpected(true);
    setExpectedFeedback(null);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/expected-today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) setExpected(data);
      }
    } catch (err) {
      console.error('Error loading expected arrivals:', err);
    } finally {
      setLoadingExpected(false);
    }
  };

  useEffect(() => {
    fetchLiveQueue();
    fetchActiveSosCount();

    const token = localStorage.getItem('valetudo_token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('queue:updated', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
    });

    socket.on('emergency:new_alert', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
    });

    socket.on('emergency:status_change', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
    });

    socket.on('appointment:booked', (newBooking: any) => {
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: 'New appointment in system',
          body: `${newBooking.patientName || 'Student'} booked for ${newBooking.date_time}.`,
        });
      }
      if (viewMode === 'expected') fetchExpected();
    });

    socket.on('appointment:status_changed', () => {
      if (viewMode === 'expected') fetchExpected();
    });

    return () => {
      socket.disconnect();
    };
  }, [viewMode]);

  useEffect(() => {
    if (viewMode === 'expected') fetchExpected();
  }, [viewMode]);

  const callNextPatient = async () => {
    const nextPatient = queue.find((p) => p.status === 'waiting');
    if (!nextPatient) {
      alert('No more waiting patients in the queue!');
      return;
    }
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/queue/${nextPatient.queue_id}/status`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ status: 'in-consultation' }),
        }
      );
      if (res.ok) fetchLiveQueue();
    } catch (err) {
      alert('Failed to update queue ticket.');
    }
  };

  const openCheckInConfirm = async (item: ExpectedItem) => {
    setConfirmCheckIn(item);
    setConfirmTicketCheck({ loading: true, hasTicket: false, ticket: null });

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patient/${item.patient_id}/active-ticket`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setConfirmTicketCheck({
          loading: false,
          hasTicket: data.hasActiveTicket === true,
          ticket: data.ticket || null,
        });
      } else {
        setConfirmTicketCheck({ loading: false, hasTicket: false, ticket: null });
      }
    } catch (_) {
      setConfirmTicketCheck({ loading: false, hasTicket: false, ticket: null });
    }
  };

  const executeCheckInExpected = async (item: ExpectedItem) => {
    setCheckingInId(item.appointment_id);
    setExpectedFeedback(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${item.appointment_id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({}),
      });

      const data = await res.json();

      if (res.status === 409) {
        setExpectedFeedback({ text: '⚠️ ' + data.error, ok: false });
        await openCheckInConfirm(item);
        fetchLiveQueue();
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to check in patient.');

      setExpectedFeedback({
        text: `✅ ${item.first_name} ${item.last_name} checked in as ${data.queueTicket} at ${data.arrivalTime}.`,
        ok: true,
      });
      setConfirmCheckIn(null);
      fetchExpected();
      fetchLiveQueue();
    } catch (err: any) {
      setExpectedFeedback({ text: '❌ ' + err.message, ok: false });
      setConfirmCheckIn(null);
    } finally {
      setCheckingInId(null);
    }
  };

  if (viewMode === 'inventory') {
    return <InventoryManager />;
  }

  if (viewMode === 'expected') {
    return (
      <div
        style={{
          background: C.sage100,
          borderRadius: 28,
          padding: 22,
          display: 'flex',
          flexDirection: 'column',
          gap: 22,
        }}
      >
        <section
          style={{
            background: C.surface,
            borderRadius: 22,
            padding: 22,
            boxShadow: '0 1px 2px rgba(15,30,23,0.03), 0 4px 16px rgba(15,30,23,0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
              marginBottom: 18,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: C.primaryTint,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke={C.primary}
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ width: 20, height: 20 }}
                >
                  <rect x="3" y="4" width="18" height="18" rx="2" />
                  <path d="M16 2v4M8 2v4M3 10h18" />
                  <path d="M9 15l2 2 4-4" />
                </svg>
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 800,
                    color: C.text,
                    letterSpacing: '-0.2px',
                  }}
                >
                  Expected arrivals
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textSub }}>
                  Today's scheduled patients who haven't checked in yet · {expected.length} pending
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchExpected}
              title="Refresh list"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'transparent',
                border: `1px solid ${C.border}`,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: C.textSub,
                flexShrink: 0,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 16, height: 16 }}
              >
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>

          {expectedFeedback && (
            <div
              style={{
                marginBottom: 16,
                padding: '10px 14px',
                borderRadius: 12,
                fontSize: 12.5,
                fontWeight: 700,
                background: expectedFeedback.ok ? C.successSoft : C.dangerSoft,
                color: expectedFeedback.ok ? C.success : C.danger,
                border: `1px solid ${expectedFeedback.ok ? C.successBorder : C.dangerBorder}`,
              }}
            >
              {expectedFeedback.text}
            </div>
          )}

          {loadingExpected ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: C.textMuted,
                fontSize: 13,
                background: C.sage50,
                borderRadius: 18,
              }}
            >
              Loading expected arrivals…
            </div>
          ) : expected.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                color: C.textMuted,
                fontSize: 13,
                background: C.sage50,
                borderRadius: 18,
                lineHeight: 1.6,
              }}
            >
              No pending scheduled patients for today. All bookings have either checked in or been completed.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {expected.map((item) => {
                const allergyIsWarning =
                  item.allergies &&
                  item.allergies !== 'None' &&
                  item.allergies !== 'None reported' &&
                  item.allergies !== 'None listed';

                return (
                  <div
                    key={item.appointment_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '110px 1fr auto',
                      gap: 16,
                      alignItems: 'center',
                      padding: '16px 18px',
                      borderRadius: 18,
                      background: C.sage50,
                      border: `1px solid ${C.borderSoft}`,
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                          fontSize: 14,
                          fontWeight: 800,
                          color: C.primary,
                          letterSpacing: 0.2,
                        }}
                      >
                        {item.time_slot}
                      </div>
                      <div
                        style={{
                          fontSize: 10.5,
                          color: C.textMuted,
                          fontWeight: 600,
                          marginTop: 3,
                          textTransform: 'uppercase',
                          letterSpacing: 0.6,
                        }}
                      >
                           {item.date_str || 'Scheduled'}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 15,
                          fontWeight: 700,
                          color: C.text,
                          marginBottom: 4,
                        }}
                      >
                        {item.first_name} {item.last_name}
                        <span
                          style={{
                            fontSize: 11.5,
                            fontWeight: 600,
                            color: C.textMuted,
                            marginLeft: 8,
                            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                          }}
                        >
                          {item.student_no}
                        </span>
                      </div>

                      <div
                        style={{
                          fontSize: 12,
                          color: C.textSub,
                          display: 'flex',
                          flexWrap: 'wrap',
                          gap: 14,
                        }}
                      >
                        <span>
                          <b style={{ color: C.textSub }}>For:</b> {item.appointment_type}
                        </span>
                        <span>
                          <b style={{ color: C.textSub }}>Dr.:</b> {item.doctor_first_name} {item.doctor_last_name}
                        </span>
                        {item.blood_type && (
                          <span>
                            <b style={{ color: C.textSub }}>Blood:</b> {item.blood_type}
                          </span>
                        )}
                        {allergyIsWarning && (
                          <span style={{ color: C.danger, fontWeight: 700 }}>
                            ⚠️ {item.allergies}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openCheckInConfirm(item)}
                      disabled={checkingInId === item.appointment_id}
                      style={{
                        padding: '10px 18px',
                        borderRadius: 999,
                        background: checkingInId === item.appointment_id ? C.sage400 : C.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: 12.5,
                        fontWeight: 700,
                        cursor: checkingInId === item.appointment_id ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
                        transition: 'background 120ms ease',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {checkingInId === item.appointment_id ? 'Checking in…' : '✓ Check in'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div
            style={{
              marginTop: 20,
              padding: '12px 16px',
              background: C.primaryTint,
              border: `1px solid ${C.sage300}`,
              borderRadius: 14,
              fontSize: 12.5,
              color: C.primary,
              lineHeight: 1.5,
            }}
          >
            <b>Walk-in?</b> Switch to the <b>Triage</b> tab and scan the student's QR pass — the intake
            scanner will register them as a walk-in automatically.
          </div>
        </section>

        {/* Modal */}
        {confirmCheckIn && (
          <div
            className="modal-backdrop"
            onClick={() => {
              if (checkingInId === null && !confirmTicketCheck.loading) setConfirmCheckIn(null);
            }}
          >
            <div
              className="modal-card"
              style={{ maxWidth: 480 }}
              onClick={(e) => e.stopPropagation()}
            >
              {confirmTicketCheck.loading ? (
                <div style={{ padding: '40px 20px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      margin: '0 auto 14px',
                      border: `3px solid ${C.primaryTint}`,
                      borderTopColor: C.primary,
                      borderRadius: '50%',
                      animation: 'spin 0.8s linear infinite',
                    }}
                  />
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: C.text }}>
                    Checking patient's queue status…
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : confirmTicketCheck.hasTicket ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: C.warningSoft,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                        color: C.warning,
                      }}
                    >
                      ⚠️
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>
                        Patient already checked in
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textSub }}>
                        {confirmCheckIn.first_name} {confirmCheckIn.last_name} is already in today's queue.
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '16px 18px',
                      background: C.warningSoft,
                      border: `1px solid ${C.warningBorder}`,
                      borderRadius: 14,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.warning, textTransform: 'uppercase' }}>
                          Queue ticket
                        </div>
                        <div style={{ fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', fontSize: 22, fontWeight: 800, color: C.warning }}>
                          {confirmTicketCheck.ticket?.ticket_no || '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 10.5, fontWeight: 800, color: C.warning, textTransform: 'uppercase' }}>
                          Status
                        </div>
                        <div style={{ fontSize: 14, fontWeight: 800, color: C.warning, textTransform: 'capitalize' }}>
                          {confirmTicketCheck.ticket?.status?.replace('-', ' ') || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <button
                      type="button"
                      onClick={() => setConfirmCheckIn(null)}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 999,
                        background: C.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                    <div
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 12,
                        background: C.primaryTint,
                        display: 'grid',
                        placeItems: 'center',
                        fontSize: 20,
                        flexShrink: 0,
                      }}
                    >
                      ✓
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: C.text }}>
                        Confirm patient check-in
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textSub }}>
                        This will assign a queue ticket and add them to today's live triage queue.
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '14px 16px',
                      background: C.sage50,
                      border: `1px solid ${C.border}`,
                      borderRadius: 14,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ fontSize: 15, fontWeight: 800, color: C.text, marginBottom: 10 }}>
                      {confirmCheckIn.first_name} {confirmCheckIn.last_name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, fontSize: 12.5, color: C.textSub }}>
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, textTransform: 'uppercase' }}>Student ID</b>
                        <div style={{ fontWeight: 700, color: C.text, marginTop: 2 }}>{confirmCheckIn.student_no}</div>
                      </div>
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, textTransform: 'uppercase' }}>Scheduled time</b>
                        <div style={{ fontWeight: 700, color: C.primary, marginTop: 2 }}>{confirmCheckIn.time_slot}</div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 16, borderTop: `1px solid ${C.border}` }}>
                    <button
                      type="button"
                      onClick={() => setConfirmCheckIn(null)}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 999,
                        background: C.sage100,
                        color: C.text,
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => executeCheckInExpected(confirmCheckIn)}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 999,
                        background: C.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      {checkingInId !== null ? 'Checking in…' : '✓ Confirm check-in'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ── Triage view (default) ───────────────────────────────── */
  const waitingCount = queue.filter((q) => q.status === 'waiting').length;

  return (
    <div
      style={{
        background: C.sage100,
        borderRadius: 28,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 22,
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1.15fr 1fr',
          gap: 20,
        }}
      >
        <QrIntakeScanner
          onPatientVerified={(patient, token) => {
            setVerifiedPatient(patient);
            setScannedToken(token);
            fetchLiveQueue();
          }}
        />

        {/* Live Queue Card with Emergency Prioritization */}
        <section
          style={{
            background: C.surface,
            borderRadius: 22,
            padding: 22,
            display: 'flex',
            flexDirection: 'column',
            gap: 18,
            boxShadow: '0 1px 2px rgba(15,30,23,0.03), 0 4px 16px rgba(15,30,23,0.04)',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 14,
                  background: activeSosCount > 0 ? C.dangerSoft : C.primaryTint,
                  display: 'grid',
                  placeItems: 'center',
                  flexShrink: 0,
                }}
              >
                {activeSosCount > 0 ? (
                  <span style={{ fontSize: 20 }}>🚨</span>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke={C.primary}
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 20, height: 20 }}
                  >
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                )}
              </div>
              <div>
                <h3
                  style={{
                    margin: 0,
                    fontSize: 16,
                    fontWeight: 800,
                    color: C.text,
                    letterSpacing: '-0.2px',
                  }}
                >
                  Live triage queue
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textSub }}>
                  {waitingCount} waiting today {activeSosCount > 0 ? `· 🚨 ${activeSosCount} active SOS` : ''}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                fetchLiveQueue();
                fetchActiveSosCount();
              }}
              title="Refresh queue"
              style={{
                width: 36,
                height: 36,
                borderRadius: 12,
                background: 'transparent',
                border: `1px solid ${C.border}`,
                display: 'grid',
                placeItems: 'center',
                cursor: 'pointer',
                color: C.textSub,
                flexShrink: 0,
              }}
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{ width: 16, height: 16 }}
              >
                <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
                <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
                <path d="M21 3v5h-5" />
                <path d="M3 21v-5h5" />
              </svg>
            </button>
          </div>

          {/* Queue list */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 420,
              overflowY: 'auto',
              paddingRight: 4,
              flex: 1,
            }}
          >
            {loadingQueue ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: C.textMuted,
                  fontSize: 13,
                  background: C.sage50,
                  borderRadius: 18,
                }}
              >
                Updating queue…
              </div>
            ) : queue.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: C.textMuted,
                  fontSize: 13,
                  background: C.sage50,
                  borderRadius: 18,
                  lineHeight: 1.6,
                }}
              >
                No patients currently waiting in the infirmary queue.
              </div>
            ) : (
              queue.map((q) => {
                const isServing = q.status === 'in-consultation';
                const isEmergency = q.is_emergency === 1 || q.ticket_no.includes('SOS') || q.visit_type?.includes('EMERGENCY');

                return (
                  <div
                    key={q.queue_id}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'auto 1fr auto auto',
                      gap: 14,
                      alignItems: 'center',
                      padding: '14px 16px',
                      borderRadius: 18,
                      background: isEmergency
                        ? C.dangerSoft
                        : isServing
                        ? C.primaryTint
                        : C.sage50,
                      border: isEmergency
                        ? `1.5px solid ${C.dangerBorder}`
                        : isServing
                        ? `1px solid ${C.sage300}`
                        : '1px solid transparent',
                      transition: 'all 120ms ease',
                      boxShadow: isEmergency ? '0 2px 8px rgba(220, 38, 38, 0.12)' : 'none',
                    }}
                  >
                    {/* Ticket Badge */}
                    <div
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: isEmergency ? C.danger : C.primary,
                        background: C.surface,
                        padding: '5px 10px',
                        borderRadius: 10,
                        border: isEmergency ? `1.5px solid ${C.dangerBorder}` : `1px solid ${C.borderSoft}`,
                        letterSpacing: 0.2,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                      }}
                    >
                      {q.ticket_no}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: isEmergency ? C.danger : C.text,
                          marginBottom: 3,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                        }}
                      >
                        {q.first_name} {q.last_name}
                        {isEmergency && (
                          <span
                            style={{
                              fontSize: 9.5,
                              fontWeight: 900,
                              background: '#DC2626',
                              color: '#FFFFFF',
                              padding: '1px 6px',
                              borderRadius: 4,
                              letterSpacing: 0.4,
                            }}
                          >
                            TOP PRIORITY
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11.5, color: isEmergency ? C.danger : C.textSub, fontWeight: isEmergency ? 600 : 400 }}>
                        {q.visit_type}
                        {q.student_no && (
                          <>
                            {' · '}
                            <span
                              style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                color: isEmergency ? C.danger : C.textMuted,
                              }}
                            >
                              {q.student_no}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status pill */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: isEmergency ? '5px 12px' : isServing ? '5px 12px' : '4px 11px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        background: isEmergency ? '#DC2626' : isServing ? C.primary : C.sage200,
                        color: '#FFFFFF',
                        border: 'none',
                        boxShadow: isServing || isEmergency ? '0 3px 10px rgba(31,74,52,0.22)' : 'none',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: '#FFFFFF',
                          flexShrink: 0,
                        }}
                      />
                      {isEmergency && !isServing ? 'SOS Alert' : isServing ? 'Called' : 'Waiting'}
                    </span>

                    <div
                      style={{
                        fontSize: 11.5,
                        color: isEmergency ? C.danger : C.textMuted,
                        whiteSpace: 'nowrap',
                        fontWeight: isEmergency ? 700 : 400,
                      }}
                    >
                      {q.arrival_time}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <button
            type="button"
            onClick={callNextPatient}
            style={{
              width: '100%',
              padding: 14,
              borderRadius: 999,
              background: C.primary,
              color: '#FFFFFF',
              border: 'none',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
            }}
          >
            Call next patient
          </button>
        </section>
      </div>

      {/* Stat row with Dynamic Open SOS count */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {[
          { label: 'Seen today', value: '27', bg: '#DDEBD8', color: C.text },
          { label: 'Avg. wait', value: '6 min', bg: '#DDE7EE', color: C.text },
          { label: 'Low stock lots', value: '1', bg: '#EDE5D6', color: C.text },
          {
            label: 'Open SOS alerts',
            value: String(activeSosCount),
            bg: activeSosCount > 0 ? '#FDE8E8' : '#E6E1EF',
            color: activeSosCount > 0 ? '#DC2626' : C.text,
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              padding: '18px 20px',
              borderRadius: 22,
              background: card.bg,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div
              style={{
                fontSize: 11.5,
                fontWeight: 600,
                color: card.color === '#DC2626' ? '#991B1B' : C.textSub,
                letterSpacing: 0.1,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: card.color,
                letterSpacing: -0.6,
                lineHeight: 1,
              }}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}