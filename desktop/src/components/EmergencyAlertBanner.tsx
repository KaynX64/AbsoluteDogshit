// desktop/src/components/EmergencyAlertBanner.tsx
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import { T } from '../theme';
import Icon from './Icon';

interface EmergencyAlert {
  alertId: number;
  userId: number;
  patientName: string;
  phone: string;
  role?: string;
  roleLabel?: string;
  studentNo: string;
  course: string;
  bloodType?: string;
  allergies?: string;
  chronicConditions?: string;
  emergencyContact?: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  status: string;
  createdAt: string;
  // Server tiering: true when the recipient's responder level is not allowed
  // to see medical details (community / non-clinical responders).
  medicalDetailsRedacted?: boolean;
}

export default function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  // 403 on /active means this account is not an active qualified responder —
  // an unlabelled dentist or a revoked flagged account. Render nothing then:
  // delivery rules are decided server-side, never guessed client-side.
  const [authorized, setAuthorized] = useState(true);

  // Synthesize an audible emergency alert chime using Web Audio API
  const playEmergencyAlarm = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(850, audioCtx.currentTime); // 850 Hz alarm tone
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.6); // 600ms chime
    } catch (_) {}
  };

  useEffect(() => {
    let cancelled = false;

    // 1. Fetch initial active alerts from DB.
    // roleLabel comes from the SERVER (same map as the mobile payload) —
    // the banner no longer maintains its own role mapping.
    const fetchActiveAlerts = async () => {
      const token = localStorage.getItem('valetudo_token');
      if (!token) return;
      try {
        const res = await fetch(`${API_BASE_URL}/api/emergency/active`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.status === 403) {
          if (!cancelled) setAuthorized(false);
          return;
        }
        const data = await res.json();
        if (Array.isArray(data) && !cancelled) {
          setAlerts(
            data.map((a: any) => ({
              alertId: a.alert_id,
              userId: a.user_id,
              patientName: `${a.first_name} ${a.last_name}`,
              phone: a.phone,
              role: a.primary_role,
              roleLabel: a.roleLabel || a.primary_role,
              studentNo: a.studentNo || a.identifier_no || 'Verified',
              course: a.course || a.affiliation || 'PSU Lingayen',
              bloodType: a.blood_type ?? undefined,
              allergies: a.allergies ?? undefined,
              chronicConditions: undefined,
              emergencyContact: undefined,
              latitude: Number(a.latitude),
              longitude: Number(a.longitude),
              googleMapsUrl: `https://www.google.com/maps?q=${a.latitude},${a.longitude}`,
              status: a.status,
              createdAt: a.created_at,
              medicalDetailsRedacted: a.medicalDetailsRedacted === true,
            }))
          );
        }
      } catch (_) {}
    };

    fetchActiveAlerts();

    // 2. Connect Socket.IO with token authentication. The server places this
    // socket in its per-user room (user:<id>); alerts arrive tiered for the
    // account's responder level.
    const token = localStorage.getItem('valetudo_token');
    const socket: Socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      console.log('[EmergencyAlertBanner] Live Socket connected:', socket.id);
    });

    socket.on('connect_error', (err) => {
      console.error('[EmergencyAlertBanner] Socket error:', err.message);
    });

    socket.on('emergency:new_alert', (newAlert: EmergencyAlert) => {
      console.log('[EmergencyAlertBanner] New SOS received in real-time:', newAlert);
      playEmergencyAlarm();

      // Trigger native OS system tray notification. Lock-screen privacy: the
      // OS notification carries the location only — no medical details and no
      // blood/allergy data for ANY recipient tier.
      if ((window as any).electronAPI?.showNotification) {
        (window as any).electronAPI.showNotification({
          title: `SOS: ${newAlert.patientName} (${newAlert.roleLabel || 'PSU Member'})`,
          body: `Location: ${newAlert.formattedAddress || `${Number(newAlert.latitude).toFixed(5)}, ${Number(newAlert.longitude).toFixed(5)}`}. Open the console for details.`,
        });
      }

      // Immediately display the red banner at the top of the UI
      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.alertId !== newAlert.alertId)]);
    });

    socket.on('emergency:status_change', ({ alertId, status }: { alertId: number; status: string }) => {
      setAlerts((prev) =>
        prev
          .map((a) => (Number(a.alertId) === Number(alertId) ? { ...a, status } : a))
          .filter((a) => (status !== 'resolved' && status !== 'false_alarm' ? true : Number(a.alertId) !== Number(alertId)))
      );
    });

    return () => {
      cancelled = true;
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (alertId: number, status: string) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`${API_BASE_URL}/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    }
  };

  // Test OS notification
  const handleTestDirectNotification = () => {
    playEmergencyAlarm();
    if ((window as any).electronAPI?.showNotification) {
      (window as any).electronAPI.showNotification({
        title: 'Valetudo HealthLink — SOS Alert Test',
        body: 'Daniella Movida (BSIT) reported a medical emergency at PSU Lingayen Library.',
      });
    } else {
      alert('electronAPI.showNotification not detected. Ensure preload.cjs is configured.');
    }
  };

  // Full stack SOS test
  const handleTestFullStackSOS = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/emergency/sos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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

  // Not an active qualified responder (server said 403) — render nothing.
  if (!authorized) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {/* TEST TRIGGER TOOLBAR */}
      <div className="ea-toolbar">
        <span className="ea-toolbar-label">Test harness</span>
        <button
          type="button"
          className="ea-btn-test"
          onClick={handleTestDirectNotification}
          title="Directly test the OS banner without server"
        >
          <Icon name="science" size={14} /> Test OS Notification (Instant)
        </button>

        <button
          type="button"
          className="ea-btn-live"
          onClick={handleTestFullStackSOS}
          title="Sends real SOS request to backend and broadcasts over Socket.IO"
        >
          <Icon name="emergency" size={14} /> Trigger Live SOS (Full System Test)
        </button>
      </div>

      {/* ACTIVE EMERGENCY ALERTS BANNER */}
      {alerts.map((alert) => {
        const redacted = alert.medicalDetailsRedacted === true;
        return (
          <div key={alert.alertId} className="ea-alert">
            <div className="ea-alert-head">
              <h3 className="ea-alert-title">
                <Icon name="emergency" size={22} fill tone="danger" />
                ACTIVE SOS ALERT: {alert.patientName} ({alert.roleLabel || alert.studentNo || 'Campus Personnel'})
              </h3>
              <span className="ea-status-pill">
                Status: {alert.status}
              </span>
            </div>

            <div className="ea-grid">
              <div>
                <b>Contact:</b> {alert.phone || 'N/A'}<br />
                <b>Role / Unit:</b> {alert.roleLabel || alert.course || 'PSU Personnel'}
              </div>
              <div>
                {redacted ? (
                  <>
                    <b>Medical details:</b>{' '}
                    <span style={{ color: T.warning, fontWeight: 700 }}>
                      Not shared at your responder level
                    </span>
                    <br />
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                      Reduced payload for non-clinical responders (R.A. 10173).
                    </span>
                  </>
                ) : (
                  <>
                    <b>Blood Type:</b> {alert.bloodType || 'Unknown'}
                    <br />
                    <b>Allergies:</b>{' '}
                    <span style={{ color: T.danger, fontWeight: 700 }}>
                      {alert.allergies || 'None'}
                    </span>
                  </>
                )}
              </div>
              <div>
                <b>Emergency Contact:</b><br />
                {redacted ? (
                  <span style={{ color: T.textMuted }}>Not shared at your responder level</span>
                ) : (
                  (alert.emergencyContact || 'Check Profile')
                )}
              </div>
              <div>
                <b>GPS Coordinates:</b><br />
                <code style={{ fontFamily: T.mono, fontSize: 12, color: T.textSub }}>
                  {Number(alert.latitude).toFixed(6)}, {Number(alert.longitude).toFixed(6)}
                </code>
                <div style={{ marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <a
                    href={alert.googleMapsUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Icon name="location_on" size={14} /> Open in Google Maps
                  </a>
                </div>
              </div>
            </div>

            {/* Action dispatch buttons */}
            <div className="ea-actions">
              {alert.status === 'triggered' && (
                <button
                  className="ea-action ea-action-ack"
                  onClick={() => updateStatus(alert.alertId, 'acknowledged')}
                >
                  Acknowledge Alert
                </button>
              )}
              {alert.status !== 'dispatched' && (
                <button
                  className="ea-action ea-action-dispatch"
                  onClick={() => updateStatus(alert.alertId, 'dispatched')}
                >
                  Dispatch Response Team
                </button>
              )}
              <button
                className="ea-action ea-action-resolve"
                onClick={() => updateStatus(alert.alertId, 'resolved')}
              >
                Mark Resolved
              </button>
              <button
                className="ea-action ea-action-false"
                onClick={() => updateStatus(alert.alertId, 'false_alarm')}
              >
                False Alarm
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
