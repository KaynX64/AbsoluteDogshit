// desktop/src/components/NurseConsole.tsx
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
import type { CSSProperties, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import QrIntakeScanner from './QrIntakeScanner';
import InventoryManager from './InventoryManager';
import { io } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import { CLIENT_INSTANCE_ID } from '../services/clientInstance';
import { T, iconBtn, rgba, softBadge, liveObject } from '../theme';
import Icon from './Icon';

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

interface SosAlert {
  alert_id: number;
  first_name: string;
  last_name: string;
  phone?: string;
  studentNo?: string;
  course?: string;
  roleLabel?: string;
  blood_type?: string;
  allergies?: string;
  notes?: string;
  medicalDetailsRedacted?: boolean;
  latitude?: number | string | null;
  longitude?: number | string | null;
  status: string;
  created_at: string;
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

/** ISO timestamp → minutes elapsed, else null. */
function minutesSinceIso(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.floor((Date.now() - t) / 60000);
  return diff >= 0 ? diff : 0;
}

/** 0 → "just now", 47 → "47m", 92 → "1h 32m". */
function duration(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

function clockOf(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "2026-11-08" → "Today" / "08 Nov" without UTC drift. */
function dayLabel(dateStr?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  if (!m) return 'Today';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** A scheduled slot is "overdue" once it is more than five minutes past. */
function isOverdue(dateTime?: string | null): boolean {
  if (!dateTime) return false;
  const t = new Date(dateTime).getTime();
  return !Number.isNaN(t) && t < Date.now() - 5 * 60000;
}

/** Treats SOS tickets, emergency visits and the flag as the same signal. */
function isEmergencyTicket(q: QueueItem): boolean {
  return (
    q.is_emergency === 1 ||
    (q.ticket_no || '').toUpperCase().includes('SOS') ||
    (q.visit_type || '').toUpperCase().includes('EMERGENCY')
  );
}

function allergyIsReal(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== 'none' && v !== 'none reported' && v !== 'none listed' && v !== 'n/a';
}

/* ═══════════════════════════════════════════════════════════════════
   SHARED STYLE PRIMITIVES
   ═══════════════════════════════════════════════════════════════════ */

// Wrapped in liveObject so these module-level composites re-resolve the
// active theme on every read (they would otherwise freeze the palette
// that was active at module load).
const card: CSSProperties = liveObject(() => ({
  background: T.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.border,
  borderRadius: T.radius.xl,
  boxShadow: T.shadow.card,
}));

const microLabel: CSSProperties = liveObject(() => ({
  margin: 0,
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.wider,
  textTransform: 'uppercase',
  color: T.textMuted,
  lineHeight: T.lh.snug,
}));

const mono: CSSProperties = {
  fontFamily: T.mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0.2,
};

const iconChip = (bg: string, fg: string, size = 36): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: T.radius.md,
  background: bg,
  color: fg,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
});

const smallButton = (filled: boolean, color: string): CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '8px 14px',
  borderRadius: T.radius.pill,
  border: `1px solid ${filled ? color : T.border}`,
  background: filled ? color : T.surface,
  color: filled ? '#FFFFFF' : color,
  fontSize: T.fs.meta,
  fontWeight: T.fw.bold,
  fontFamily: T.font,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
  transition: `background ${T.durBase} ${T.ease}, border-color ${T.durBase} ${T.ease}`,
});

type Tone = 'neutral' | 'primary' | 'info' | 'warning' | 'danger' | 'success';

const TONE: Record<Tone, { bg: string; fg: string; border: string }> = liveObject(() => ({
  neutral: { bg: T.sage100, fg: T.textSub, border: T.border },
  primary: { bg: T.primaryTint, fg: T.primary, border: T.sage300 },
  info: { bg: T.infoSoft, fg: T.info, border: T.infoBorder },
  warning: { bg: T.warningSoft, fg: T.warning, border: T.warningBorder },
  danger: { bg: T.dangerSoft, fg: T.danger, border: T.dangerBorder },
  success: { bg: T.successSoft, fg: T.success, border: T.successBorder },
}));

/* Scoped interaction layer — the only CSS this component ships. */
const NURSE_CSS = `
@keyframes nc-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
@keyframes nc-shimmer { from { background-position: -240px 0; } to { background-position: 320px 0; } }
@keyframes nc-rise { from { opacity: 0; transform: translateY(6px); } to { opacity: 1; transform: none; } }
@keyframes nc-spin { to { transform: rotate(360deg); } }

.nc-root { animation: nc-rise 260ms var(--ease-out) both; }
.nc-live-dot {
  width: 7px; height: 7px; border-radius: 50%; flex: none;
  background: var(--success); box-shadow: 0 0 0 3px rgba(45, 122, 74, .16);
  animation: nc-pulse 2.4s var(--ease) infinite;
}
.nc-live-dot.is-alert {
  background: var(--danger); box-shadow: 0 0 0 3px rgba(180, 62, 50, .18);
  animation-duration: 1s;
}
.nc-spin { animation: nc-spin .9s linear infinite; }
.nc-skel {
  background: linear-gradient(90deg, var(--sage-100) 0%, var(--sage-200) 45%, var(--sage-100) 90%);
  background-size: 320px 100%;
  animation: nc-shimmer 1.15s linear infinite;
  border-radius: var(--r-md);
}
.nc-kpi { transition: transform 140ms var(--ease), box-shadow 140ms var(--ease), border-color 140ms var(--ease); }
.nc-kpi.is-click { cursor: pointer; }
.nc-kpi.is-click:hover { transform: translateY(-2px); border-color: var(--border-strong) !important; box-shadow: var(--shadow-md) !important; }
.nc-kpi.is-click:active { transform: translateY(0); }
.nc-row { transition: background 150ms var(--ease), border-color 150ms var(--ease); }
.nc-row:hover { background: var(--surface-2) !important; }
.nc-scroll { scrollbar-gutter: stable; overscroll-behavior: contain; }
.nc-main { display: flex; flex-direction: column; gap: 18px; }
.nc-queue-list { overscroll-behavior: contain; }
@media (min-width: 1080px) {
  .nc-main { display: grid; grid-template-columns: minmax(330px, .84fr) minmax(430px, 1.16fr); align-items: start; gap: 18px; }
}
@media (max-width: 1079.98px) {
  .nc-main > .nc-queue { order: -1; }
}
@media (prefers-reduced-motion: reduce) {
  .nc-root, .nc-live-dot, .nc-skel, .nc-spin, .nc-kpi { animation: none !important; transition: none !important; }
}
`;

/* ═══════════════════════════════════════════════════════════════════
   LOCAL PRESENTATION COMPONENTS
   ═══════════════════════════════════════════════════════════════════ */

function ConsoleHeader({
  eyebrow,
  title,
  subtitle,
  loading,
  lastSync,
  sosCount,
  onRefresh,
  actions,
}: {
  eyebrow: string;
  title: string;
  subtitle: ReactNode;
  loading: boolean;
  lastSync: Date | null;
  sosCount: number;
  onRefresh: () => void;
  actions?: ReactNode;
}) {
  return (
    <header
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: T.sp[4],
        flexWrap: 'wrap',
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className={`nc-live-dot${sosCount > 0 ? ' is-alert' : ''}`} aria-hidden="true" />
          <p style={{ ...microLabel, color: sosCount > 0 ? T.danger : T.primarySoft, letterSpacing: T.ls.widest }}>
            {eyebrow}
          </p>
        </div>
        <h1
          style={{
            margin: '6px 0 0',
            fontSize: T.fs.h2,
            fontWeight: T.fw.extrabold,
            letterSpacing: T.ls.tight,
            lineHeight: T.lh.tight,
            color: T.text,
          }}
        >
          {title}
        </h1>
        <p style={{ margin: '6px 0 0', fontSize: T.fs.bodyLg, color: T.textSub, lineHeight: T.lh.normal }}>
          {subtitle}
        </p>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3] }}>
        <div style={{ textAlign: 'right' }}>
          <p style={{ ...microLabel, letterSpacing: T.ls.wider }}>Last sync</p>
          <p style={{ margin: '2px 0 0', ...mono, fontSize: T.fs.meta, fontWeight: T.fw.semibold, color: T.textSub }}>
            {lastSync
              ? lastSync.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : '—'}
          </p>
        </div>
        {actions}
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          title="Refresh now"
          aria-label="Refresh now"
          style={{ ...iconBtn, opacity: loading ? 0.6 : 1, cursor: loading ? 'wait' : 'pointer' }}
        >
          <span className={loading ? 'nc-spin' : undefined} style={{ display: 'inline-flex' }}>
            <Icon name="refresh" size={18} />
          </span>
        </button>
      </div>
    </header>
  );
}

