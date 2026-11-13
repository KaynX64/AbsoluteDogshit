import { T, rgba, softBadge } from '../../theme';
import Icon from '../../shared/ui/Icon';
import { allergyIsReal, mono, iconChip, smallButton, minutesSinceIso, duration, clockOf } from './nursePresentation';
import type { SosAlert } from './nurseTypes';

interface SosBandProps {
  sosAlerts: SosAlert[];
  unacknowledged: number;
  orderedSos: SosAlert[];
  sosBusyId: number | null;
  updateSosStatus: (alertId: number, status: "acknowledged" | "dispatched" | "resolved" | "false_alarm") => Promise<void>;
  setSosConfirm: (value: { alert: SosAlert; status: 'resolved' | 'false_alarm' }) => void;
}

export default function SosBand({
  sosAlerts,
  unacknowledged,
  orderedSos,
  sosBusyId,
  updateSosStatus,
  setSosConfirm,
}: SosBandProps) {
  return (
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
}
