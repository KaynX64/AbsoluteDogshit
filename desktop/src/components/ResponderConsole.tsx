// desktop/src/components/ResponderConsole.tsx
import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { T, btnPrimary, btnGhost } from '../theme';

export default function ResponderConsole() {
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  /* ── Audio alarm (identical) ─────────────────────────────── */
  const playEmergencyAlarm = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850, audioCtx.currentTime);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6);
    } catch (_) {}
  };

  /* ── Data fetchers (identical) ───────────────────────────── */
  const fetchAlerts = async (silent = false) => {
    if (!silent) setLoading(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/emergency/active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setActiveAlerts(data);
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts(false);

    const token = localStorage.getItem('valetudo_token');
    const socket = io('https://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('emergency:new_alert', (newAlert: any) => {
      playEmergencyAlarm();
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: `🚨 SOS: ${newAlert.patientName || 'Campus incident'}`,
          body: `Location: ${newAlert.latitude?.toFixed(5)}, ${newAlert.longitude?.toFixed(5)}. Blood: ${newAlert.bloodType}. Allergies: ${newAlert.allergies}`,
        });
      }
      fetchAlerts(true);
    });

    socket.on('emergency:status_change', (data: { alertId: number; status: string }) => {
      setActiveAlerts((prev) => {
        if (data.status === 'resolved' || data.status === 'false_alarm') {
          return prev.filter((a) => Number(a.alert_id) !== Number(data.alertId));
        }
        return prev.map((a) =>
          Number(a.alert_id) === Number(data.alertId) ? { ...a, status: data.status } : a
        );
      });
      fetchAlerts(true);
    });

    const interval = setInterval(() => fetchAlerts(true), 3000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (alertId: number, status: string) => {
    setActiveAlerts((prev) =>
      prev
        .map((a) => (Number(a.alert_id) === Number(alertId) ? { ...a, status } : a))
        .filter((a) =>
          status === 'resolved' || status === 'false_alarm'
            ? Number(a.alert_id) !== Number(alertId)
            : true
        )
    );

    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`https://localhost:5000/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      fetchAlerts(true);
    } catch (err) {
      alert('Failed to update status');
      fetchAlerts(true);
    }
  };

  const handleTestDirectNotification = () => {
    playEmergencyAlarm();
    if (window.electronAPI?.showNotification) {
      window.electronAPI.showNotification({
        title: '🚨 Valetudo HealthLink — SOS alert test',
        body: 'Daniella Movida (BSIT) reported a medical emergency at PSU Lingayen Library. Allergies: Penicillin.',
      });
    } else {
      alert('electronAPI.showNotification not detected.');
    }
  };

  const handleTestFullStackSOS = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/emergency/sos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          latitude: 16.029851,
          longitude: 120.228543,
          notes: 'SIMULATED SOS: PSU Lingayen Administration Building',
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert('Server SOS error: ' + (data.error || 'Check server connection'));
      }
    } catch (err: any) {
      alert('Could not trigger backend test SOS: ' + err.message);
    }
  };

  /* ── Status pill helper ─────────────────────────────────── */
  const statusStyle = (s: string) => {
    switch (s) {
      case 'triggered':    return { bg: T.dangerSoft,  color: T.danger,  label: 'TRIGGERED' };
      case 'acknowledged': return { bg: T.warningSoft, color: T.warning, label: 'ACKNOWLEDGED' };
      case 'dispatched':   return { bg: T.infoSoft,    color: T.info,    label: 'DISPATCHED' };
      default:             return { bg: T.sage100,     color: T.textSub, label: s.toUpperCase() };
    }
  };

  /* ═══════════════════════════════════════════════════════════════ */
  /* RENDER                                                          */
  /* ═══════════════════════════════════════════════════════════════ */

  return (
    <div style={{ width: '100%' }}>
      {/* ── Page header ─────────────────────────────────── */}
      <div style={{ marginBottom: 22 }}>
        <h1 style={{
          fontSize: 28, fontWeight: 800, letterSpacing: -0.6,
          color: T.text, margin: 0,
        }}>
          Campus emergency dispatch
        </h1>
        <p style={{ fontSize: 13.5, color: T.textSub, margin: '6px 0 0' }}>
          PSU Lingayen Campus Security & Medical Quick-Response Unit · Live on-duty · auto-syncing
        </p>
      </div>

      {/* ── TEST HARNESS (dev only) ─────────────────────── */}
      {import.meta.env.DEV && (
        <div style={{
          display: 'flex', justifyContent: 'space-between',
          alignItems: 'center', gap: 12, marginBottom: 20,
          padding: '12px 16px',
          background: T.sage100,
          borderRadius: T.radius.md,
          border: `1px dashed ${T.sage300}`,
          flexWrap: 'wrap',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 15 }}>🛠️</span>
            <span style={{
              fontSize: 11, fontWeight: 800, letterSpacing: 1.2,
              color: T.textSub, textTransform: 'uppercase',
            }}>
              Dispatch test harness (dev only)
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleTestDirectNotification}
              style={{
                padding: '6px 14px', borderRadius: T.radius.pill,
                background: T.surface, color: T.textSub,
                border: `1px solid ${T.border}`,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: T.font,
              }}
            >
              🧪 Test OS tray banner
            </button>
            <button
              type="button"
              onClick={handleTestFullStackSOS}
              style={{
                padding: '6px 14px', borderRadius: T.radius.pill,
                background: T.dangerSoft, color: T.danger,
                border: `1px solid ${T.dangerBorder}`,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: T.font,
              }}
            >
              🚨 Trigger live SOS
            </button>
          </div>
        </div>
      )}

      {/* ── Status strip ────────────────────────────────── */}
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', gap: 12, marginBottom: 22, flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <div style={{
            padding: '10px 18px', borderRadius: T.radius.md,
            background: T.surface, border: `1px solid ${T.border}`,
            minWidth: 120,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.textMuted, textTransform: 'uppercase' }}>
              Active incidents
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.danger, marginTop: 2 }}>
              {activeAlerts.length}
            </div>
          </div>
          <div style={{
            padding: '10px 18px', borderRadius: T.radius.md,
            background: T.surface, border: `1px solid ${T.border}`,
            minWidth: 120,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.textMuted, textTransform: 'uppercase' }}>
              Units available
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.primary, marginTop: 2 }}>3</div>
          </div>
          <div style={{
            padding: '10px 18px', borderRadius: T.radius.md,
            background: T.surface, border: `1px solid ${T.border}`,
            minWidth: 120,
          }}>
            <div style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: T.textMuted, textTransform: 'uppercase' }}>
              Campus
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 2 }}>Lingayen</div>
          </div>
        </div>

        <button type="button" onClick={() => fetchAlerts(false)} style={btnGhost}>
          🔄 Refresh
        </button>
      </div>

      {/* ── Alert list / empty state ───────────────────── */}
      {loading && activeAlerts.length === 0 ? (
        <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textSub, fontSize: 13 }}>
          Checking dispatch telemetry…
        </div>
      ) : activeAlerts.length === 0 ? (
        <div style={{
          padding: '60px 40px', textAlign: 'center',
          background: T.successSoft,
          border: `1px solid ${T.successBorder}`,
          borderRadius: T.radius.xl,
        }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>🛡️</div>
          <div style={{ fontSize: 17, fontWeight: 800, color: T.success, marginBottom: 6 }}>
            All clear
          </div>
          <div style={{ fontSize: 13, color: T.success, opacity: 0.8, fontWeight: 600 }}>
            No active SOS emergencies across PSU Lingayen Campus.
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeAlerts.map((a) => {
            const s = statusStyle(a.status);
            const lat = Number(a.latitude);
            const lng = Number(a.longitude);
            const hasCoords = !isNaN(lat) && !isNaN(lng) && (lat !== 0 || lng !== 0);
            const allergyIsWarning = a.allergies && a.allergies !== 'None' && a.allergies !== 'None listed';

            return (
              <div
                key={a.alert_id}
                style={{
                  background: T.surface,
                  border: `1.5px solid ${T.dangerBorder}`,
                  borderRadius: T.radius.xl,
                  padding: '22px 24px',
                  boxShadow: T.shadow.sm,
                }}
              >
                {/* Header row */}
                <div style={{
                  display: 'flex', justifyContent: 'space-between',
                  alignItems: 'flex-start', gap: 14, marginBottom: 18,
                  flexWrap: 'wrap',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, minWidth: 260 }}>
                    <div style={{
                      width: 44, height: 44, borderRadius: T.radius.md,
                      background: T.dangerSoft, color: T.danger,
                      display: 'grid', placeItems: 'center', fontSize: 22,
                      flexShrink: 0,
                    }}>
                      🚨
                    </div>
                    <div>
                      <div style={{ fontSize: 17, fontWeight: 800, color: T.text }}>
                        {a.first_name} {a.last_name}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSub, marginTop: 3, fontFamily: T.mono }}>
                        {a.studentNo || a.identifier_no || 'Verified user'}
                        {a.phone && <span style={{ marginLeft: 8, color: T.textMuted }}>· {a.phone}</span>}
                      </div>
                    </div>
                  </div>

                  <span style={{
                    padding: '5px 14px', borderRadius: T.radius.pill,
                    background: s.bg, color: s.color,
                    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.6,
                  }}>
                    {s.label}
                  </span>
                </div>

                {/* Medical grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
                  gap: 12, marginBottom: 16,
                  padding: '14px 18px',
                  background: T.sage50,
                  borderRadius: T.radius.lg,
                  border: `1px solid ${T.borderSoft}`,
                }}>
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
                      color: T.textMuted, textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      Blood type
                    </div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: T.text }}>
                      {a.blood_type || 'Unknown'}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
                      color: T.textMuted, textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      Known allergy
                    </div>
                    <div style={{
                      fontSize: 14, fontWeight: 800,
                      color: allergyIsWarning ? T.danger : T.success,
                    }}>
                      {allergyIsWarning ? `⚠️ ${a.allergies}` : (a.allergies || 'None listed')}
                    </div>
                  </div>
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
                      color: T.textMuted, textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      Reported
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.text }}>
                      {a.created_at ? new Date(a.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </div>
                  </div>
                </div>

                {/* GPS row (clickable, opens Google Maps) */}
                <a
                  href={hasCoords ? `https://www.google.com/maps?q=${lat},${lng}` : undefined}
                  target="_blank"
                  rel="noreferrer"
                  style={{
                    display: 'flex', justifyContent: 'space-between',
                    alignItems: 'center', gap: 12,
                    padding: '12px 18px',
                    background: T.primaryTint,
                    borderRadius: T.radius.md,
                    marginBottom: 16,
                    textDecoration: 'none',
                    cursor: hasCoords ? 'pointer' : 'default',
                    border: `1px solid ${T.sage300}`,
                  }}
                >
                  <div>
                    <div style={{
                      fontSize: 10, fontWeight: 800, letterSpacing: 1.2,
                      color: T.primarySoft, textTransform: 'uppercase',
                      marginBottom: 3,
                    }}>
                      GPS coordinates
                    </div>
                    <div style={{
                      fontFamily: T.mono, fontSize: 13, fontWeight: 700,
                      color: T.primary,
                    }}>
                      {hasCoords ? `${lat.toFixed(6)}, ${lng.toFixed(6)}` : 'Not available'}
                    </div>
                  </div>
                  {hasCoords && (
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      fontSize: 12, fontWeight: 700, color: T.primary,
                    }}>
                      Open in Maps ↗
                    </span>
                  )}
                </a>

                {/* Action row */}
                <div style={{
                  display: 'flex', gap: 10, flexWrap: 'wrap',
                  alignItems: 'center', justifyContent: 'flex-end',
                }}>
                  {a.status === 'triggered' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(a.alert_id, 'acknowledged')}
                      style={{
                        padding: '10px 20px', borderRadius: T.radius.pill,
                        background: T.warningSoft, color: T.warning,
                        border: `1px solid ${T.warningBorder}`,
                        fontSize: 13, fontWeight: 700, cursor: 'pointer',
                        fontFamily: T.font,
                      }}
                    >
                      Acknowledge
                    </button>
                  )}
                  {a.status !== 'dispatched' && (
                    <button
                      type="button"
                      onClick={() => updateStatus(a.alert_id, 'dispatched')}
                      style={{ ...btnPrimary, padding: '10px 20px' }}
                    >
                      Dispatch team
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => updateStatus(a.alert_id, 'resolved')}
                    style={{
                      padding: '10px 18px', borderRadius: T.radius.pill,
                      background: T.successSoft, color: T.success,
                      border: `1px solid ${T.successBorder}`,
                      fontSize: 13, fontWeight: 700, cursor: 'pointer',
                      fontFamily: T.font,
                    }}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    onClick={() => updateStatus(a.alert_id, 'false_alarm')}
                    style={{
                      padding: '10px 16px', borderRadius: T.radius.pill,
                      background: 'transparent', color: T.textMuted,
                      border: `1px solid ${T.border}`,
                      fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
                      fontFamily: T.font,
                    }}
                  >
                    False alarm
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}