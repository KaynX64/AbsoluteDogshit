// desktop/src/components/ServerPingMonitor.tsx
import { useServerPing, type PingSample } from '../hooks/useServerPing';
import { T } from '../theme';
import Icon from './Icon';
import { API_BASE_URL } from '../config/api';

function toneFor(ms: number, ok: boolean) {
  if (!ok)      return { fg: T.danger,  bg: T.dangerSoft,  label: 'OFFLINE' };
  if (ms < 60)  return { fg: T.success, bg: T.successSoft, label: 'EXCELLENT' };
  if (ms < 150) return { fg: T.tonalGreenFg, bg: T.tonalGreenBg, label: 'GOOD' };
  if (ms < 350) return { fg: T.warning, bg: T.warningSoft, label: 'FAIR' };
  return             { fg: T.danger,  bg: T.dangerSoft,  label: 'POOR' };
}

function Sparkline({ samples }: { samples: PingSample[] }) {
  if (samples.length === 0) {
    return (
      <div style={{ height: 52, display: 'grid', placeItems: 'center', color: T.textMuted, fontSize: 12 }}>
        Waiting for first sample…
      </div>
    );
  }
  // Scale: cap at 400 ms so a single outlier doesn't flatten everything else
  const maxRef = Math.max(400, ...samples.filter((s) => s.ok).map((s) => s.ms));

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 52 }}>
      {samples.map((s, i) => {
        const tone = toneFor(s.ms, s.ok);
        const pct = s.ok ? Math.min(100, Math.max(10, (s.ms / maxRef) * 100)) : 100;
        return (
          <div
            key={i}
            title={s.ok ? `${s.ms} ms` : 'request failed'}
            style={{
              flex: 1,
              minWidth: 2,
              height: `${pct}%`,
              background: tone.fg,
              borderRadius: 2,
              opacity: 0.85,
              transition: `height ${T.durSlow} ${T.ease}`,
            }}
          />
        );
      })}
    </div>
  );
}

function StatBlock({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div>
      <div style={{
        fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2,
        color: T.textMuted, textTransform: 'uppercase', marginBottom: 4,
      }}>
        {label}
      </div>
      <div style={{
        fontSize: 20, fontWeight: 800, letterSpacing: -0.4,
        color: accent ?? T.text, lineHeight: 1,
      }}>
        {value}
      </div>
    </div>
  );
}

export default function ServerPingMonitor() {
  const { samples, current, avg, min, max, jitter, packetLoss, paused, setPaused, pingNow } =
    useServerPing(5000, 40);

  const ok = current?.ok ?? false;
  const tone = toneFor(current?.ms ?? 0, ok);
  const bigNumber = !current ? '—' : ok ? `${current.ms}` : 'X';
  const unit = !current || !ok ? '' : 'ms';

  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.borderSoft}`,
      borderRadius: T.radius.xl,
      padding: '22px 26px',
      boxShadow: T.shadow.sm,
      display: 'grid',
      gridTemplateColumns: '260px 1fr auto',
      gap: 32,
      alignItems: 'center',
      marginBottom: 22,
      transition: `box-shadow ${T.durSlow} ${T.ease}, border-color ${T.durSlow} ${T.ease}`,
    }}
    onMouseEnter={(e) => {
      e.currentTarget.style.boxShadow = T.shadow.md;
      e.currentTarget.style.borderColor = T.border;
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.boxShadow = T.shadow.sm;
      e.currentTarget.style.borderColor = T.borderSoft;
    }}
    >
      {/* LEFT: big latency readout */}
      <div>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
          color: T.textMuted, textTransform: 'uppercase', marginBottom: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: tone.fg,
            boxShadow: ok ? `0 0 0 4px ${tone.bg}` : 'none',
            transition: `background ${T.durSlow} ${T.ease}, box-shadow ${T.durSlow} ${T.ease}`,
          }} />
          Live server ping
        </div>

        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <span style={{
            fontSize: 44, fontWeight: 800, letterSpacing: -1.6,
            color: tone.fg, lineHeight: 1,
            transition: `color ${T.durSlow} ${T.ease}`,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {bigNumber}
          </span>
          {unit && (
            <span style={{ fontSize: 15, fontWeight: 700, color: tone.fg, opacity: 0.7 }}>
              {unit}
            </span>
          )}
        </div>

        <div style={{ marginTop: 8 }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            padding: '3px 10px', borderRadius: T.radius.pill,
            background: tone.bg, color: tone.fg,
            fontSize: 10, fontWeight: 800, letterSpacing: 0.6,
          }}>
            {tone.label}
          </span>
        </div>
      </div>

      {/* CENTER: sparkline */}
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          fontSize: 10.5, fontWeight: 700, letterSpacing: 1.2,
          color: T.textMuted, textTransform: 'uppercase',
          marginBottom: 8,
        }}>
          <span>Last {samples.length} probes · every 5s</span>
          <span>{API_LABEL}</span>
        </div>
        <Sparkline samples={samples} />
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 16, marginTop: 16, paddingTop: 14,
          borderTop: `1px solid ${T.borderSoft}`,
        }}>
          <StatBlock label="Avg"        value={`${avg} ms`} />
          <StatBlock label="Min / Max"  value={`${min} / ${max}`} />
          <StatBlock label="Jitter"     value={`±${jitter} ms`} />
          <StatBlock
            label="Packet loss"
            value={`${packetLoss}%`}
            accent={packetLoss > 0 ? T.danger : T.success}
          />
        </div>
      </div>

      {/* RIGHT: controls */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          type="button"
          onClick={pingNow}
          style={{
            padding: '8px 16px', borderRadius: T.radius.pill,
            background: T.primary, color: '#fff', border: 'none',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: T.font, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Icon name="bolt" size={14} /> Ping now
        </button>
        <button
          type="button"
          onClick={() => setPaused(!paused)}
          style={{
            padding: '8px 16px', borderRadius: T.radius.pill,
            background: paused ? T.warningSoft : T.sage100,
            color: paused ? T.warning : T.textSub,
            border: `1px solid ${paused ? T.warningBorder : T.border}`,
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
            fontFamily: T.font, whiteSpace: 'nowrap',
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}
        >
          <Icon name={paused ? 'play_arrow' : 'pause'} size={14} />
          {paused ? 'Resume' : 'Pause'}
        </button>
      </div>
    </div>
  );
}

// Read the raw host (no protocol) for the header label
const API_LABEL = (() => {
  try {
    return new URL(API_BASE_URL).host;
  } catch {
    return 'backend';
  }
})();