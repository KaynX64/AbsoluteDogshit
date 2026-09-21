import AnalyticsDashboard from './AnalyticsDashboard';// desktop/src/components/AdminConsole.tsx
import React, { useState } from 'react';

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'telemetry' | 'analytics'>('users');

  const usersList = [
    { id: 1, name: 'Dr. Clark Kim Castro', email: 'admin@psu.edu.ph', role: 'ADMIN', status: 'Active' },
    { id: 2, name: 'Dr. Juan Mata', email: 'doctor@psu.edu.ph', role: 'DOCTOR', status: 'Active' },
    { id: 3, name: 'Nurse Dimples Arenas', email: 'nurse@psu.edu.ph', role: 'NURSE', status: 'Active' },
    { id: 4, name: 'Denver Cerezo', email: 'responder@psu.edu.ph', role: 'EMERGENCY_RESPONDER', status: 'Active' },
    { id: 5, name: 'Daniella Movida', email: 'student@psu.edu.ph', role: 'STUDENT', status: 'Active' },
  ];

  const auditLogs = [
    { id: 101, user: 'nurse@psu.edu.ph', action: 'DISPENSE', target: 'MEDICINE_BATCHES #1', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', time: '10 mins ago' },
    { id: 102, user: 'student@psu.edu.ph', action: 'SOS_TRIGGER', target: 'EMERGENCY_ALERTS', hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb', time: '15 mins ago' },
    { id: 103, user: 'admin@psu.edu.ph', action: 'LOGIN', target: 'AUTH_SESSIONS', hash: '875442a420b9271fe83742f0226650946fd0b0ce0ced83687d361144b0b06103', time: '1 hour ago' },
  ];

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
          <button
  onClick={() => setActiveTab('analytics')}
  style={{
    padding: '6px 12px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    background: activeTab === 'analytics' ? '#0f766e' : '#f1f5f9',
    color: activeTab === 'analytics' ? '#fff' : '#334155',
    fontWeight: 'bold'
  }}
>
  📊 Health Analytics
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
                  <td style={{ padding: '8px', fontFamily: 'monospace', fontSize: 11 }}>{log.hash.substring(0, 20)}...</td>
                  <td style={{ padding: '8px', color: '#64748b' }}>{log.time}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
      {activeTab === 'analytics' && <AnalyticsDashboard />}
    </div>
  );
}