function StatTile({
  icon,
  label,
  value,
  hint,
  tone = 'neutral',
  attention = false,
  onClick,
  title,
}: {
  icon: string;
  label: string;
  value: number | string;
  hint: string;
  tone?: Tone;
  attention?: boolean;
  onClick?: () => void;
  title?: string;
}) {
  const t = TONE[tone];
  return (
    <div
      className={`nc-kpi${onClick ? ' is-click' : ''}`}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      title={title}
      style={{
        ...card,
        position: 'relative',
        overflow: 'hidden',
        borderRadius: T.radius.lg,
        padding: '14px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        gap: T.sp[3],
        borderColor: attention ? t.border : T.border,
        boxShadow: T.shadow.xs,
      }}
    >
      {attention && (
        <span
          aria-hidden="true"
          style={{ position: 'absolute', inset: '0 0 auto', height: 3, background: t.fg }}
        />
      )}
      <span style={iconChip(t.bg, t.fg)}>
        <Icon name={icon} size={18} fill={attention} />
      </span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <p style={{ ...microLabel, letterSpacing: T.ls.wide }}>{label}</p>
        <p
          style={{
            margin: '5px 0 0',
            fontSize: 26,
            fontWeight: T.fw.extrabold,
            lineHeight: 1,
            letterSpacing: -0.6,
            fontVariantNumeric: 'tabular-nums',
            color: attention ? t.fg : T.text,
          }}
        >
          {value}
        </p>
        <p
          style={{
            margin: '5px 0 0',
            fontSize: T.fs.meta,
            color: T.textMuted,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {hint}
        </p>
      </div>
    </div>
  );
}

function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="nc-skel" style={{ height: 60 }} />
      ))}
    </div>
  );
}

