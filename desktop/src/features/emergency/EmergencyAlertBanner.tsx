import { useActionFeedback } from '../../shared/ui/feedback';
// desktop/src/features/emergency/EmergencyAlertBanner.tsx
import { useEffect, useRef, useState } from 'react';
import { useResponderAccess } from './ResponderAccess';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';
import { API_BASE_URL } from '../../config/api';
import { CLIENT_INSTANCE_ID } from '../../platform/realtime/clientInstance';
import { T } from '../../theme';
import Icon from '../../shared/ui/Icon';

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
  formattedAddress?: string;
  googleMapsUrl: string;
  status: string;
  createdAt: string;
  // Server tiering: true when the recipient's responder level is not allowed
  // to see medical details (community / non-clinical responders).
  medicalDetailsRedacted?: boolean;
}

export default function EmergencyAlertBanner() {
  const { notify, notice } = useActionFeedback();
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const { tier, refreshAccess, canUpdateStatus } = useResponderAccess();
  const [updating, setUpdating] = useState<Set<number>>(new Set());
  const inFlight = useRef(new Set<number>());
  const refreshAlerts = useRef<(() => Promise<void>) | null>(null);
  const socket = useDesktopSocket();

  // Synthesize an audible emergency alert chime using Web Audio API
    const playEmergencyAlarm = () => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      
      // --- CUSTOMIZE YOUR BEEPS HERE ---
      const beepCount = 7;           // Number of times it beeps
      const beepDuration = 0.6;     // How long each beep lasts (in seconds)
      const gapDuration = 0.3;      // The silence between beeps (in seconds)
      // ---------------------------------

      const startTime = audioCtx.currentTime;

      for (let i = 0; i < beepCount; i++) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        // Calculate when this specific beep should start
        const timeOffset = i * (beepDuration + gapDuration);
        
        osc.frequency.setValueAtTime(850, startTime + timeOffset); // 850 Hz tone
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        // Schedule the start and stop for this beep
        osc.start(startTime + timeOffset);
        osc.stop(startTime + timeOffset + beepDuration);
        
        // Clean up the audio context after the very last beep finishes
        if (i === beepCount - 1) {
          osc.onended = () => { void audioCtx.close().catch(() => {}); };
        }
      }
    } catch (err) {
      console.error('Audio playback failed:', err);
    }
  };

  useEffect(() => {
    const token = localStorage.getItem('valetudo_token');
    if (!token || !tier) {
      setAlerts([]);
      return;
    }

    let accessGranted = true;
    let request: AbortController | undefined;
    let alertVersion = 0;

    const clearAccess = () => {
      accessGranted = false;
      setAlerts([]);
      void refreshAccess(true);
    };

    const fetchActiveAlerts = async () => {
      request?.abort();
      const controller = new AbortController();
      request = controller;
      const options = {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      };
      try {
        const snapshotVersion = alertVersion;
        const res = await fetch(`${API_BASE_URL}/api/emergency/active`, options);
        if (controller.signal.aborted) return;
        if (res.status === 401 || res.status === 403) {
          clearAccess();
          return;
        }
        if (!res.ok) return;
        const data = await res.json();
        if (controller.signal.aborted) return;
        if (snapshotVersion !== alertVersion) {
          void fetchActiveAlerts();
          return;
        }
        if (Array.isArray(data)) {
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

    refreshAlerts.current = fetchActiveAlerts;
    void fetchActiveAlerts();
    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      on('reconnect', fetchActiveAlerts);
      on('emergency:new_alert', (newAlert: EmergencyAlert) => {
        if (!accessGranted) return;
        alertVersion += 1;
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

      on('emergency:status_change', ({ alertId, status }: { alertId: number; status: string }) => {
        if (!accessGranted) return;
        alertVersion += 1;
        setAlerts((prev) =>
          prev
            .map((a) => (Number(a.alertId) === Number(alertId) ? { ...a, status } : a))
            .filter((a) => (status !== 'resolved' && status !== 'false_alarm' ? true : Number(a.alertId) !== Number(alertId)))
        );
      });
    });

    return () => {
      request?.abort();
      accessGranted = false;
      if (refreshAlerts.current === fetchActiveAlerts) refreshAlerts.current = null;
      unsubscribe();
    };
  }, [socket, tier, refreshAccess]);

  const updateStatus = async (alertId: number, status: string) => {
    if (!canUpdateStatus(status) || inFlight.current.has(alertId)) return;
    inFlight.current.add(alertId);
    setUpdating(new Set(inFlight.current));
    const token = localStorage.getItem('valetudo_token');
    try {
      const response = await fetch(`${API_BASE_URL}/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Instance-Id': CLIENT_INSTANCE_ID,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        if (response.status === 401 || response.status === 403) await refreshAccess(true);
        throw new Error(body.error || 'The server rejected the status update.');
      }
      await refreshAlerts.current?.();
    } catch (err: any) {
      notify(`Could not update the SOS status. ${err.message}`, true);
    } finally {
      inFlight.current.delete(alertId);
      setUpdating(new Set(inFlight.current));
    }
  };

  // Display alerts only after live responder access has been confirmed.
  if (!tier || (alerts.length === 0 && !notice)) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      {notice}
      {/* ACTIVE EMERGENCY ALERTS BANNER */}
      {alerts.map((alert) => {
        const redacted = tier !== 'clinical' || alert.medicalDetailsRedacted !== false;
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
                  disabled={updating.has(alert.alertId)}
                  onClick={() => updateStatus(alert.alertId, 'acknowledged')}
                >
                  Acknowledge Alert
                </button>
              )}
              {tier === 'clinical' && alert.status !== 'dispatched' && (
                <button
                  className="ea-action ea-action-dispatch"
                  disabled={updating.has(alert.alertId)}
                  onClick={() => updateStatus(alert.alertId, 'dispatched')}
                >
                  Dispatch Response Team
                </button>
              )}
              {tier === 'clinical' && <button
                className="ea-action ea-action-resolve"
                disabled={updating.has(alert.alertId)}
                onClick={() => updateStatus(alert.alertId, 'resolved')}
              >
                Mark Resolved
              </button>}
              {tier === 'clinical' && <button
                className="ea-action ea-action-false"
                disabled={updating.has(alert.alertId)}
                onClick={() => updateStatus(alert.alertId, 'false_alarm')}
              >
                False Alarm
              </button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
