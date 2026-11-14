import type { CSSProperties, ReactNode } from 'react';
import { T, iconBtn, liveObject } from '../../theme';
import Icon from '../../shared/ui/Icon';

/** ISO timestamp → minutes elapsed, else null. */
export function minutesSinceIso(iso?: string | null): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  const diff = Math.floor((Date.now() - t) / 60000);
  return diff >= 0 ? diff : 0;
}

/** 0 → "just now", 47 → "47m", 92 → "1h 32m". */
export function duration(mins: number | null): string {
  if (mins == null) return '—';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const h = Math.floor(mins / 60);
  const rest = mins % 60;
  return rest ? `${h}h ${rest}m` : `${h}h`;
}

export function clockOf(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/** "2026-11-08" → "Today" / "08 Nov" without UTC drift. */
export function dayLabel(dateStr?: string | null): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((dateStr || '').trim());
  if (!m) return 'Today';
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (d.toDateString() === new Date().toDateString()) return 'Today';
  return d.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
}

/** A scheduled slot is "overdue" once it is more than five minutes past. */
export function isOverdue(dateTime?: string | null): boolean {
  if (!dateTime) return false;
  const t = new Date(dateTime).getTime();
  return !Number.isNaN(t) && t < Date.now() - 5 * 60000;
}

export function allergyIsReal(value?: string | null): boolean {
  if (!value) return false;
  const v = value.trim().toLowerCase();
  return v !== '' && v !== 'none' && v !== 'none reported' && v !== 'none listed' && v !== 'n/a';
}

export const card: CSSProperties = liveObject(() => ({
  background: T.surface,
  borderWidth: 1,
  borderStyle: 'solid',
  borderColor: T.border,
  borderRadius: T.radius.xl,
  boxShadow: T.shadow.card,
}));

export const microLabel: CSSProperties = liveObject(() => ({
  margin: 0,
  fontSize: T.fs.caption,
  fontWeight: T.fw.bold,
  letterSpacing: T.ls.wider,
  textTransform: 'uppercase',
  color: T.textMuted,
  lineHeight: T.lh.snug,
}));

export const mono: CSSProperties = {
  fontFamily: T.mono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: 0.2,
};

export const iconChip = (bg: string, fg: string, size = 36): CSSProperties => ({
  width: size,
  height: size,
  borderRadius: T.radius.md,
  background: bg,
  color: fg,
  display: 'grid',
  placeItems: 'center',
  flexShrink: 0,
});

export const smallButton = (filled: boolean, color: string): CSSProperties => ({
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
export const NURSE_CSS = `
@keyframes nc-pulse { 0%,100% { opacity: 1; transform: scale(1); } 50% { opacity: .4; transform: scale(.8); } }
@keyframes nc-shimmer { from { background-position: -240px 0; } to { background-position: 320px 0; } }
@keyframes nc-spin { to { transform: rotate(360deg); } }

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

export function ConsoleHeader({
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

export function StatTile({
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

export function SkeletonRows({ count = 3 }: { count?: number }) {
  return (
    <div aria-hidden="true" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="nc-skel" style={{ height: 60 }} />
      ))}
    </div>
  );
}

export function EmptyState({ icon, title, body }: { icon: string; title: string; body: string }) {
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

