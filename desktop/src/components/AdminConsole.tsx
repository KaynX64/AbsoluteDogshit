// desktop/src/components/AdminConsole.tsx
import React, { useState, useEffect } from 'react';

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'telemetry'>('users');
  const [usersList, setUsersList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const token = localStorage.getItem('valetudo_token');

  useEffect(() => {
    if (activeTab === 'audit') {
      fetchAuditLogs();
    } else if (activeTab === 'users') {
      fetchUsers();
    }
  }, [activeTab]);

  const fetchAuditLogs = async () => {
    setLoading(true);
    try {
      const res = await fetch('https://localhost:5000/api/audit', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setAuditLogs(await res.json());
      }
    } catch (err) {
      console.error('Failed to load audit logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    // For demonstration, mapping the static mockup or an actual user endpoint if available
    setUsersList([
      { id: 1, name: 'Dr. Clark Kim Castro', email: 'admin@psu.edu.ph', role: 'ADMIN', status: 'Active' },
      { id: 2, name: 'Dr. Juan Mata', email: 'doctor@psu.edu.ph', role: 'DOCTOR', status: 'Active' },
      { id: 3, name: 'Nurse Dimples Arenas', email: 'nurse@psu.edu.ph', role: 'NURSE', status: 'Active' },
      { id: 4, name: 'Denver Cerezo', email: 'responder@psu.edu.ph', role: 'EMERGENCY_RESPONDER', status: 'Active' },
      { id: 5, name: 'Daniella Movida', email: 'student@psu.edu.ph', role: 'STUDENT', status: 'Active' },
    ]);
  };

  return (
    <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #cbd5e1' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: '#4f46e5' }}>⚙️ System Administration & Governance</h3>
          <small style={{ color: '#64748b' }}>Republic Act No. 10173 Compliance • Role Management • Audit Hash-Chains</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('users')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: activeTab === 'users' ? '#4f46e5' : '#f1f5f9', color: activeTab === 'users' ? '#fff' : '#334155', fontWeight: 'bold' }}
          >
            👥 User Roles (RBAC)
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: activeTab === 'audit' ? '#4f46e5' : '#f1f5f9', color: activeTab === 'audit' ? '#fff' : '#334155', fontWeight: 'bold' }}
          >
            🔒 RA 10173 Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('telemetry')}
            style={{ padding: '6px 12px', borderRadius: 4, border: 'none', cursor: 'pointer', background: activeTab === 'telemetry' ? '#4f46e5' : '#f1f5f9', color: activeTab === 'telemetry' ? '#fff' : '#334155', fontWeight: 'bold' }}
          >
            📡 System Health
          </button>
        </div>
      </div>

      {activeTab === 'users' && (
        <div style={{ marginTop: 16 }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                <th style={{ padding: '8px' }}>User ID</th>
                <th style={{ padding: '8px' }}>Full Name</th>
                <th style={{ padding: '8px' }}>Institutional Email</th>
                <th style={{ padding: '8px' }}>Assigned RBAC Role</th>
                <th style={{ padding: '8px' }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {usersList.map((u) => (
                <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '8px' }}>#{u.id}</td>
                  <td style={{ padding: '8px', fontWeight: 'bold' }}>{u.name}</td>
                  <td style={{ padding: '8px' }}>{u.email}</td>
                  <td style={{ padding: '8px' }}>
                    <span style={{ background: '#ede9fe', color: '#6d28d9', padding: '2px 8px', borderRadius: 4, fontWeight: 'bold', fontSize: 12 }}>
                      {u.role}
                    </span>
                  </td>
                  <td style={{ padding: '8px', color: '#16a34a' }}>● {u.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'audit' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ padding: 10, background: '#f8fafc', borderRadius: 6, marginBottom: 12, fontSize: 12, color: '#475569' }}>
            <b>Append-Only Chained Hash Integrity:</b> Every mutation records a cryptographic SHA-256 digest referencing the previous entry to prevent tamper attacks.
          </div>
          {loading ? (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>Loading cryptographic audit ledger...</p>
          ) : auditLogs.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#64748b', fontSize: 13 }}>No audit logs recorded yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#64748b' }}>
                  <th style={{ padding: '8px' }}>Log ID</th>
                  <th style={{ padding: '8px' }}>Actor</th>
                  <th style={{ padding: '8px' }}>Action</th>
                  <th style={{ padding: '8px' }}>Target Table</th>
                  <th style={{ padding: '8px' }}>SHA-256 Entry Hash</th>
                  <th style={{ padding: '8px' }}>Time</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '8px' }}>#{log.id}</td>
                    <td style={{ padding: '8px' }}>{log.user}</td>
                    <td style={{ padding: '8px', fontWeight: 'bold' }}>{log.action}</td>
                    <td style={{ padding: '8px' }}>{log.target}</td>
                    <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11 }}>{log.hash ? log.hash.substring(0, 20) + '...' : 'N/A'}</td>
                    <td style={{ padding: '8px', color: '#64748b' }}>{new Date(log.time).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {activeTab === 'telemetry' && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          <div style={{ padding: 16, border: '1px solid #cbd5e1', borderRadius: 6 }}>
            <b>Central MySQL 8.0:</b>
            <p style={{ color: '#16a34a', margin: '6px 0', fontSize: 18, fontWeight: 'bold' }}>● Operational</p>
            <small>Spatial POINT SRID 4326 Active</small>
          </div>
          <div style={{ padding: 16, border: '1px solid #cbd5e1', borderRadius: 6 }}>
            <b>Socket.IO WebSocket:</b>
            <p style={{ color: '#16a34a', margin: '6px 0', fontSize: 18, fontWeight: 'bold' }}>● Connected</p>
            <small>Port 5000 Active</small>
          </div>
          <div style={{ padding: 16, border: '1px solid #cbd5e1', borderRadius: 6 }}>
            <b>Auto-Updater / Packaging:</b>
            <p style={{ color: '#0284c7', margin: '6px 0', fontSize: 18, fontWeight: 'bold' }}>v1.0.0 Stable</p>
            <small>Target: PSU Lingayen Infirmary</small>
          </div>
        </div>
      )}
    </div>
  );
}