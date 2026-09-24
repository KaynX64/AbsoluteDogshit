// desktop/src/components/NurseConsole.tsx
import { useState, useEffect } from 'react';
import QrIntakeScanner from './QrIntakeScanner';
import InventoryManager from './InventoryManager';
import { io } from 'socket.io-client';

interface QueueItem {
  queue_id: number;
  ticket_no: string;
  first_name: string;
  last_name: string;
  student_no?: string;
  visit_type: string;
  status: string;
  arrival_time: string;
}

export default function NurseConsole() {
  const [, setVerifiedPatient] = useState<any>(null);
  const [, setScannedToken] = useState('');

  // Live database queue state
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);

  const fetchLiveQueue = async () => {
    setLoadingQueue(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/appointments/queue/today', {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setQueue(data);
      }
    } catch (err) {
      console.error('Error loading live queue:', err);
    } finally {
      setLoadingQueue(false);
    }
  };

  useEffect(() => {
    fetchLiveQueue();

    const token = localStorage.getItem('valetudo_token');
    const socket = io('https://localhost:5000', {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('queue:updated', () => {
      fetchLiveQueue();
    });

    // 🔔 Notify Clinic Nurse of new bookings
    socket.on('appointment:booked', (newBooking: any) => {
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: '📋 New Appointment in System',
          body: `${newBooking.patientName || 'Student'} booked for ${newBooking.date_time}.`,
        });
      }
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Nurse advances the queue: calls the next 'waiting' patient
  const callNextPatient = async () => {
    const nextPatient = queue.find((p) => p.status === 'waiting');
    if (!nextPatient) {
      alert('No more waiting patients in the queue!');
      return;
    }

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`https://localhost:5000/api/appointments/queue/${nextPatient.queue_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'in-consultation' }),
      });

      if (res.ok) {
        fetchLiveQueue();
      }
    } catch (err) {
      alert('Failed to update queue ticket.');
    }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 20, marginBottom: 24 }}>
        {/* 1. QR Health Pass Scanner & Vitals Verification */}
        <QrIntakeScanner
          onPatientVerified={(patient, token) => {
            setVerifiedPatient(patient);
            setScannedToken(token);
            // Auto refresh queue when a patient is checked in
            fetchLiveQueue();
          }}
        />

        {/* 2. Live Triage Queue (Feature 7 connected to MySQL QUEUE table) */}
        <section style={{ padding: 16, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <h3 style={{ margin: 0, color: '#0f766e' }}>2. Live Triage Queue (Feature 7)</h3>
              <small style={{ color: '#64748b' }}>Active daily clinic queue tickets</small>
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              <button
                onClick={callNextPatient}
                style={{ padding: '6px 12px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
              >
                📢 Call Next
              </button>
              <button
                onClick={fetchLiveQueue}
                style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
              >
                🔄
              </button>
            </div>
          </div>

          {loadingQueue ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>Updating queue...</p>
          ) : queue.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 0', color: '#94a3b8', fontSize: 13 }}>
              No patients currently waiting in the infirmary queue.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: '6px' }}>Ticket</th>
                  <th style={{ padding: '6px' }}>Patient Name</th>
                  <th style={{ padding: '6px' }}>Arrival</th>
                  <th style={{ padding: '6px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {queue.map((q) => {
                  let badgeBg = '#fef3c7';
                  let badgeColor = '#b45309';

                  if (q.status === 'in-consultation') {
                    badgeBg = '#dcfce7';
                    badgeColor = '#15803d';
                  }

                  return (
                    <tr key={q.queue_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 6px', fontWeight: 'bold', color: '#0f766e' }}>{q.ticket_no}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <b>{q.first_name} {q.last_name}</b>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{q.visit_type}</div>
                      </td>
                      <td style={{ padding: '8px 6px', fontSize: 12, color: '#64748b' }}>{q.arrival_time}</td>
                      <td style={{ padding: '8px 6px' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 'bold',
                            background: badgeBg,
                            color: badgeColor,
                            textTransform: 'capitalize',
                          }}
                        >
                          {q.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {/* 3. Medicine Inventory Management */}
      <InventoryManager />
    </div>
  );
}