function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
  return (
    <div
      style={{
        padding: '36px 22px',
        textAlign: 'center',
        background: T.sage50,
        border: `1px dashed ${T.sage300}`,
        borderRadius: T.radius.lg,
      }}
    >
      <span style={{ ...iconChip(T.sage100, T.textMuted, 44), borderRadius: T.radius.lg, margin: '0 auto' }}>
        <Icon name={icon} size={22} />
      </span>
      <p style={{ margin: '12px 0 0', fontSize: T.fs.bodyLg, fontWeight: T.fw.bold, color: T.text }}>{title}</p>
      <p style={{ margin: '4px auto 0', maxWidth: 340, fontSize: T.fs.meta, color: T.textMuted, lineHeight: T.lh.normal }}>
        {body}
      </p>
    </div>
  );
}

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
        setNotice({ text: err.error || 'Failed to update the SOS alert.', ok: false });
      } else if (status === 'acknowledged') {
        setNotice({ text: 'Alert acknowledged — responders notified.', ok: true });
      } else if (status === 'dispatched') {
        setNotice({ text: 'Marked as dispatched.', ok: true });
      }
    } catch (_) {
      setNotice({ text: 'Network error while updating the SOS alert.', ok: false });
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

  useEffect(() => {
    fetchLiveQueue();
    fetchActiveSosCount();
    fetchNoShowCount();
    fetchInventoryStats();
    // Prime the "Expected today" metric on first paint; the tab only refetched
    // before, so the count read 0 until a nurse happened to open it.
    fetchExpected();

    const token = localStorage.getItem('valetudo_token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('queue:updated', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
      fetchNoShowCount();
    });

    socket.on('emergency:new_alert', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
    });

    socket.on('emergency:status_change', () => {
      fetchLiveQueue();
      fetchActiveSosCount();
    });

    socket.on('inventory:updated', () => {
      fetchInventoryStats();
    });

    // The reminder worker flips appointments to 'no_show' every 60s and
    // emits appointment:status_changed. Keep the tile live as that happens.
    socket.on('appointment:status_changed', (evt: { status?: string }) => {
      if (evt?.status === 'no_show') fetchNoShowCount();
    });

    socket.on('appointment:booked', (newBooking: any) => {
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: 'New appointment in system',
          body: `${newBooking.patientName || 'Student'} booked for ${newBooking.date_time}.`,
        });
      }
      fetchExpected();
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
      setExpectedFeedback({ text: '' + err.message, ok: false });
      setConfirmCheckIn(null);
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
    <section
      id="nc-sos"
      aria-live="assertive"
      style={{
        background: T.surface,
        border: `1px solid ${T.dangerBorder}`,
        borderRadius: T.radius.xl,
        boxShadow: `0 18px 42px -34px ${rgba(T.danger, 0.8)}`,
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: T.sp[3],
          padding: '14px 18px',
          background: T.dangerSoft,
          borderBottom: `1px solid ${T.dangerBorder}`,
          flexWrap: 'wrap',
        }}
      >
        <span style={iconChip(T.danger, '#FFFFFF', 38)}>
          <Icon name="sos" size={20} fill />
        </span>
        <div style={{ flex: 1, minWidth: 160 }}>
          <h2
            style={{
              margin: 0,
              fontSize: T.fs.title,
              fontWeight: T.fw.extrabold,
              letterSpacing: T.ls.tight,
              color: T.danger,
            }}
          >
            Active SOS
          </h2>
          <p style={{ margin: '2px 0 0', fontSize: T.fs.meta, color: T.textSub }}>
            {sosAlerts.length} open ·{' '}
            {unacknowledged > 0 ? `${unacknowledged} awaiting acknowledgement` : 'all acknowledged'}
          </p>
        </div>
        <span style={softBadge(unacknowledged > 0 ? T.danger : T.sage100, unacknowledged > 0 ? '#FFFFFF' : T.textSub)}>
          {unacknowledged > 0 ? 'Action needed' : 'Monitoring'}
        </span>
      </div>

      <ul
        className="nc-scroll"
        style={{
          listStyle: 'none',
          margin: 0,
          padding: T.sp[4],
          display: 'flex',
          flexDirection: 'column',
          gap: T.sp[3],
          maxHeight: 380,
          overflowY: 'auto',
        }}
      >
        {orderedSos.map((a) => {
          const busy = sosBusyId === a.alert_id;
          const rail = a.status === 'triggered' ? T.danger : a.status === 'acknowledged' ? T.warning : T.info;
          const elapsed = minutesSinceIso(a.created_at);
          const redacted = a.medicalDetailsRedacted === true;

          return (
            <li
              key={a.alert_id}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderLeft: `3px solid ${rail}`,
                borderRadius: T.radius.lg,
                padding: '14px 16px',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: T.sp[3], flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 180 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <strong style={{ fontSize: T.fs.bodyLg, fontWeight: T.fw.extrabold, color: T.text }}>
                      {a.first_name} {a.last_name}
                    </strong>
                    <span style={{ ...mono, fontSize: T.fs.meta, color: T.textMuted }}>
                      {a.studentNo || a.roleLabel || 'Verified user'}
                      {a.course ? ` · ${a.course}` : ''}
                    </span>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                    {redacted ? (
                      <span style={softBadge(T.infoSoft, T.info, T.infoBorder)}>
                        <Icon name="lock" size={12} /> Medical details restricted
                      </span>
                    ) : (
                      <>
                        <span style={softBadge(T.sage100, T.textSub, T.border)}>
                          <Icon name="bloodtype" size={12} tone="danger" /> {a.blood_type || 'Blood unknown'}
                        </span>
                        <span
                          style={softBadge(
                            allergyIsReal(a.allergies) ? T.dangerSoft : T.sage100,
                            allergyIsReal(a.allergies) ? T.danger : T.textSub,
                            allergyIsReal(a.allergies) ? T.dangerBorder : T.border
                          )}
                        >
                          <Icon name="warning" size={12} /> {allergyIsReal(a.allergies) ? a.allergies : 'No known allergies'}
                        </span>
                      </>
                    )}
                    {a.phone && (
                      <a
                        href={`tel:${a.phone}`}
                        style={{
                          ...softBadge(T.infoSoft, T.info, T.infoBorder),
                          textDecoration: 'none',
                        }}
                      >
                        <Icon name="call" size={12} /> {a.phone}
                      </a>
                    )}
                  </div>

                  {a.notes && (
                    <p
                      style={{
                        margin: '8px 0 0',
                        fontSize: T.fs.meta,
                        color: T.textSub,
                        lineHeight: T.lh.normal,
                        display: 'flex',
                        gap: 6,
                        alignItems: 'flex-start',
                      }}
                    >
                      <Icon name="notes" size={14} style={{ marginTop: 1, color: T.textMuted }} />
                      <span>{a.notes}</span>
                    </p>
                  )}
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <span
                    style={
                      a.status === 'triggered'
                        ? softBadge(T.danger, '#FFFFFF')
                        : a.status === 'acknowledged'
                        ? softBadge(T.warningSoft, T.warning, T.warningBorder)
                        : softBadge(T.infoSoft, T.info, T.infoBorder)
                    }
                  >
                    {a.status === 'triggered' ? 'Unacknowledged' : a.status === 'acknowledged' ? 'Acknowledged' : 'Dispatched'}
                  </span>
                  <span style={{ ...mono, fontSize: T.fs.meta, fontWeight: T.fw.bold, color: rail }}>
                    {duration(elapsed)} ago
                  </span>
                  <span style={{ fontSize: T.fs.caption, color: T.textMuted }}>at {clockOf(a.created_at)}</span>
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  flexWrap: 'wrap',
                  paddingTop: 10,
                  borderTop: `1px dashed ${T.borderSoft}`,
                }}
              >
                {a.status === 'triggered' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => updateSosStatus(a.alert_id, 'acknowledged')}
                    style={{ ...smallButton(true, T.danger), opacity: busy ? 0.6 : 1 }}
                  >
                    <Icon name="pan_tool" size={14} /> Acknowledge
                  </button>
                )}
                {a.status !== 'dispatched' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => updateSosStatus(a.alert_id, 'dispatched')}
                    style={{ ...smallButton(false, T.info), opacity: busy ? 0.6 : 1 }}
                  >
                    <Icon name="local_shipping" size={14} /> Dispatch
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSosConfirm({ alert: a, status: 'resolved' })}
                  style={{ ...smallButton(true, T.success), opacity: busy ? 0.6 : 1 }}
                >
                  <Icon name="check" size={14} /> Resolve
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setSosConfirm({ alert: a, status: 'false_alarm' })}
                  style={{ ...smallButton(false, T.textSub), opacity: busy ? 0.6 : 1 }}
                >
                  False alarm
                </button>
                {a.latitude != null && a.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ ...smallButton(false, T.primary), textDecoration: 'none', marginLeft: 'auto' }}
                  >
                    <Icon name="map" size={14} /> Open map
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
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
    ? createPortal(
        <div className="modal-backdrop" onClick={() => setSosConfirm(null)}>
          <div className="modal-card" style={{ maxWidth: 430 }} onClick={(e) => e.stopPropagation()}>
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

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.borderSoft}` }}>
              <button type="button" onClick={() => setSosConfirm(null)} style={smallButton(false, T.textSub)}>
                Keep open
              </button>
              <button
                type="button"
                onClick={() => {
                  const pending = sosConfirm;
                  setSosConfirm(null);
                  updateSosStatus(pending.alert.alert_id, pending.status);
                }}
                style={{
                  ...smallButton(true, sosConfirm.status === 'resolved' ? T.success : T.danger),
                  padding: '9px 20px',
                  fontSize: T.fs.body,
                }}
              >
                {sosConfirm.status === 'resolved' ? 'Mark resolved' : 'Confirm false alarm'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  /* ═══════════════════════════════════════════════════════════
     INVENTORY — same full-bleed manager, plus a safety strip so an
     incoming SOS is never invisible while stock work is open.
     ═══════════════════════════════════════════════════════════ */
  if (viewMode === 'inventory') {
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
        <InventoryManager initialTab={selectedInvTab} />
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════
     EXPECTED ARRIVALS
     ═══════════════════════════════════════════════════════════ */
  if (viewMode === 'expected') {
    return (
      <div className="nc-root" style={{ display: 'flex', flexDirection: 'column', gap: T.sp[5] }}>
        <style>{NURSE_CSS}</style>

        <ConsoleHeader
          eyebrow="Nurse station"
          title="Expected arrivals"
          subtitle={
            <>
              {todayLabel} · <b>{expected.length}</b> scheduled, not checked in
              {overdueCount > 0 && (
                <>
                  {' '}
                  · <b style={{ color: T.warning }}>{overdueCount}</b> past their slot
                </>
              )}
            </>
          }
          loading={loadingExpected}
          lastSync={lastSync}
          sosCount={activeSosCount}
          onRefresh={fetchExpected}
        />

        {sosBand}

        {noticeBanner}

        <section style={{ ...card, padding: T.sp[5], display: 'flex', flexDirection: 'column', gap: T.sp[4] }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3], flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3], flex: 1, minWidth: 200 }}>
              <span style={iconChip(T.primaryTint, T.primary, 40)}>
                <Icon name="event_available" size={20} />
              </span>
              <div>
                <h2 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                  Today's bookings
                </h2>
                <p style={{ margin: '2px 0 0', fontSize: T.fs.meta, color: T.textSub }}>
                  Sorted by slot · check-in issues a queue ticket
                </p>
              </div>
            </div>

            <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
              <Icon
                name="search"
                size={16}
                style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }}
              />
              <input
                value={expectedQuery}
                onChange={(e) => setExpectedQuery(e.target.value)}
                placeholder="Search name, ID or doctor"
                aria-label="Search expected arrivals"
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '9px 14px 9px 36px',
                  borderRadius: T.radius.pill,
                  border: `1px solid ${T.border}`,
                  background: T.sage50,
                  fontSize: T.fs.meta,
                  fontFamily: T.font,
                  color: T.text,
                  outline: 'none',
                }}
              />
            </div>
          </div>

          {expectedFeedback && (
            <div
              role="status"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '10px 14px',
                borderRadius: T.radius.md,
                fontSize: T.fs.body,
                fontWeight: T.fw.semibold,
                background: expectedFeedback.ok ? T.successSoft : T.dangerSoft,
                color: expectedFeedback.ok ? T.success : T.danger,
                border: `1px solid ${expectedFeedback.ok ? T.successBorder : T.dangerBorder}`,
              }}
            >
              <Icon name={expectedFeedback.ok ? 'check_circle' : 'error'} size={16} />
              {expectedFeedback.text}
            </div>
          )}

          {loadingExpected ? (
            <SkeletonRows count={4} />
          ) : expected.length === 0 ? (
            <EmptyState
              icon="event_available"
              title="Every booking is accounted for"
              body="No scheduled patient is still waiting to check in today. Walk-ins are registered from the Triage tab's scanner."
            />
          ) : filteredExpected.length === 0 ? (
            <EmptyState
              icon="search_off"
              title="No match"
              body={`No booking matches “${expectedQuery.trim()}”. Clear the search to see all ${expected.length}.`}
            />
          ) : (
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {filteredExpected.map((item) => {
                const overdue = isOverdue(item.date_time);
                const allergy = allergyIsReal(item.allergies);
                const busy = checkingInId === item.appointment_id;

                return (
                  <li
                    key={item.appointment_id}
                    className="nc-row"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '76px 1fr auto',
                      gap: T.sp[3],
                      alignItems: 'center',
                      padding: '14px 16px',
                      borderRadius: T.radius.lg,
                      background: T.sage50,
                      border: `1px solid ${overdue ? T.warningBorder : T.borderSoft}`,
                      borderLeft: `3px solid ${overdue ? T.warning : T.sage300}`,
                    }}
                  >
                    <div>
                      <div style={{ ...mono, fontSize: T.fs.bodyLg, fontWeight: T.fw.extrabold, color: overdue ? T.warning : T.primary }}>
                        {item.time_slot}
                      </div>
                      <div style={{ ...microLabel, marginTop: 3, color: overdue ? T.warning : T.textMuted }}>
                        {overdue ? 'Overdue' : dayLabel(item.date_str)}
                      </div>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <strong style={{ fontSize: T.fs.bodyLg, fontWeight: T.fw.bold, color: T.text }}>
                          {item.first_name} {item.last_name}
                        </strong>
                        <span style={{ ...mono, fontSize: T.fs.meta, color: T.textMuted }}>{item.student_no}</span>
                      </div>

                      <div
                        style={{
                          marginTop: 6,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 6,
                          flexWrap: 'wrap',
                          fontSize: T.fs.meta,
                          color: T.textSub,
                        }}
                      >
                        <span style={softBadge(T.sage100, T.textSub, T.border)}>{item.appointment_type}</span>
                        <span style={softBadge(T.sage100, T.textSub, T.border)}>
                          <Icon name="medical_services" size={12} /> Dr. {item.doctor_first_name} {item.doctor_last_name}
                        </span>
                        {item.blood_type && (
                          <span style={softBadge(T.dangerSoft, T.danger, T.dangerBorder)}>
                            <Icon name="bloodtype" size={12} /> {item.blood_type}
                          </span>
                        )}
                        {allergy && (
                          <span style={softBadge(T.dangerSoft, T.danger, T.dangerBorder)}>
                            <Icon name="warning" size={12} /> {item.allergies}
                          </span>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => openCheckInConfirm(item)}
                      disabled={busy}
                      style={{
                        padding: '9px 18px',
                        borderRadius: T.radius.pill,
                        background: busy ? T.sage400 : T.primary,
                        color: busy ? T.textSub : T.textOnPrimary,
                        border: 'none',
                        fontSize: T.fs.body,
                        fontWeight: T.fw.bold,
                        fontFamily: T.font,
                        cursor: busy ? 'not-allowed' : 'pointer',
                        boxShadow: busy ? 'none' : T.shadow.glowPrimary,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {busy ? 'Checking in…' : 'Check in'}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
              padding: '12px 14px',
              borderRadius: T.radius.md,
              background: T.infoSoft,
              border: `1px solid ${T.infoBorder}`,
              color: T.info,
              fontSize: T.fs.meta,
              lineHeight: T.lh.normal,
            }}
          >
            <Icon name="qr_code_scanner" size={16} style={{ marginTop: 1 }} />
            <span>
              <b>Walk-in?</b> Switch to <b>Triage</b> and scan the student's QR pass — the intake scanner
              registers them as a walk-in automatically.
            </span>
          </div>
        </section>

        {/* ── Check-in modal ─────────────────────────────────── */}
        {confirmCheckIn && (
          <div
            className="modal-backdrop"
            onClick={() => {
              if (checkingInId === null && !confirmTicketCheck.loading) setConfirmCheckIn(null);
            }}
          >
            <div className="modal-card" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
              {confirmTicketCheck.loading ? (
                <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      margin: '0 auto 14px',
                      border: `3px solid ${T.primaryTint}`,
                      borderTopColor: T.primary,
                      borderRadius: '50%',
                    }}
                    className="nc-spin"
                  />
                  <p style={{ margin: 0, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.text }}>
                    Checking this patient's queue status…
                  </p>
                </div>
              ) : confirmTicketCheck.hasTicket ? (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                    <span style={iconChip(T.warningSoft, T.warning, 40)}>
                      <Icon name="warning" size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                        Already in today's queue
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: T.fs.body, color: T.textSub }}>
                        {confirmCheckIn.first_name} {confirmCheckIn.last_name} checked in earlier — no new ticket
                        was issued.
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr 1fr',
                      gap: 14,
                      padding: '16px 18px',
                      background: T.warningSoft,
                      border: `1px solid ${T.warningBorder}`,
                      borderRadius: T.radius.md,
                      marginBottom: 18,
                    }}
                  >
                    <div>
                      <div style={{ ...microLabel, color: T.warning }}>Queue ticket</div>
                      <div style={{ ...mono, fontSize: T.fs.h2, fontWeight: T.fw.extrabold, color: T.warning }}>
                        {confirmTicketCheck.ticket?.ticket_no || '—'}
                      </div>
                    </div>
                    <div>
                      <div style={{ ...microLabel, color: T.warning }}>Status</div>
                      <div style={{ marginTop: 4 }}>
                        <span style={softBadge(T.warningSoft, T.warning, T.warningBorder)}>
                          {confirmTicketCheck.ticket?.status?.replace('-', ' ') || '—'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.borderSoft}` }}>
                    <button type="button" onClick={() => setConfirmCheckIn(null)} style={smallButton(true, T.primary)}>
                      Got it
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                    <span style={iconChip(T.primaryTint, T.primary, 40)}>
                      <Icon name="check" size={20} />
                    </span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <h3 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                        Confirm check-in
                      </h3>
                      <p style={{ margin: '4px 0 0', fontSize: T.fs.body, color: T.textSub }}>
                        Issues a queue ticket and adds the patient to today's live triage queue.
                      </p>
                    </div>
                  </div>

                  <div
                    style={{
                      padding: '16px 18px',
                      background: T.sage50,
                      border: `1px solid ${T.border}`,
                      borderRadius: T.radius.md,
                      marginBottom: 18,
                    }}
                  >
                    <div style={{ fontSize: T.fs.subtitle, fontWeight: T.fw.extrabold, color: T.text }}>
                      {confirmCheckIn.first_name} {confirmCheckIn.last_name}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
                      <div>
                        <div style={microLabel}>Student ID</div>
                        <div style={{ ...mono, marginTop: 3, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.text }}>
                          {confirmCheckIn.student_no}
                        </div>
                      </div>
                      <div>
                        <div style={microLabel}>Scheduled</div>
                        <div style={{ ...mono, marginTop: 3, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.primary }}>
                          {confirmCheckIn.time_slot}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.borderSoft}` }}>
                    <button
                      type="button"
                      onClick={() => setConfirmCheckIn(null)}
                      style={smallButton(false, T.textSub)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={() => executeCheckInExpected(confirmCheckIn)}
                      style={{
                        ...smallButton(true, T.primary),
                        padding: '9px 20px',
                        fontSize: T.fs.body,
                        boxShadow: T.shadow.glowPrimary,
                      }}
                    >
                      <Icon name="check" size={15} /> Confirm check-in
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {sosConfirmModal}
      </div>
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

      {/* ── SOS close confirmation ──────────────────────────── */}
      {sosConfirmModal}
    </div>
  );
}
