// desktop/src/components/ResponderConsole.tsx
import React, { useEffect, useState } from 'react';
import { io } from 'socket.io-client';

export default function ResponderConsole() {
  const [activeAlerts, setActiveAlerts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchAlerts = async () => {
    setLoading(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/emergency/active', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setActiveAlerts(data);
      }
    } catch (err) {
      console.error('Failed to fetch alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAlerts();

    const socket = io('http://localhost:5000');
    socket.on('emergency:new_alert', () => fetchAlerts());
    socket.on('emergency:status_change', () => fetchAlerts());

    return () => {
      socket.disconnect();
    };
  }, []);

  const updateStatus = async (alertId: number, status: string) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`http://localhost:5000/api/emergency/${alertId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status }),
      });
      fetchAlerts();
    } catch (err) {
      alert('Failed to update status');
    }
  };

  return (
    <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #cbd5e1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h3 style={{ margin: 0, color: '#dc2626' }}>🚨 Campus Emergency Quick-Response Dispatch</h3>
          <small style={{ color: '#64748b' }}>PSU Lingayen Campus Security & Medical Quick-Response Unit</small>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <span style={{ background: '#fee2e2', color: '#dc2626', padding: '4px 10px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>
            Dispatch: LIVE ON-DUTY
          </span>
          <button
            onClick={fetchAlerts}
            style={{ padding: '4px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
          >
            🔄 Refresh
          </button>
        </div>
      </div>

      {loading ? (
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
                  <span style={{ color: a.allergies ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
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

              <div style={{ display: 'flex', gap: 8 }}>
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
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}