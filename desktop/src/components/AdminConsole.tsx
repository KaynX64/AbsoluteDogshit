// desktop/src/components/AdminConsole.tsx
import React, { useState } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'telemetry' | 'analytics'>('users');
  const [searchTerm, setSearchTerm] = useState('');

  const usersList = [
    { id: 1, name: 'Dr. Clark Kim Castro', email: 'admin@psu.edu.ph', role: 'ADMIN', status: 'Active', department: 'IT Governance' },
    { id: 2, name: 'Dr. Juan Mata', email: 'doctor@psu.edu.ph', role: 'DOCTOR', status: 'Active', department: 'Infirmary Medicine' },
    { id: 3, name: 'Nurse Dimples Arenas', email: 'nurse@psu.edu.ph', role: 'NURSE', status: 'Active', department: 'Triage & Nursing' },
    { id: 4, name: 'Denver Cerezo', email: 'responder@psu.edu.ph', role: 'EMERGENCY_RESPONDER', status: 'Active', department: 'Campus Security & QRT' },
    { id: 5, name: 'Daniella Movida', email: 'student@psu.edu.ph', role: 'STUDENT', status: 'Active', department: 'BS Information Technology' },
    { id: 6, name: 'Dr. Carmela Reyes', email: 'dentist@psu.edu.ph', role: 'DENTIST', status: 'Active', department: 'Dental Health Unit' },
  ];

  const auditLogs = [
    { id: 101, user: 'nurse@psu.edu.ph', action: 'DISPENSE', target: 'MEDICINE_BATCHES #1', hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', time: '10 mins ago', ip: '192.168.1.45' },
    { id: 102, user: 'student@psu.edu.ph', action: 'SOS_TRIGGER', target: 'EMERGENCY_ALERTS', hash: 'ca978112ca1bbdcafac231b39a23dc4da786eff8147c4e72b9807785afee48bb', time: '15 mins ago', ip: '192.168.1.112' },
    { id: 103, user: 'admin@psu.edu.ph', action: 'LOGIN', target: 'AUTH_SESSIONS', hash: '875442a420b9271fe83742f0226650946fd0b0ce0ced83687d361144b0b06103', time: '1 hour ago', ip: '127.0.0.1' },
    { id: 104, user: 'doctor@psu.edu.ph', action: 'CREATE', target: 'PRESCRIPTIONS #4', hash: '9b71d224bd62f3785d96d46ad3ea3d73319bfbc2890caadae2dff72519673ca7', time: '2 hours ago', ip: '192.168.1.40' },
  ];

  const filteredUsers = usersList.filter(
    (u) =>
      u.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
      u.role.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: '#ffffff',
        padding: 'clamp(14px, 2vw, 24px)',
        borderRadius: 10,
        border: '1px solid #cbd5e1',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
      }}
    >
      {/* 1. DYNAMIC HEADER BAR */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 14,
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: 14,
        }}
      >
        <div style={{ minWidth: 260 }}>
          <h3 style={{ margin: 0, color: '#4f46e5', fontSize: 'clamp(17px, 1.4vw, 21px)' }}>
            ⚙️ System Administration & Governance
          </h3>
          <small style={{ color: '#64748b', fontSize: 12 }}>
            R.A. 10173 Data Privacy Compliance • Role-Based Access Control • Cryptographic Audit Ledger
          </small>
        </div>

        {/* Scalable Tab Switcher */}
        <div
          style={{
            display: 'flex',
            gap: 8,
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <button
            onClick={() => setActiveTab('users')}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'users' ? '#4f46e5' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'users' ? '#4f46e5' : '#f8fafc',
              color: activeTab === 'users' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.15s ease',
            }}
          >
            👥 User Roles (RBAC)
          </button>
          <button
            onClick={() => setActiveTab('audit')}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'audit' ? '#4f46e5' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'audit' ? '#4f46e5' : '#f8fafc',
              color: activeTab === 'audit' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.15s ease',
            }}
          >
            🔒 RA 10173 Audit Logs
          </button>
          <button
            onClick={() => setActiveTab('telemetry')}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'telemetry' ? '#4f46e5' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'telemetry' ? '#4f46e5' : '#f8fafc',
              color: activeTab === 'telemetry' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.15s ease',
            }}
          >
            📡 System Health
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'analytics' ? '#0f766e' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'analytics' ? '#0f766e' : '#f8fafc',
              color: activeTab === 'analytics' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
              transition: 'all 0.15s ease',
            }}
          >
            📊 Health Analytics
          </button>
        </div>
      </div>

      {/* 2. TAB CONTENT: USERS DIRECTORY */}
      {activeTab === 'users' && (
        <div style={{ marginTop: 16 }}>
          {/* Quick Search & Count Filter */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 12,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <input
              type="text"
              placeholder="Search user by name, email, or role..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                padding: '8px 12px',
                width: 'clamp(240px, 30vw, 400px)',
                borderRadius: 6,
                border: '1px solid #cbd5e1',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>
              Showing {filteredUsers.length} of {usersList.length} Active System Accounts
            </span>
          </div>

          {/* Fluid Auto-Scrolling Table Container */}
          <div
            style={{
              width: '100%',
              overflowX: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              background: '#ffffff',
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 700,
                borderCollapse: 'collapse',
                fontSize: 13,
                textAlign: 'left',
              }}
            >
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 14px' }}>User ID</th>
                  <th style={{ padding: '12px 14px' }}>Full Name</th>
                  <th style={{ padding: '12px 14px' }}>Institutional Email</th>
                  <th style={{ padding: '12px 14px' }}>Unit / Department</th>
                  <th style={{ padding: '12px 14px' }}>Assigned RBAC Role</th>
                  <th style={{ padding: '12px 14px' }}>Account Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr
                    key={u.id}
                    style={{
                      borderBottom: '1px solid #f1f5f9',
                      transition: 'background 0.15s ease',
                    }}
                  >
                    <td style={{ padding: '12px 14px', color: '#64748b', fontWeight: 600 }}>#{u.id}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#1e293b' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', color: '#334155' }}>{u.email}</td>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{u.department}</td>
                    <td style={{ padding: '12px 14px' }}>
                      <span
                        style={{
                          background: u.role === 'ADMIN' ? '#ede9fe' : u.role === 'DOCTOR' ? '#e0f2fe' : '#f0fdf4',
                          color: u.role === 'ADMIN' ? '#6d28d9' : u.role === 'DOCTOR' ? '#0369a1' : '#15803d',
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontWeight: 'bold',
                          fontSize: 11,
                        }}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', color: '#16a34a', fontWeight: 600, fontSize: 12 }}>
                      ● {u.status}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. TAB CONTENT: AUDIT LOGS */}
      {activeTab === 'audit' && (
        <div style={{ marginTop: 16 }}>
          <div
            style={{
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginBottom: 14,
              fontSize: 12,
              color: '#334155',
              lineHeight: 1.5,
            }}
          >
            <strong>🔒 Cryptographic Append-Only Chain:</strong> Every transaction generates a SHA-256 hash
            linking directly to the preceding log record. This tamper-evident mechanism fulfills the regulatory audit
            standards mandated by the <strong>National Privacy Commission (NPC Circular 16-01)</strong>.
          </div>

          <div
            style={{
              width: '100%',
              overflowX: 'auto',
              maxHeight: 'calc(100vh - 300px)',
              overflowY: 'auto',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
            }}
          >
            <table
              style={{
                width: '100%',
                minWidth: 780,
                borderCollapse: 'collapse',
                fontSize: 12,
                textAlign: 'left',
              }}
            >
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2 }}>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '10px 12px' }}>Log ID</th>
                  <th style={{ padding: '10px 12px' }}>Actor</th>
                  <th style={{ padding: '10px 12px' }}>Action</th>
                  <th style={{ padding: '10px 12px' }}>Target Entity</th>
                  <th style={{ padding: '10px 12px' }}>IP Origin</th>
                  <th style={{ padding: '10px 12px' }}>SHA-256 Verification Hash</th>
                  <th style={{ padding: '10px 12px' }}>Timestamp</th>
                </tr>
              </thead>
              <tbody>
                {auditLogs.map((log) => (
                  <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{log.id}</td>
                    <td style={{ padding: '10px 12px', color: '#0f766e', fontWeight: 600 }}>{log.user}</td>
                    <td style={{ padding: '10px 12px' }}>
                      <span
                        style={{
                          background: log.action === 'SOS_TRIGGER' ? '#fee2e2' : '#f1f5f9',
                          color: log.action === 'SOS_TRIGGER' ? '#dc2626' : '#334155',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontWeight: 'bold',
                        }}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td style={{ padding: '10px 12px', color: '#334155' }}>{log.target}</td>
                    <td style={{ padding: '10px 12px', color: '#64748b' }}>{log.ip}</td>
                    <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                      {log.hash.substring(0, 24)}…
                    </td>
                    <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>{log.time}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. TAB CONTENT: AUTO-FIT DYNAMIC TELEMETRY GRID */}
      {activeTab === 'telemetry' && (
        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 16,
          }}
        >
          <div
            style={{
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#f8fafc',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>PRIMARY DATABASE</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Central MySQL 8.0</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Operational</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Spatial SRID 4326 • 21 Normalized Tables Active
            </div>
          </div>

          <div
            style={{
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#f8fafc',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>REAL-TIME GATEWAY</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Socket.IO Engine</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Connected</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Port 5000 Active • Queue & SOS Realtime Relays
            </div>
          </div>

          <div
            style={{
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#f8fafc',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>DESKTOP RUNTIME</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Electron Client</h4>
            <p style={{ color: '#0284c7', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>v1.0.0 Stable</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Native Spooler & Hardware USB Scanner Bindings
            </div>
          </div>

          <div
            style={{
              padding: 18,
              border: '1px solid #cbd5e1',
              borderRadius: 8,
              background: '#f8fafc',
              boxShadow: '0 1px 2px rgba(0,0,0,0.02)',
            }}
          >
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>PRIVACY AUDIT VERIFIER</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>RA 10173 Audit Trail</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Valid Hash-Chain</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              0 Integrity Violations Detected Across Logs
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB CONTENT: FULL-SCALE ANALYTICS DASHBOARD */}
      {activeTab === 'analytics' && <AnalyticsDashboard />}
    </div>
  );
}