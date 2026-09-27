// desktop/src/components/ResponderConsole.tsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export default function ResponderConsole() {
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

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

  const fetchAlerts = async (silent = false) => {
    if (!silent) setLoading(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/emergency/active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setActiveAlerts(data);
      }
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
          title: `🚨 SOS: ${newAlert.patientName || 'Campus Incident'}`,
          body: `Location: ${newAlert.latitude?.toFixed(5)}, ${newAlert.longitude?.toFixed(5)}. Blood: ${newAlert.bloodType}. Allergies: ${newAlert.allergies}`,
        });
      }

      fetchAlerts(true);
    });

    socket.on('emergency:status_change', (data: { alertId: number; status: string }) => {
      setActiveAlerts((prev) => {
        if (data.status === 'resolved' || data.status === 'false_alarm') {
          return prev.filter((a) => Number(a.alert_id) !== Number(data.alertId));
        } else {
          return prev.map((a) =>
            Number(a.alert_id) === Number(data.alertId) ? { ...a, status: data.status } : a
          );
        }
      });
      fetchAlerts(true);
    });

    const interval = setInterval(() => {
      fetchAlerts(true);
    }, 3000);

    return () => {
      clearInterval(interval);
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (alertId: number, status: string) => {
    setActiveAlerts((prev) =>
      prev
        .map((a) => (Number(a.alert_id) === Number(alertId) ? { ...a, status } : a))
        .filter((a) => (status === 'resolved' || status === 'false_alarm' ? Number(a.alert_id) !== Number(alertId) : true))
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
        title: '🚨 Valetudo HealthLink — SOS Alert Test',
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
    <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #cbd5e1' }}>
      {/* TEST HARNESS (Exclusively visible on Responder Console) */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 16,
          padding: '8px 12px',
          background: '#f8fafc',
          borderRadius: 6,
          border: '1px solid #e2e8f0',
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 13 }}>🛠️</span>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: '#475569' }}>
            RESPONDER DISPATCH TEST HARNESS:
          </span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            type="button"
            onClick={handleTestDirectNotification}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #cbd5e1',
              background: '#ffffff',
              color: '#334155',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🧪 Test OS Tray Banner
          </button>
          <button
            type="button"
            onClick={handleTestFullStackSOS}
            style={{
              padding: '5px 12px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #fca5a5',
              background: '#fef2f2',
              color: '#dc2626',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🚨 Trigger Live SOS (Full System Test)
          </button>
        </div>
      </div>

      {/* Main Dispatch Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: '#dc2626' }}>🚨 Campus Emergency Quick-Response Dispatch</h3>
          <small style={{ color: '#64748b' }}>PSU Lingayen Campus Security & Medical Quick-Response Unit</small>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>
            Dispatch: LIVE ON-DUTY (AUTO-SYNCING)
          </span>
          <button
            onClick={() => fetchAlerts(false)}
            style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            🔄 Manual Refresh
          </button>
        </div>
      </div>

      {loading && activeAlerts.length === 0 ? (
        <p style={{ color: '#64748b', fontSize: 13 }}>Checking dispatch telemetry...</p>
      ) : activeAlerts.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '30px 0', color: '#16a34a', background: '#f0fdf4', borderRadius: 6 }}>
          <b>🛡️ All Clear. No Active SOS Emergencies across PSU Lingayen Campus.</b>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {activeAlerts.map((a) => (
            <div
              key={a.alert_id}
              style={{
                border: '1px solid #f87171',
                borderRadius: 6,
                padding: 14,
                background: '#fff5f5',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 12,
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <b style={{ color: '#b91c1c', fontSize: 15 }}>
                    {a.first_name} {a.last_name} ({a.phone || 'No phone'})
                  </b>
                  <span style={{ fontSize: 11, background: '#ef4444', color: '#fff', padding: '2px 8px', borderRadius: 4, fontWeight: 'bold', textTransform: 'uppercase' }}>
                    {a.status}
                  </span>
                </div>
                <div style={{ fontSize: 13, color: '#334155', marginTop: 4 }}>
                  <b>Blood Type:</b> {a.blood_type || 'Unknown'} | <b>Allergies:</b>{' '}
                  <span style={{ color: a.allergies && a.allergies !== 'None' ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                    {a.allergies || 'None listed'}
                  </span>
                </div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>
                  📍 Coordinates: <code>{Number(a.latitude).toFixed(6)}, {Number(a.longitude).toFixed(6)}</code>
                  &nbsp;•&nbsp;
                  <a
                    href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: '#0284c7', fontWeight: 'bold' }}
                  >
                    Open Live Pin
                  </a>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {a.status === 'triggered' && (
                  <button
                    onClick={() => updateStatus(a.alert_id, 'acknowledged')}
                    style={{ background: '#f59e0b', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                  >
                    Acknowledge
                  </button>
                )}
                {a.status !== 'dispatched' && (
                  <button
                    onClick={() => updateStatus(a.alert_id, 'dispatched')}
                    style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                  >
                    Dispatch Team
                  </button>
                )}
                <button
                  onClick={() => updateStatus(a.alert_id, 'resolved')}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
                >
                  Resolve
                </button>
                <button
                  onClick={() => updateStatus(a.alert_id, 'false_alarm')}
                  style={{ background: '#6b7280', color: '#fff', border: 'none', padding: '6px 10px', borderRadius: 4, cursor: 'pointer' }}
                >
                  False Alarm
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}