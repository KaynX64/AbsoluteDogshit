import Dialog from '../../shared/ui/Dialog';
import { NURSE_CSS, ConsoleHeader, SkeletonRows, EmptyState, StatTile, isOverdue, card, mono, iconChip, smallButton, duration } from './nursePresentation';
import type { SosAlert, ExpectedItem, ActiveTicket } from './nurseTypes';
import SosBand from './SosBand';
import ExpectedArrivals from './ExpectedArrivals';
// desktop/src/features/nurse/NurseConsole.tsx
//
// Nurse station — triage board, expected arrivals, inventory hand-off.
//
// 2026 design pass:
//   • The page no longer paints its own sage panel inside .app-content; every
//     panel is a white card with a hairline border and one shared radius.
//   • Metrics are derived from live data only. The old hard-coded
//     "Seen today: 27" / "Avg. wait: 6 min" tiles were removed — a clinical
//     dashboard must never show invented numbers.
//   • Critical-first layout: active SOS renders above everything on every
//     nurse view (including inventory), sorted oldest-unacknowledged first,
//     with a live "time since trigger" counter. Closing an alert is confirmed
//     in-app instead of with window.confirm.
//   • One honest call-to-action: the primary button names the ticket it will
//     call and picks emergency tickets before walk-ins.
//   • Colour comes from ../theme tokens. Only hover / focus-visible /
//     responsive / keyframe state lives in the scoped <style> block below,
//     because inline styles cannot express it.
import { useEffect, useMemo, useState } from 'react';
import QrIntakeScanner from '../appointments/QrIntakeScanner';
import InventoryManager from '../inventory/InventoryManager';
import AnalyticsDashboard from '../analytics/AnalyticsDashboard';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';
import { API_BASE_URL } from '../../config/api';
import { CLIENT_INSTANCE_ID } from '../../platform/realtime/clientInstance';
import { T, rgba, softBadge } from '../../theme';
import Icon from '../../shared/ui/Icon';

interface QueueItem {
  queue_id: number;
  queue_number?: number;
  ticket_no: string;
  first_name: string;
  last_name: string;
  student_no?: string;
  visit_type: string;
  status: string;
  arrival_time: string;
  is_emergency?: number;
}

export type NurseViewMode = 'triage' | 'expected' | 'inventory' | 'analytics';

interface NurseConsoleProps {
  viewMode?: NurseViewMode;
  onViewModeChange?: (m: NurseViewMode) => void;
}

/* ═══════════════════════════════════════════════════════════════════
   FORMATTING HELPERS
   ═══════════════════════════════════════════════════════════════════ */

/** "09:30 AM" → minutes elapsed since that clock time today, else null. */
function minutesSinceClock(clock?: string | null): number | null {
  if (!clock) return null;
  const m = /^\s*(\d{1,2}):(\d{2})\s*([AP])\.?M?\.?\s*$/i.exec(clock);
  if (!m) return null;
  let hours = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === 'P') hours += 12;
  const now = new Date();
  const seen = new Date(now);
  seen.setHours(hours, parseInt(m[2], 10), 0, 0);
  const diff = Math.floor((now.getTime() - seen.getTime()) / 60000);
  return diff >= 0 && diff < 24 * 60 ? diff : null;
}

