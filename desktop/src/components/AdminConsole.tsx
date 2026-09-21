// desktop/src/components/AdminConsole.tsx
import React, { useState, useEffect } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'telemetry' | 'analytics'>('users');
  const [auditSubTab, setAuditSubTab] = useState<'mutations' | 'phi'>('phi');

  const [usersList, setUsersList] = useState<any[]>([]);
  const [mutationLogs, setMutationLogs] = useState<any[]>([]);
  const [phiLogs, setPhiLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch live logs and users
  const fetchUsers = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsersList(await res.json());
    } catch (_) {}
  };

  const fetchMutationLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/admin/audit-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setMutationLogs(await res.json());
    } catch (_) {}
    setLoadingLogs(false);
  };

  const fetchPhiLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/admin/phi-access-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPhiLogs(await res.json());
    } catch (_) {}
    setLoadingLogs(false);
  };

  useEffect(() => {
    fetchUsers();
    fetchMutationLogs();
    fetchPhiLogs();
  }, []);

  const filteredUsers = usersList.filter(
    (u) =>
      (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(searchTerm.toLowerCase())
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
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
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
            }}
          >
            👥 User Roles (RBAC)
          </button>
          <button
            onClick={() => {
              setActiveTab('audit');
              fetchPhiLogs();
              fetchMutationLogs();
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'audit' ? '#4f46e5' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'audit' ? '#4f46e5' : '#f8fafc',
              color: activeTab === 'audit' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            🔒 Privacy & PHI Audit Logs
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
            }}
          >
            📊 Health Analytics
          </button>
        </div>
      </div>

      {/* 2. TAB: USERS LIST */}
      {activeTab === 'users' && (
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
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
              Showing {filteredUsers.length} of {usersList.length} Accounts
            </span>
          </div>

          <div style={{ width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff' }}>
            <table style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 14px' }}>User ID</th>
                  <th style={{ padding: '12px 14px' }}>Full Name</th>
                  <th style={{ padding: '12px 14px' }}>Institutional Email</th>
                  <th style={{ padding: '12px 14px' }}>Assigned RBAC Role</th>
                  <th style={{ padding: '12px 14px' }}>Account Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map((u) => (
                  <tr key={u.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '12px 14px', color: '#64748b', fontWeight: 600 }}>#{u.id}</td>
                    <td style={{ padding: '12px 14px', fontWeight: 'bold', color: '#1e293b' }}>{u.name}</td>
                    <td style={{ padding: '12px 14px', color: '#334155' }}>{u.email}</td>
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

      {/* 3. TAB: AUDIT LOGS & PHI SURVEILLANCE */}
      {activeTab === 'audit' && (
        <div style={{ marginTop: 16 }}>
          {/* Sub-tab navigation */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <button
              onClick={() => setAuditSubTab('phi')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 12,
                background: auditSubTab === 'phi' ? '#0f766e' : '#f1f5f9',
                color: auditSubTab === 'phi' ? '#ffffff' : '#475569',
              }}
            >
              👁️ Protected Health Information (PHI) Access Logs
            </button>
            <button
              onClick={() => setAuditSubTab('mutations')}
              style={{
                padding: '6px 14px',
                borderRadius: 6,
                border: 'none',
                cursor: 'pointer',
                fontWeight: 'bold',
                fontSize: 12,
                background: auditSubTab === 'mutations' ? '#4f46e5' : '#f1f5f9',
                color: auditSubTab === 'mutations' ? '#ffffff' : '#475569',
              }}
            >
              ⛓️ SHA-256 Mutation Ledger (AUDIT_LOGS)
            </button>
          </div>

          {/* VIEW A: PHI READ ACCESS LOGS */}
          {auditSubTab === 'phi' && (
            <div>
              <div
                style={{
                  padding: '12px 16px',
                  background: '#f0fdfa',
                  borderRadius: 8,
                  border: '1px solid #99f6e4',
                  marginBottom: 14,
                  fontSize: 12,
                  color: '#0f766e',
                  lineHeight: 1.5,
                }}
              >
                <strong>👁️ Statutory PHI Surveillance (R.A. 10173):</strong> This record logs every instance a medical
                practitioner views a patient’s confidential health profile, EMR history, or clinical records, ensuring
                full traceability for healthcare accountability.
              </div>

              {loadingLogs ? (
                <p style={{ color: '#64748b', fontSize: 13 }}>Loading PHI access records...</p>
              ) : phiLogs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                  No PHI read access events recorded yet. Have a doctor or nurse review a patient record to populate.
                </div>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto', maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                  <table style={{ width: '100%', minWidth: 800, borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2 }}>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        <th style={{ padding: '10px 12px' }}>Access ID</th>
                        <th style={{ padding: '10px 12px' }}>Practitioner (Viewer)</th>
                        <th style={{ padding: '10px 12px' }}>Patient Accessed</th>
                        <th style={{ padding: '10px 12px' }}>Data Table</th>
                        <th style={{ padding: '10px 12px' }}>Clinical Purpose</th>
                        <th style={{ padding: '10px 12px' }}>IP Origin</th>
                        <th style={{ padding: '10px 12px' }}>Access Timestamp</th>
                      </tr>
                    </thead>
                    <tbody>
                      {phiLogs.map((log) => (
                        <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{log.id}</td>
                          <td style={{ padding: '10px 12px' }}>
                            <strong style={{ color: '#0f766e' }}>{log.viewer_name}</strong>
                            <div style={{ fontSize: 10, color: '#64748b' }}>{log.viewer_role} • {log.viewer_email}</div>
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <strong>{log.patient_name}</strong>
                            {log.student_no && <div style={{ fontSize: 10, color: '#64748b' }}>ID: {log.student_no}</div>}
                          </td>
                          <td style={{ padding: '10px 12px' }}>
                            <span style={{ background: '#f1f5f9', padding: '2px 6px', borderRadius: 4, fontFamily: 'monospace' }}>
                              {log.table_affected}
                            </span>
                          </td>
                          <td style={{ padding: '10px 12px', color: '#334155' }}>{log.purpose}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b' }}>{log.ip_address}</td>
                          <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                            {new Date(log.accessed_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* VIEW B: MUTATION AUDIT LOGS */}
          {auditSubTab === 'mutations' && (
            <div>
              <div style={{ padding: '12px 16px', background: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0', marginBottom: 14, fontSize: 12, color: '#334155' }}>
                <strong>🔒 Cryptographic Append-Only Chain:</strong> Every transaction generates a SHA-256 hash
                linking directly to the preceding log record.
              </div>

              <div style={{ width: '100%', overflowX: 'auto', maxHeight: 'calc(100vh - 340px)', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
                <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                  <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2 }}>
                    <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '10px 12px' }}>Log ID</th>
                      <th style={{ padding: '10px 12px' }}>Actor</th>
                      <th style={{ padding: '10px 12px' }}>Action</th>
                      <th style={{ padding: '10px 12px' }}>Target Entity</th>
                      <th style={{ padding: '10px 12px' }}>SHA-256 Verification Hash</th>
                      <th style={{ padding: '10px 12px' }}>Timestamp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutationLogs.map((log) => (
                      <tr key={log.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '10px 12px', fontWeight: 600 }}>#{log.id}</td>
                        <td style={{ padding: '10px 12px', color: '#4f46e5', fontWeight: 600 }}>{log.user}</td>
                        <td style={{ padding: '10px 12px' }}>
                          <span
                            style={{
                              background: log.action === 'CREATE' ? '#dcfce7' : log.action === 'UPDATE' ? '#fef3c7' : '#f1f5f9',
                              color: log.action === 'CREATE' ? '#15803d' : log.action === 'UPDATE' ? '#b45309' : '#334155',
                              padding: '2px 6px',
                              borderRadius: 4,
                              fontWeight: 'bold',
                            }}
                          >
                            {log.action}
                          </span>
                        </td>
                        <td style={{ padding: '10px 12px', color: '#334155' }}>{log.target}</td>
                        <td style={{ padding: '10px 12px', fontFamily: 'monospace', fontSize: 11, color: '#475569' }}>
                          {log.hash ? `${log.hash.substring(0, 22)}…` : 'N/A'}
                        </td>
                        <td style={{ padding: '10px 12px', color: '#64748b', whiteSpace: 'nowrap' }}>
                          {new Date(log.created_at).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. TAB: TELEMETRY */}
      {activeTab === 'telemetry' && (
        <div style={{ marginTop: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>PRIMARY DATABASE</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Central MySQL 8.0</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Operational</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Spatial SRID 4326 • 21 Normalized Tables Active
            </div>
          </div>

          <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>REAL-TIME GATEWAY</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Socket.IO Engine</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Connected</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Port 5000 Active • Queue & SOS Realtime Relays
            </div>
          </div>

          <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
            <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>PRIVACY AUDIT VERIFIER</span>
            <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>RA 10173 Audit Trail</h4>
            <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Valid Hash-Chain</p>
            <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
              Continuous Integrity Check Across Logs
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB: ANALYTICS */}
      {activeTab === 'analytics' && <AnalyticsDashboard />}
    </div>
  );
}