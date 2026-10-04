// desktop/src/components/NurseConsole.tsx
import { useState, useEffect } from 'react';
import QrIntakeScanner from './QrIntakeScanner';
import InventoryManager from './InventoryManager';
import { io } from 'socket.io-client';

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

export type NurseViewMode = 'triage' | 'inventory';

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
    warning:      '#8C6826',
    warningSoft:  '#FEF3C7',
  };

  /* ── Logic — identical ───────────────────────────────────── */
  const fetchLiveQueue = async () => {
    setLoadingQueue(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/appointments/queue/today', {
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

  useEffect(() => {
    fetchLiveQueue();
    const token = localStorage.getItem('valetudo_token');
    const socket = io('https://localhost:5000', {
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
    });
    return () => {
      socket.disconnect();
    };
  }, []);

  const callNextPatient = async () => {
    const nextPatient = queue.find((p) => p.status === 'waiting');
    if (!nextPatient) {
      alert('No more waiting patients in the queue!');
      return;
    }
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `https://localhost:5000/api/appointments/queue/${nextPatient.queue_id}/status`,
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

  /* ── Inventory view ──────────────────────────────────────── */
  if (viewMode === 'inventory') {
    return <InventoryManager />;
  }

  /* ── Triage view ─────────────────────────────────────────── */
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
                      gridTemplateColumns: 'auto 1fr auto',
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