/** Treats SOS tickets, emergency visits and the flag as the same signal. */
function isEmergencyTicket(q: QueueItem): boolean {
  return (
    q.is_emergency === 1 ||
    (q.ticket_no || '').toUpperCase().includes('SOS') ||
    (q.visit_type || '').toUpperCase().includes('EMERGENCY')
  );
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED STYLE PRIMITIVES
   ═══════════════════════════════════════════════════════════════════ */

// Wrapped in liveObject so these module-level composites re-resolve the
// active theme on every read (they would otherwise freeze the palette
// that was active at module load).
/* ═══════════════════════════════════════════════════════════════════
   NURSE CONSOLE
   ═══════════════════════════════════════════════════════════════════ */

export default function NurseConsole({
  viewMode: controlledView,
  onViewModeChange,
}: NurseConsoleProps = {}) {
  const [internalView] = useState<NurseViewMode>('triage');
  const viewMode = controlledView ?? internalView;

  const [, setVerifiedPatient] = useState<any>(null);
  const [, setScannedToken] = useState('');

  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [lastSync, setLastSync] = useState<Date | null>(null);
  const [activeSosCount, setActiveSosCount] = useState<number>(0);
  const [sosAlerts, setSosAlerts] = useState<SosAlert[]>([]);
  const [sosBusyId, setSosBusyId] = useState<number | null>(null);
  const [sosError, setSosError] = useState('');
  const [sosConfirm, setSosConfirm] = useState<{ alert: SosAlert; status: 'resolved' | 'false_alarm' } | null>(null);
  const [notice, setNotice] = useState<{ text: string; ok: boolean } | null>(null);
  const [noShowCount, setNoShowCount] = useState<number>(0);
  const [invStats, setInvStats] = useState<{
    lowStockCount: number;
    expiringSoonCount: number;
    expiredCount: number;
  }>({ lowStockCount: 0, expiringSoonCount: 0, expiredCount: 0 });
  const [selectedInvTab, setSelectedInvTab] = useState<'catalog' | 'stockin' | 'adjust' | 'alerts' | 'logs' | 'addmed'>('catalog');

  /* ── Expected arrivals state ─────────────────────────────── */
  const [expected, setExpected] = useState<ExpectedItem[]>([]);
  const [loadingExpected, setLoadingExpected] = useState(false);
  const [checkingInId, setCheckingInId] = useState<number | null>(null);
  const [expectedFeedback, setExpectedFeedback] = useState<{ text: string; ok: boolean } | null>(null);
  const [expectedQuery, setExpectedQuery] = useState('');

  /* ── Confirm modal state ─────────────────────────────────── */
  const [confirmCheckIn, setConfirmCheckIn] = useState<ExpectedItem | null>(null);
  const [confirmTicketCheck, setConfirmTicketCheck] = useState<{
    loading: boolean;
    hasTicket: boolean;
    ticket: ActiveTicket | null;
  }>({ loading: false, hasTicket: false, ticket: null });

  /* ── Heartbeat — keeps "waiting 12m" honest without a reload ── */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 30000);
    return () => window.clearInterval(id);
  }, []);

  /* ── Data ────────────────────────────────────────────────── */
  const fetchLiveQueue = async () => {
    setLoadingQueue(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/queue/today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
        setLastSync(new Date());
      }
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
        if (Array.isArray(data)) {
          setSosAlerts(data);
          setActiveSosCount(data.length);
        }
      }
    } catch (_) {}
  };

  const updateSosStatus = async (
    alertId: number,
    status: 'acknowledged' | 'dispatched' | 'resolved' | 'false_alarm'
  ) => {
    if (sosBusyId !== null) return;
    const closing = status === 'resolved' || status === 'false_alarm';
    setSosError('');
    setSosBusyId(alertId);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Instance-Id': CLIENT_INSTANCE_ID,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update the SOS alert.');
      } else if (closing) {
        setSosConfirm(null);
      } else if (status === 'acknowledged') {
        setNotice({ text: 'Alert acknowledged — responders notified.', ok: true });
      } else if (status === 'dispatched') {
        setNotice({ text: 'Marked as dispatched.', ok: true });
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Could not update the SOS alert. Try again.';
      if (closing) setSosError(message);
      else setNotice({ text: message, ok: false });
    } finally {
      setSosBusyId(null);
      fetchActiveSosCount();
    }
  };

  const fetchNoShowCount = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/no-shows-today`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setNoShowCount(Number(data.count) || 0);
      }
    } catch (_) {}
  };

  const fetchInventoryStats = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/dashboard-summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setInvStats({
          lowStockCount: Number(data.lowStockCount) || 0,
          expiringSoonCount: Number(data.expiringSoonCount) || 0,
          expiredCount: Number(data.expiredCount) || 0,
        });
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

  const socket = useDesktopSocket();
  useEffect(() => {
    fetchLiveQueue();
    fetchActiveSosCount();
    fetchNoShowCount();
    fetchInventoryStats();
    // Prime the "Expected today" metric on first paint; the tab only refetched
    // before, so the count read 0 until a nurse happened to open it.
    fetchExpected();

    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      on('queue:updated', () => {
        fetchLiveQueue();
        fetchActiveSosCount();
        fetchNoShowCount();
      });

      on('emergency:new_alert', () => {
        fetchLiveQueue();
        fetchActiveSosCount();
      });

      on('emergency:status_change', () => {
        fetchLiveQueue();
        fetchActiveSosCount();
      });

      on('inventory:updated', () => {
        fetchInventoryStats();
      });

      // The reminder worker flips appointments to 'no_show' every 60s and
      // emits appointment:status_changed. Keep the tile live as that happens.
      on('appointment:status_changed', (evt: { status?: string }) => {
        if (evt?.status === 'no_show') fetchNoShowCount();
        if (viewMode === 'expected') fetchExpected();
      });

      on('appointment:booked', () => {
        if (window.electronAPI?.showNotification) {
          window.electronAPI.showNotification({
            title: 'New appointment in system',
            body: 'Open Expected arrivals to review the booking.',
          });
        }
        fetchExpected();
      });

      on('reconnect', () => {
        fetchLiveQueue();
        fetchActiveSosCount();
        fetchNoShowCount();
        fetchInventoryStats();
        fetchExpected();
      });
    });

    return () => {
      unsubscribe();
    };
  }, [viewMode, socket]);

  useEffect(() => {
    if (viewMode === 'expected') fetchExpected();
  }, [viewMode]);

  /* ── Actions ─────────────────────────────────────────────── */
  const callNextPatient = async () => {
    const nextPatient = nextInLine;
    if (!nextPatient) {
      setNotice({ text: 'No one is waiting in the triage queue.', ok: false });
      return;
    }
    setNotice(null);
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
      if (res.ok) {
        fetchLiveQueue();
      } else {
        setNotice({ text: 'Failed to update the queue ticket.', ok: false });
      }
    } catch (err) {
      setNotice({ text: 'Network error while calling the next patient.', ok: false });
    }
  };

  const openCheckInConfirm = async (item: ExpectedItem) => {
    setExpectedFeedback(null);
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
    if (checkingInId !== null) return;
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
        setExpectedFeedback({ text: '' + data.error, ok: false });
        await openCheckInConfirm(item);
        fetchLiveQueue();
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to check in patient.');

      setExpectedFeedback({
        text: `${item.first_name} ${item.last_name} checked in as ${data.queueTicket} at ${data.arrivalTime}.`,
        ok: true,
      });
      setConfirmCheckIn(null);
      fetchExpected();
      fetchLiveQueue();
    } catch (err: any) {
      setExpectedFeedback({ text: err.message, ok: false });
    } finally {
      setCheckingInId(null);
    }
  };

  /* ── Derived, memoised ───────────────────────────────────── */
  const waiting = useMemo(() => queue.filter((q) => q.status === 'waiting'), [queue]);
  const serving = useMemo(() => queue.filter((q) => q.status === 'in-consultation'), [queue]);

  /** Emergency tickets first, then arrival order (queue_number). */
  const nextInLine = useMemo(() => {
    const ordered = [...waiting].sort((a, b) => {
      const ea = isEmergencyTicket(a) ? 0 : 1;
      const eb = isEmergencyTicket(b) ? 0 : 1;
      if (ea !== eb) return ea - eb;
      return (a.queue_number ?? Number.MAX_SAFE_INTEGER) - (b.queue_number ?? Number.MAX_SAFE_INTEGER);
    });
    return ordered[0] ?? null;
  }, [waiting]);

  const waitStats = useMemo(() => {
    const mins = waiting
      .map((q) => minutesSinceClock(q.arrival_time))
      .filter((n): n is number => n != null);
    const avg = mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null;
    const longest = mins.length ? Math.max(...mins) : null;
    return { avg, longest };
  }, [waiting]);

  const orderedSos = useMemo(() => {
    const rank: Record<string, number> = { triggered: 0, acknowledged: 1, dispatched: 2 };
    return [...sosAlerts].sort(
      (a, b) =>
        (rank[a.status] ?? 3) - (rank[b.status] ?? 3) ||
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  }, [sosAlerts]);

  const unacknowledged = sosAlerts.filter((a) => a.status === 'triggered').length;
  const stockTotal = invStats.lowStockCount + invStats.expiringSoonCount + invStats.expiredCount;

  const overdueCount = expected.filter((e) => isOverdue(e.date_time)).length;
  const filteredExpected = useMemo(() => {
    const q = expectedQuery.trim().toLowerCase();
    if (!q) return expected;
    return expected.filter((it) =>
      `${it.first_name} ${it.last_name} ${it.student_no} ${it.doctor_first_name} ${it.doctor_last_name}`
        .toLowerCase()
        .includes(q)
    );
  }, [expected, expectedQuery]);

  const todayLabel = new Date().toLocaleDateString(undefined, {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
  });

  const sosHasAlerts = sosAlerts.length > 0;

  /* ═══════════════════════════════════════════════════════════
     SOS BAND — one component, reused by triage and expected
     ═══════════════════════════════════════════════════════════ */
  const sosBand = !sosHasAlerts ? null : (
    <SosBand
      sosAlerts={sosAlerts}
      unacknowledged={unacknowledged}
      orderedSos={orderedSos}
      sosBusyId={sosBusyId}
      updateSosStatus={updateSosStatus}
      setSosConfirm={setSosConfirm}
    />
  );

  /* Page-level feedback — shared by every view so an SOS action taken on
     the Expected tab reports back too. */
  const noticeBanner = notice ? (
    <div
      role="status"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '10px 14px',
        borderRadius: T.radius.md,
        fontSize: T.fs.body,
        fontWeight: T.fw.semibold,
        background: notice.ok ? T.successSoft : T.dangerSoft,
        color: notice.ok ? T.success : T.danger,
        border: `1px solid ${notice.ok ? T.successBorder : T.dangerBorder}`,
      }}
    >
      <Icon name={notice.ok ? 'check_circle' : 'error'} size={16} />
      <span style={{ flex: 1 }}>{notice.text}</span>
      <button
        type="button"
        onClick={() => setNotice(null)}
        aria-label="Dismiss message"
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'inherit', display: 'inline-flex' }}
      >
        <Icon name="close" size={16} />
      </button>
    </div>
  ) : null;

  /* Closing an SOS is destructive — confirm in-app, never with window.confirm. */
  const sosConfirmModal = sosConfirm
    ? (
        <Dialog label="Confirm SOS closure" size="compact" urgent busy={sosBusyId !== null} onDismiss={() => { setSosError(''); setSosConfirm(null); }}>
          <div className="modal-card" style={{ maxWidth: 430 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
              <span style={iconChip(T.dangerSoft, T.danger, 40)}>
                <Icon name={sosConfirm.status === 'resolved' ? 'task_alt' : 'report'} size={20} />
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h3 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                  {sosConfirm.status === 'resolved' ? 'Close this SOS as resolved?' : 'Close as a false alarm?'}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: T.fs.body, color: T.textSub, lineHeight: T.lh.normal }}>
                  {sosConfirm.alert.first_name} {sosConfirm.alert.last_name} · alert #{sosConfirm.alert.alert_id}.
                  This notifies responders and asks you to file the incident report.
                </p>
              </div>
            </div>

            <div className="dialog-footer">
              {sosError && <p role="alert" className="dialog-error">{sosError}</p>}
              <button type="button" disabled={sosBusyId !== null} onClick={() => { setSosError(''); setSosConfirm(null); }} data-dialog-initial style={smallButton(false, T.textSub)}>
                Keep open
              </button>
              <button
                type="button"
                disabled={sosBusyId !== null}
                onClick={() => void updateSosStatus(sosConfirm.alert.alert_id, sosConfirm.status)}
                style={{
                  ...smallButton(true, sosConfirm.status === 'resolved' ? T.success : T.danger),
                  padding: '9px 20px',
                  fontSize: T.fs.body,
                }}
              >
                {sosBusyId !== null ? 'Updating…' : sosConfirm.status === 'resolved' ? 'Mark resolved' : 'Confirm false alarm'}
              </button>
            </div>
          </div>
        </Dialog>
      )
    : null;

  /* ═══════════════════════════════════════════════════════════
     INVENTORY — same full-bleed manager, plus a safety strip so an
     incoming SOS is never invisible while stock work is open.
     ═══════════════════════════════════════════════════════════ */
  if (viewMode === 'inventory' || viewMode === 'analytics') {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <style>{NURSE_CSS}</style>
        {sosHasAlerts && (
          <div
            role="alert"
            style={{
              margin: '12px 16px 0',
              padding: '10px 14px',
              borderRadius: T.radius.md,
              background: T.dangerSoft,
              border: `1px solid ${T.dangerBorder}`,
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              flexWrap: 'wrap',
              fontSize: T.fs.body,
              color: T.danger,
              fontWeight: T.fw.semibold,
            }}
          >
            <span className="nc-live-dot is-alert" aria-hidden="true" />
            <Icon name="sos" size={18} fill tone="danger" />
            <span style={{ flex: 1, minWidth: 180 }}>
              {sosAlerts.length} active SOS {sosAlerts.length === 1 ? 'alert' : 'alerts'}
              {unacknowledged > 0 ? ` · ${unacknowledged} unacknowledged` : ''} ·{' '}
              {orderedSos[0] ? `${orderedSos[0].first_name} ${orderedSos[0].last_name}` : ''}
            </span>
            {onViewModeChange && (
              <button
                type="button"
                onClick={() => onViewModeChange('triage')}
                style={smallButton(true, T.danger)}
              >
                Open triage board
              </button>
            )}
          </div>
        )}
        {viewMode === 'analytics' ? <AnalyticsDashboard /> : <InventoryManager initialTab={selectedInvTab} />}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     EXPECTED ARRIVALS
     ═══════════════════════════════════════════════════════════ */
  if (viewMode === 'expected') {
    return (
      <ExpectedArrivals
        todayLabel={todayLabel}
        expected={expected}
        overdueCount={overdueCount}
        loadingExpected={loadingExpected}
        lastSync={lastSync}
        activeSosCount={activeSosCount}
        fetchExpected={fetchExpected}
        sosBand={sosBand}
        noticeBanner={noticeBanner}
        expectedQuery={expectedQuery}
        setExpectedQuery={setExpectedQuery}
        expectedFeedback={expectedFeedback}
        filteredExpected={filteredExpected}
        checkingInId={checkingInId}
        openCheckInConfirm={openCheckInConfirm}
        confirmCheckIn={confirmCheckIn}
        confirmTicketCheck={confirmTicketCheck}
        setConfirmCheckIn={setConfirmCheckIn}
        executeCheckInExpected={executeCheckInExpected}
        sosConfirmModal={sosConfirmModal}
      />
    );
  }

  /* ═══════════════════════════════════════════════════════════
     TRIAGE (default)
     ═══════════════════════════════════════════════════════════ */
  return (
    <div className="nc-root" style={{ display: 'flex', flexDirection: 'column', gap: T.sp[5] }}>
      <style>{NURSE_CSS}</style>

      <ConsoleHeader
        eyebrow={sosHasAlerts ? 'Nurse station · emergency active' : 'Nurse station · live'}
        title="Triage board"
        subtitle={
          <>
            {todayLabel} · <b>{waiting.length}</b> waiting · <b>{serving.length}</b> in consultation
            {waitStats.avg != null && <> · avg wait {duration(waitStats.avg)}</>}
            {waitStats.longest != null && waitStats.longest >= 30 && (
              <> · <b style={{ color: T.warning }}>longest {duration(waitStats.longest)}</b></>
            )}
          </>
        }
        loading={loadingQueue}
        lastSync={lastSync}
        sosCount={activeSosCount}
        onRefresh={() => {
          fetchLiveQueue();
          fetchActiveSosCount();
          fetchNoShowCount();
          fetchInventoryStats();
          fetchExpected();
        }}
      />

      {noticeBanner}

      {sosBand}

      <div data-workspace-view style={{ display: 'flex', flexDirection: 'column', gap: T.sp[5] }}>
      {/* ── Vitals rail ─────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: T.sp[3],
        }}
      >
        <StatTile
          icon="groups"
          label="Waiting now"
          value={waiting.length}
          hint={waitStats.avg != null ? `avg wait ${duration(waitStats.avg)}` : 'queue is clear'}
          tone="primary"
          attention={waiting.length > 0}
        />
        <StatTile
          icon="stethoscope"
          label="In consultation"
          value={serving.length}
          hint={serving.length ? 'rooms in use' : 'no active consult'}
          tone="info"
        />
        <StatTile
          icon="event_available"
          label="Expected today"
          value={expected.length}
          hint={overdueCount > 0 ? `${overdueCount} past their slot` : 'not yet checked in'}
          tone={overdueCount > 0 ? 'warning' : 'neutral'}
          attention={overdueCount > 0}
        />
        <StatTile
          icon="event_busy"
          label="No-shows"
          value={noShowCount}
          hint="past the grace period"
          tone="warning"
          attention={noShowCount > 0}
        />
        <StatTile
          icon="inventory_2"
          label="Stock alerts"
          value={stockTotal}
          hint={`${invStats.lowStockCount} low · ${invStats.expiringSoonCount} expiring · ${invStats.expiredCount} expired`}
          tone="warning"
          attention={stockTotal > 0}
          title="Open inventory alerts & reorder"
          onClick={() => {
            setSelectedInvTab('alerts');
            onViewModeChange?.('inventory');
          }}
        />
        <StatTile
          icon="sos"
          label="Open SOS"
          value={activeSosCount}
          hint={activeSosCount ? 'needs response' : 'all clear'}
          tone="danger"
          attention={activeSosCount > 0}
          title={activeSosCount ? 'Jump to the SOS panel' : undefined}
          onClick={
            activeSosCount
              ? () => document.getElementById('nc-sos')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              : undefined
          }
        />
      </div>

      {/* ── Work surface ────────────────────────────────────── */}
      <div className="nc-main">
        <div className="nc-scanner">
          <QrIntakeScanner
            onPatientVerified={(patient, token) => {
              setVerifiedPatient(patient);
              setScannedToken(token);
              fetchLiveQueue();
            }}
          />
        </div>

        <section
          className="nc-queue"
          aria-label="Live triage queue"
          style={{ ...card, padding: T.sp[5], display: 'flex', flexDirection: 'column', gap: T.sp[4], minWidth: 0 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3], flexWrap: 'wrap' }}>
            <span style={iconChip(T.primaryTint, T.primary, 40)}>
              <Icon name="groups" size={20} />
            </span>
            <div style={{ flex: 1, minWidth: 140 }}>
              <h2 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                Live triage queue
              </h2>
              <p aria-live="polite" style={{ margin: '2px 0 0', fontSize: T.fs.meta, color: T.textSub }}>
                {waiting.length} waiting
                {serving.length > 0 ? ` · ${serving.length} called` : ''}
                {waitStats.longest != null && waitStats.longest >= 20 ? ` · longest ${duration(waitStats.longest)}` : ''}
              </p>
            </div>
            <span style={softBadge(T.primaryTint, T.primary, T.sage300)}>
              <Icon name="bolt" size={12} /> {queue.length} in queue
            </span>
          </div>

          <div
            className="nc-queue-list nc-scroll"
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              maxHeight: 440,
              overflowY: 'auto',
              paddingRight: 4,
              flex: 1,
              minHeight: 160,
            }}
          >
            {loadingQueue && queue.length === 0 ? (
              <SkeletonRows count={4} />
            ) : queue.length === 0 ? (
              <EmptyState
                icon="check_circle"
                title="Queue is clear"
                body="No one is waiting. Scan a health pass to check a patient in, or wait for the next arrival."
              />
            ) : (
              <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {queue.map((q) => {
                  const emergency = isEmergencyTicket(q);
                  const servingNow = q.status === 'in-consultation';
                  const wait = minutesSinceClock(q.arrival_time);
                  const rail = emergency ? T.danger : servingNow ? T.primary : 'transparent';

                  return (
                    <li
                      key={q.queue_id}
                      className="nc-row"
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'auto minmax(0, 1fr) auto',
                        alignItems: 'center',
                        gap: T.sp[3],
                        padding: '13px 16px',
                        borderRadius: T.radius.lg,
                        background: servingNow ? T.primary50 : T.sage50,
                        border: `1px solid ${emergency ? T.dangerBorder : servingNow ? T.sage300 : T.borderSoft}`,
                        borderLeft: `3px solid ${rail}`,
                      }}
                    >
                      <span
                        style={{
                          ...mono,
                          fontSize: T.fs.body,
                          fontWeight: T.fw.extrabold,
                          color: emergency ? T.danger : T.primary,
                          background: T.surface,
                          border: `1px solid ${emergency ? T.dangerBorder : T.border}`,
                          borderRadius: T.radius.sm,
                          padding: '6px 10px',
                          minWidth: 54,
                          textAlign: 'center',
                        }}
                      >
                        {q.ticket_no}
                      </span>

                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <strong
                            style={{
                              fontSize: T.fs.bodyLg,
                              fontWeight: T.fw.bold,
                              color: emergency ? T.danger : T.text,
                            }}
                          >
                            {q.first_name} {q.last_name}
                          </strong>
                          {emergency && (
                            <span
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 3,
                                padding: '2px 7px',
                                borderRadius: T.radius.xs,
                                background: T.danger,
                                color: T.textOnDanger,
                                fontSize: T.fs.caption,
                                fontWeight: T.fw.black,
                                letterSpacing: 0.4,
                                textTransform: 'uppercase',
                              }}
                            >
                              <Icon name="priority_high" size={11} /> Emergency
                            </span>
                          )}
                        </div>

                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            flexWrap: 'wrap',
                            marginTop: 4,
                            fontSize: T.fs.meta,
                            color: T.textSub,
                          }}
                        >
                          <span>{q.visit_type}</span>
                          {q.student_no && (
                            <>
                              <span aria-hidden="true" style={{ color: T.textFaint }}>·</span>
                              <span style={{ ...mono, color: T.textMuted }}>{q.student_no}</span>
                            </>
                          )}
                          <span aria-hidden="true" style={{ color: T.textFaint }}>·</span>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                            <Icon name="schedule" size={12} />
                            {servingNow ? `called (${q.arrival_time})` : `waiting ${duration(wait)}`}
                          </span>
                        </div>
                      </div>

                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                        {servingNow ? (
                          <span style={softBadge(T.primary, T.textOnPrimary)}>In consult</span>
                        ) : emergency ? (
                          <span style={softBadge(T.danger, '#FFFFFF')}>Priority</span>
                        ) : (
                          <span style={softBadge(T.tonalAmberBg, T.tonalAmberFg)}>Waiting</span>
                        )}
                        <span style={{ fontSize: T.fs.caption, color: T.textMuted }}>
                          {q.arrival_time}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: T.sp[4], borderTop: `1px solid ${T.borderSoft}` }}>
            <button
              type="button"
              onClick={callNextPatient}
              disabled={!nextInLine}
              style={{
                width: '100%',
                padding: '13px 18px',
                borderRadius: T.radius.pill,
                border: 'none',
                background: !nextInLine ? T.sage200 : isEmergencyTicket(nextInLine) ? T.danger : T.primary,
                color: !nextInLine
                  ? T.textMuted
                  : isEmergencyTicket(nextInLine)
                  ? T.textOnDanger
                  : T.textOnPrimary,
                fontSize: T.fs.bodyLg,
                fontWeight: T.fw.bold,
                fontFamily: T.font,
                cursor: !nextInLine ? 'not-allowed' : 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: !nextInLine
                  ? 'none'
                  : isEmergencyTicket(nextInLine)
                  ? `0 10px 24px -14px ${rgba(T.danger, 0.6)}`
                  : T.shadow.glowPrimary,
              }}
            >
              <Icon name="campaign" size={18} />
              {nextInLine
                ? `Call ${nextInLine.ticket_no} next${isEmergencyTicket(nextInLine) ? ' · emergency' : ''}`
                : 'No one waiting'}
            </button>
            <p style={{ margin: 0, textAlign: 'center', fontSize: T.fs.caption, color: T.textMuted }}>
              Emergency tickets are always offered first.
            </p>
          </div>
        </section>
      </div>

      </div>

      {/* ── SOS close confirmation ──────────────────────────── */}
      {sosConfirmModal}
    </div>
  );
}
