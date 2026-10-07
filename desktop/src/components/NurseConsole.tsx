// desktop/src/components/NurseConsole.tsx
import { useState, useEffect } from 'react';
import QrIntakeScanner from './QrIntakeScanner';
import InventoryManager from './InventoryManager';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import { T } from '../theme';

interface QueueItem {
  queue_id: number;
  ticket_no: string;
  first_name: string;
  last_name: string;
  student_no?: string;
  visit_type: string;
  status: string;
  arrival_time: string;
}

interface ExpectedItem {
  appointment_id: number;
  patient_id: number;
  doctor_user_id: number;
  date_time: string;
  time_slot: string;
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
    const token = localStorage.getItem('valetudo_token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });
    socket.on('queue:updated', () => fetchLiveQueue());
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

  /* ── Open confirm modal + pre-check for an existing ticket ── */
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

  /* ── Fires only after modal confirmation ─────────────────── */
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

      // Race-condition path: another nurse checked them in first
      if (res.status === 409) {
        setExpectedFeedback({ text: '⚠️ ' + data.error, ok: false });
        // Refresh the modal so it shows the "already in queue" state
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

  /* ── Inventory view ──────────────────────────────────────── */
  if (viewMode === 'inventory') {
    return <InventoryManager />;
  }

  /* ── Expected arrivals view ──────────────────────────────── */
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
          {/* Header */}
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

          {/* Feedback banner */}
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

          {/* Body */}
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
                    {/* Time column */}
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
                        Scheduled
                      </div>
                    </div>

                    {/* Patient info */}
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

                    {/* Check-in button — opens confirmation modal with pre-check */}
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

          {/* Walk-in hint */}
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

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CONFIRM CHECK-IN MODAL                                     */}
        {/* ═══════════════════════════════════════════════════════════ */}
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
              {/* ── STATE 1: loading pre-check ─────────────────── */}
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
                  <div style={{ fontSize: 12, color: C.textSub, marginTop: 4 }}>
                    Confirming they aren't already checked in.
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </div>
              ) : confirmTicketCheck.hasTicket ? (
                /* ── STATE 2: already in queue ──────────────── */
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
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
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 17,
                          fontWeight: 800,
                          color: C.text,
                          letterSpacing: '-0.3px',
                        }}
                      >
                        Patient already checked in
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textSub }}>
                        {confirmCheckIn.first_name} {confirmCheckIn.last_name} is already in today's queue.
                      </p>
                    </div>
                  </div>

                  {/* Existing ticket details */}
                  <div
                    style={{
                      padding: '16px 18px',
                      background: C.warningSoft,
                      border: `1px solid ${C.warningBorder}`,
                      borderRadius: 14,
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 14,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: 1,
                            color: C.warning,
                            textTransform: 'uppercase',
                            marginBottom: 4,
                          }}
                        >
                          Queue ticket
                        </div>
                        <div
                          style={{
                            fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                            fontSize: 22,
                            fontWeight: 800,
                            color: C.warning,
                          }}
                        >
                          {confirmTicketCheck.ticket?.ticket_no || '—'}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: 1,
                            color: C.warning,
                            textTransform: 'uppercase',
                            marginBottom: 4,
                          }}
                        >
                          Status
                        </div>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: C.warning,
                            textTransform: 'capitalize',
                          }}
                        >
                          {confirmTicketCheck.ticket?.status?.replace('-', ' ') || '—'}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: 1,
                            color: C.warning,
                            textTransform: 'uppercase',
                            marginBottom: 4,
                          }}
                        >
                          Arrived
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {confirmTicketCheck.ticket?.arrival_time || '—'}
                        </div>
                      </div>
                      <div>
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: 1,
                            color: C.warning,
                            textTransform: 'uppercase',
                            marginBottom: 4,
                          }}
                        >
                          Visit type
                        </div>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text }}>
                          {confirmTicketCheck.ticket?.visit_type || '—'}
                        </div>
                      </div>
                    </div>
                  </div>

                  <p
                    style={{
                      margin: '0 0 18px',
                      fontSize: 12.5,
                      color: C.textSub,
                      lineHeight: 1.5,
                    }}
                  >
                    No duplicate ticket was created. The patient is already waiting or being seen in
                    the triage queue — nothing else to do here.
                  </p>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      justifyContent: 'flex-end',
                      paddingTop: 16,
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
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
                        boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
                      }}
                    >
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                /* ── STATE 3: normal confirm ────────────────── */
                <>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 12,
                      marginBottom: 18,
                    }}
                  >
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
                      <h3
                        style={{
                          margin: 0,
                          fontSize: 17,
                          fontWeight: 800,
                          color: C.text,
                          letterSpacing: '-0.3px',
                        }}
                      >
                        Confirm patient check-in
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: 12.5, color: C.textSub }}>
                        This will assign a queue ticket and add them to today's live triage queue.
                      </p>
                    </div>
                  </div>

                  {/* Patient details card */}
                  <div
                    style={{
                      padding: '14px 16px',
                      background: C.sage50,
                      border: `1px solid ${C.border}`,
                      borderRadius: 14,
                      marginBottom: 18,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 800,
                        color: C.text,
                        marginBottom: 10,
                      }}
                    >
                      {confirmCheckIn.first_name} {confirmCheckIn.last_name}
                    </div>

                    <div
                      style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: 10,
                        fontSize: 12.5,
                        color: C.textSub,
                      }}
                    >
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Student ID</b>
                        <div style={{ fontWeight: 700, color: C.text, marginTop: 2 }}>
                          {confirmCheckIn.student_no}
                        </div>
                      </div>
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Scheduled time</b>
                        <div style={{ fontWeight: 700, color: C.primary, marginTop: 2 }}>
                          {confirmCheckIn.time_slot}
                        </div>
                      </div>
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Purpose</b>
                        <div style={{ fontWeight: 600, color: C.text, marginTop: 2 }}>
                          {confirmCheckIn.appointment_type}
                        </div>
                      </div>
                      <div>
                        <b style={{ color: C.textMuted, fontSize: 10.5, letterSpacing: 0.8, textTransform: 'uppercase' }}>Attending physician</b>
                        <div style={{ fontWeight: 600, color: C.text, marginTop: 2 }}>
                          Dr. {confirmCheckIn.doctor_first_name} {confirmCheckIn.doctor_last_name}
                        </div>
                      </div>
                    </div>

                    {confirmCheckIn.allergies &&
                      confirmCheckIn.allergies !== 'None' &&
                      confirmCheckIn.allergies !== 'None reported' &&
                      confirmCheckIn.allergies !== 'None listed' && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: '8px 12px',
                            background: C.dangerSoft,
                            borderRadius: 10,
                            fontSize: 12,
                            fontWeight: 700,
                            color: C.danger,
                          }}
                        >
                          ⚠️ Known allergy: {confirmCheckIn.allergies}
                        </div>
                      )}
                  </div>

                  <div
                    style={{
                      display: 'flex',
                      gap: 10,
                      justifyContent: 'flex-end',
                      paddingTop: 16,
                      borderTop: `1px solid ${C.border}`,
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => setConfirmCheckIn(null)}
                      disabled={checkingInId !== null}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 999,
                        background: C.sage100,
                        color: C.text,
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: checkingInId !== null ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        opacity: checkingInId !== null ? 0.5 : 1,
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => executeCheckInExpected(confirmCheckIn)}
                      disabled={checkingInId !== null}
                      style={{
                        padding: '11px 22px',
                        borderRadius: 999,
                        background: checkingInId !== null ? C.sage400 : C.primary,
                        color: '#FFFFFF',
                        border: 'none',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: checkingInId !== null ? 'not-allowed' : 'pointer',
                        fontFamily: 'inherit',
                        boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
                        transition: 'background 120ms ease',
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
      {/* Two-column grid */}
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

        {/* Queue card */}
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
                  <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                  <circle cx="9" cy="7" r="4" />
                  <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                  <path d="M16 3.13a4 4 0 0 1 0 7.75" />
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
                  Live triage queue
                </h3>
                <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textSub }}>
                  {waitingCount} waiting today
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={fetchLiveQueue}
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
                      background: isServing ? C.primaryTint : C.sage50,
                      border: `1px solid ${isServing ? C.sage300 : 'transparent'}`,
                      transition: 'background 120ms ease',
                    }}
                  >
                    <div
                      style={{
                        fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                        fontSize: 12.5,
                        fontWeight: 800,
                        color: C.primary,
                        background: C.surface,
                        padding: '5px 10px',
                        borderRadius: 10,
                        border: `1px solid ${C.borderSoft}`,
                        letterSpacing: 0.2,
                      }}
                    >
                      {q.ticket_no}
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div
                        style={{
                          fontSize: 14,
                          fontWeight: 700,
                          color: C.text,
                          marginBottom: 3,
                        }}
                      >
                        {q.first_name} {q.last_name}
                      </div>
                      <div style={{ fontSize: 11.5, color: C.textSub }}>
                        {q.visit_type}
                        {q.student_no && (
                          <>
                            {' · '}
                            <span
                              style={{
                                fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                                color: C.textMuted,
                              }}
                            >
                              {q.student_no}
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Status pill — Waiting / Called */}
                    <span
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: isServing ? '5px 12px' : '4px 11px',
                        borderRadius: 999,
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 0.6,
                        textTransform: 'uppercase',
                        whiteSpace: 'nowrap',
                        background: isServing ? C.primary : C.sage200,
                        color: isServing ? '#FFFFFF' : C.textSub,
                        border: `1px solid ${isServing ? C.primary : C.sage300}`,
                        boxShadow: isServing ? '0 3px 10px rgba(31,74,52,0.22)' : 'none',
                        transition: 'all 160ms ease',
                      }}
                    >
                      <span
                        style={{
                          width: 6,
                          height: 6,
                          borderRadius: '50%',
                          background: isServing ? '#A7F3D0' : C.warning,
                          flexShrink: 0,
                        }}
                      />
                      {isServing ? 'Called' : 'Waiting'}
                    </span>

                    <div
                      style={{
                        fontSize: 11.5,
                        color: C.textMuted,
                        whiteSpace: 'nowrap',
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

      {/* Stat row */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
        }}
      >
        {[
          { label: 'Seen today', value: '27', bg: '#DDEBD8' },
          { label: 'Avg. wait', value: '6 min', bg: '#DDE7EE' },
          { label: 'Low stock lots', value: '1', bg: '#EDE5D6' },
          { label: 'Open SOS alerts', value: '0', bg: '#E6E1EF' },
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
                color: C.textSub,
                letterSpacing: 0.1,
              }}
            >
              {card.label}
            </div>
            <div
              style={{
                fontSize: 28,
                fontWeight: 800,
                color: C.text,
                letterSpacing: '-0.6px',
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