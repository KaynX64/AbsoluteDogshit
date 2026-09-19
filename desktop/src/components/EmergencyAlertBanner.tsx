// desktop/src/components/EmergencyAlertBanner.tsx
import React, { useEffect, useState } from 'react';
import { io, Socket } from 'socket.io-client';

interface EmergencyAlert {
  alertId: number;
  userId: number;
  patientName: string;
  phone: string;
  studentNo: string;
  course: string;
  bloodType: string;
  allergies: string;
  chronicConditions: string;
  emergencyContact: string;
  latitude: number;
  longitude: number;
  googleMapsUrl: string;
  status: string;
  createdAt: string;
}

export default function EmergencyAlertBanner() {
  const [alerts, setAlerts] = useState<EmergencyAlert[]>([]);

  // Synthesize an audible emergency alert beep using Web Audio API
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
    // 1. Fetch initial active alerts from DB
    const fetchActiveAlerts = async () => {
      const token = localStorage.getItem('valetudo_token');
      if (!token) return;
      try {
        const res = await fetch('http://localhost:5000/api/emergency/active', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (Array.isArray(data)) {
          const mapped: EmergencyAlert[] = data.map((a: any) => ({
            alertId: a.alert_id,
            userId: a.user_id,
            patientName: `${a.first_name} ${a.last_name}`,
            phone: a.phone,
            studentNo: 'Verified',
            course: 'PSU Student',
            bloodType: a.blood_type || 'Unknown',
            allergies: a.allergies || 'None',
            chronicConditions: 'N/A',
            emergencyContact: 'Check Profile',
            latitude: Number(a.latitude),
            longitude: Number(a.longitude),
            googleMapsUrl: `https://www.google.com/maps?q=${a.latitude},${a.longitude}`,
            status: a.status,
            createdAt: a.created_at,
          }));
          setAlerts(mapped);
        }
      } catch (_) {}
    };

    fetchActiveAlerts();

    // 2. Connect Socket.IO
    const socket: Socket = io('http://localhost:5000');

    socket.on('emergency:new_alert', (newAlert: EmergencyAlert) => {
      playEmergencyAlarm();

      // Trigger native OS system tray notification
      if ((window as any).electronAPI?.showNotification) {
        (window as any).electronAPI.showNotification({
          title: `🚨 SOS EMERGENCY: ${newAlert.patientName}`,
          body: `Location: ${newAlert.latitude.toFixed(5)}, ${newAlert.longitude.toFixed(5)}. Blood: ${newAlert.bloodType}. Allergies: ${newAlert.allergies}`,
        });
      }

      setAlerts((prev) => [newAlert, ...prev.filter((a) => a.alertId !== newAlert.alertId)]);
    });

    socket.on('emergency:status_change', ({ alertId, status }: { alertId: number; status: string }) => {
      setAlerts((prev) =>
        prev
          .map((a) => (a.alertId === alertId ? { ...a, status } : a))
          .filter((a) => a.status !== 'resolved' && a.status !== 'false_alarm')
      );
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (alertId: number, status: string) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`http://localhost:5000/api/emergency/${alertId}/status`, {
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

  // --- TEST BUTTON HANDLER 1: INSTANT NATIVE OS NOTIFICATION ---
  const handleTestDirectNotification = () => {
    playEmergencyAlarm();
    if ((window as any).electronAPI?.showNotification) {
      (window as any).electronAPI.showNotification({
        title: '🚨 Valetudo HealthLink — SOS Alert Test',
        body: 'Daniella Movida (BSIT) reported a medical emergency at PSU Lingayen Library. Allergies: Penicillin.',
      });
    } else {
      alert('electronAPI.showNotification not detected. Ensure preload.cjs is configured.');
    }
  };

  // --- TEST BUTTON HANDLER 2: FULL STACK REAL-TIME SOS TRIGGER ---
  const handleTestFullStackSOS = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/emergency/sos', {
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

  return (
    <div style={{ marginBottom: 20 }}>
      {/* TEST TRIGGER TOOLBAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          alignItems: 'center',
          gap: 8,
          marginBottom: alerts.length > 0 ? 12 : 0,
        }}
      >
        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 'bold' }}>TEST HARNESS:</span>
        <button
          type="button"
          onClick={handleTestDirectNotification}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #cbd5e1',
            background: '#f8fafc',
            color: '#334155',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
          title="Directly test the OS banner without server"
        >
          🧪 Test OS Notification (Instant)
        </button>

        <button
          type="button"
          onClick={handleTestFullStackSOS}
          style={{
            padding: '4px 10px',
            fontSize: 12,
            borderRadius: 4,
            border: '1px solid #fca5a5',
            background: '#fef2f2',
            color: '#dc2626',
            cursor: 'pointer',
            fontWeight: 'bold',
          }}
          title="Sends real SOS request to backend and broadcasts over Socket.IO"
        >
          🚨 Trigger Live SOS (Full System Test)
        </button>
      </div>

      {/* ACTIVE EMERGENCY ALERTS BANNER */}
      {alerts.map((alert) => (
        <div
          key={alert.alertId}
          style={{
            background: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: 8,
            padding: 16,
            marginBottom: 12,
            boxShadow: '0 4px 6px -1px rgba(239, 68, 68, 0.2)',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 24 }}>🚨</span>
              <h3 style={{ margin: 0, color: '#b91c1c' }}>
                ACTIVE SOS ALERT: {alert.patientName} ({alert.studentNo || 'Student'})
              </h3>
            </div>
            <span
              style={{
                background: '#ef4444',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 'bold',
                textTransform: 'uppercase',
              }}
            >
              Status: {alert.status}
            </span>
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginTop: 12,
              fontSize: 13,
              background: '#fff',
              padding: 12,
              borderRadius: 6,
            }}
          >
            <div>
              <b>Contact:</b> {alert.phone || 'N/A'}<br />
              <b>Blood Type:</b> {alert.bloodType}
            </div>
            <div>
              <b>Allergies:</b> <span style={{ color: 'red' }}>{alert.allergies}</span><br />
              <b>Conditions:</b> {alert.chronicConditions}
            </div>
            <div>
              <b>Emergency Contact:</b><br />
              {alert.emergencyContact}
            </div>
            <div>
              <b>GPS Coordinates:</b><br />
              <code>{alert.latitude.toFixed(6)}, {alert.longitude.toFixed(6)}</code>
              <div style={{ marginTop: 4 }}>
                <a
                  href={alert.googleMapsUrl}
                  target="_blank"
                  rel="noreferrer"
                  style={{ color: '#2563eb', fontWeight: 'bold', textDecoration: 'underline' }}
                >
                  📍 Open in Google Maps
                </a>
              </div>
            </div>
          </div>

          {/* Action dispatch buttons */}
          <div style={{ display: 'flex', gap: 10, marginTop: 12, justifyContent: 'flex-end' }}>
            {alert.status === 'triggered' && (
              <button
                onClick={() => updateStatus(alert.alertId, 'acknowledged')}
                style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
              >
                Acknowledge Alert
              </button>
            )}
            {alert.status !== 'dispatched' && (
              <button
                onClick={() => updateStatus(alert.alertId, 'dispatched')}
                style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
              >
                Dispatch Response Team
              </button>
            )}
            <button
              onClick={() => updateStatus(alert.alertId, 'resolved')}
              style={{ background: '#10b981', color: '#fff', border: 'none', padding: '6px 14px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
            >
              Mark Resolved
            </button>
            <button
              onClick={() => updateStatus(alert.alertId, 'false_alarm')}
              style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
            >
              False Alarm
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}