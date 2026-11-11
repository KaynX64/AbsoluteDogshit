// desktop/src/components/EmergencyAlertBanner.tsx
import React, { useEffect, useState } from 'react';
import { subscribeToDesktopEvents, useDesktopSocket } from '../services/desktopRealtime';
import { API_BASE_URL } from '../config/api';
import { CLIENT_INSTANCE_ID } from '../services/clientInstance';
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
  formattedAddress?: string;
  googleMapsUrl: string;
  status: string;
  createdAt: string;
  // Server tiering: true when the recipient's responder level is not allowed
  // to see medical details (community / non-clinical responders).
  medicalDetailsRedacted?: boolean;
}

export default function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);
  const [authorized, setAuthorized] = useState(false);
  const socket = useDesktopSocket();

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
    const token = localStorage.getItem('valetudo_token');
    if (!token) return;

    let accessGranted = false;
    let request: AbortController | undefined;
    let alertVersion = 0;

    const clearAccess = () => {
      accessGranted = false;
      setAuthorized(false);
      setAlerts([]);
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
        const access = await fetch(`${API_BASE_URL}/api/emergency/responder-access`, options);
        if (controller.signal.aborted) return;
        if (!access.ok) {
          clearAccess();
          return;
        }
        const capability = await access.json();
        if (controller.signal.aborted) return;
        if (capability?.authorized !== true) {
          clearAccess();
          return;
        }

        accessGranted = true;
        setAuthorized(true);
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

    void fetchActiveAlerts();
    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      on('reconnect', fetchActiveAlerts);
      on('responder:status_changed', () => {
        clearAccess();
        void fetchActiveAlerts();
      });
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
      unsubscribe();
    };
  }, [socket]);

  const updateStatus = async (alertId: number, status: string) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`${API_BASE_URL}/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Instance-Id': CLIENT_INSTANCE_ID,
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ status }),
      });
    } catch (err: any) {
      alert('Failed to update status: ' + err.message);
    }
  };

  // Display alerts only after live responder access has been confirmed.
  if (!authorized) return null;

  return (
    <div style={{ marginBottom: 20 }}>
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
