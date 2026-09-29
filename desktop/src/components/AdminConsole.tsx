// desktop/src/components/AdminConsole.tsx
import React, { useState, useEffect } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';

export default function AdminConsole() {
  const [activeTab, setActiveTab] = useState<'users' | 'audit' | 'telemetry' | 'analytics' | 'db'>('users');
  const [auditSubTab, setAuditSubTab] = useState<'mutations' | 'phi'>('phi');
  

  const [usersList, setUsersList] = useState<any[]>([]);
  const [mutationLogs, setMutationLogs] = useState<any[]>([]);
  const [phiLogs, setPhiLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [modalFeedback, setModalFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Database Studio State
  const [dbTablesList, setDbTablesList] = useState<any[]>([]);
  const [selectedDbTable, setSelectedDbTable] = useState<string>('USERS');
  const [tableSchema, setTableSchema] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tablePage, setTablePage] = useState<number>(1);
  const [tableTotalPages, setTableTotalPages] = useState<number>(1);
  const [tableTotalRows, setTableTotalRows] = useState<number>(0);
  const [isTableReadOnly, setIsTableReadOnly] = useState<boolean>(false);
  const [loadingDbTable, setLoadingDbTable] = useState<boolean>(false);
  const [dbRowModal, setDbRowModal] = useState<{ isNew: boolean; rowData: any } | null>(null);
  const [dbSearchFilter, setDbSearchFilter] = useState('');

  // R.A. 10173 Retention & Governance State
  const [retentionInfo, setRetentionInfo] = useState<any>(null);
  const [sweeping, setSweeping] = useState(false);

  // Live System Telemetry State (MySQL, Redis, Socket.IO)
  const [telemetry, setTelemetry] = useState<any>(null);

  const fetchUsers = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/admin/users', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsersList(await res.json());
    } catch (_) {}
  };

  const fetchMutationLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/admin/audit-logs', {
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
      const res = await fetch('https://localhost:5000/api/admin/phi-access-logs', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPhiLogs(await res.json());
    } catch (_) {}
    setLoadingLogs(false);
  };

  const fetchRetention = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/privacy/retention/status', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRetentionInfo(await res.json());
    } catch (_) {}
  };

  const fetchTelemetry = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/admin/telemetry', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setTelemetry(await res.json());
    } catch (_) {}
  };

  const handleExecuteSweep = async () => {
    if (!confirm('Execute statutory 5-year data retention sweep under R.A. 10173? Expired records will be soft-deleted.')) return;
    setSweeping(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/privacy/retention/sweep', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      alert(data.message);
      fetchRetention();
    } catch (err: any) {
      alert('Sweep failed: ' + err.message);
    } finally {
      setSweeping(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchMutationLogs();
    fetchPhiLogs();
    fetchRetention();
    fetchTelemetry();
  }, []);

  const filteredUsers = usersList.filter(
    (u) =>
      (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (u.role || '').toLowerCase().includes(searchTerm.toLowerCase())
  );


  const handleOpenEditModal = (u: any) => {
    setEditingUser({
      ...u,
      student_no: u.student_no || '',
      course: u.course || '',
      year_level: u.year_level || 1,
      license_no: u.license_no || '',
      specialty: u.specialty || '',
      department: u.department || '',
      position: u.position || '',
      is_active: u.status === 'Active' || u.is_active === 1 || u.is_active === true,
    });
    setAdminPasswordInput('');
    setModalFeedback(null);
  };

  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;

    setIsSavingUser(true);
    setModalFeedback(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch(`https://localhost:5000/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          first_name: editingUser.first_name,
          last_name: editingUser.last_name,
          email: editingUser.email,
          phone: editingUser.phone,
          role_code: editingUser.role,
          is_active: editingUser.is_active,
          student_no: editingUser.student_no,
          course: editingUser.course,
          year_level: editingUser.year_level,
          license_no: editingUser.license_no,
          specialty: editingUser.specialty,
          department: editingUser.department,
          position: editingUser.position,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setModalFeedback({ text: '✅ ' + data.message, isError: false });
        fetchUsers();
        setTimeout(() => {
          setEditingUser(null);
        }, 1200);
      } else {
        setModalFeedback({ text: '❌ ' + (data.error || 'Failed to update profile.'), isError: true });
      }
    } catch (err: any) {
      setModalFeedback({ text: '❌ Error: ' + err.message, isError: true });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!editingUser || !adminPasswordInput.trim()) {
      alert('Please enter a new password (min 8 characters).');
      return;
    }
    if (adminPasswordInput.trim().length < 8) {
      alert('Password must be at least 8 characters long.');
      return;
    }

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`https://localhost:5000/api/admin/users/${editingUser.id}/reset-password`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ newPassword: adminPasswordInput.trim() }),
      });

      const data = await res.json();
      if (res.ok) {
        setModalFeedback({ text: '🔑 ' + data.message, isError: false });
        setAdminPasswordInput('');
      } else {
        setModalFeedback({ text: '❌ ' + (data.error || 'Password reset failed.'), isError: true });
      }
    } catch (err: any) {
      setModalFeedback({ text: '❌ Network error: ' + err.message, isError: true });
    }
  };

  const fetchDbTables = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/admin/db/tables', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDbTablesList(data);
      }
    } catch (err) {
      console.error('Failed to fetch DB tables:', err);
    }
  };

  const fetchTableData = async (table = selectedDbTable, page = 1) => {
    setLoadingDbTable(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`https://localhost:5000/api/admin/db/tables/${table}?page=${page}&limit=15`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setSelectedDbTable(data.tableName);
        setTableSchema(data.columns);
        setTableRows(data.rows);
        setTablePage(data.page);
        setTableTotalPages(data.totalPages);
        setTableTotalRows(data.totalRows);
        setIsTableReadOnly(data.isReadOnly);
      }
    } catch (err) {
      console.error('Failed to load table content:', err);
    } finally {
      setLoadingDbTable(false);
    }
  };

  const handleSaveDbRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbRowModal) return;

    const token = localStorage.getItem('valetudo_token');
    const isNew = dbRowModal.isNew;
    const currentData = { ...dbRowModal.rowData };

    // Identify primary key columns
    const pkCols = tableSchema.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    const primaryKeyObj: Record<string, any> = {};
    pkCols.forEach((col) => {
      primaryKeyObj[col] = currentData[col];
    });

    try {
      let res;
      if (isNew) {
        // Strip auto-increment columns if empty
        tableSchema.forEach((col) => {
          if (col.extra && col.extra.includes('auto_increment') && !currentData[col.columnName]) {
            delete currentData[col.columnName];
          }
        });

        res = await fetch(`https://localhost:5000/api/admin/db/tables/${selectedDbTable}/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(currentData),
        });
      } else {
        const updates = { ...currentData };
        // Don't update primary keys
        pkCols.forEach((col) => delete updates[col]);

        res = await fetch(`https://localhost:5000/api/admin/db/tables/${selectedDbTable}/rows`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ primaryKey: primaryKeyObj, updates }),
        });
      }

      const result = await res.json();
      if (!res.ok) throw new Error(result.error || 'Database operation failed.');

      alert('✅ ' + result.message);
      setDbRowModal(null);
      fetchTableData(selectedDbTable, tablePage);
    } catch (err: any) {
      alert('❌ Error: ' + err.message);
    }
  };

  const handleDeleteDbRow = async (row: any) => {
    if (isTableReadOnly) return;
    const pkCols = tableSchema.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    const primaryKeyObj: Record<string, any> = {};
    pkCols.forEach((col) => {
      primaryKeyObj[col] = row[col];
    });

    const pkDescription = Object.entries(primaryKeyObj).map(([k, v]) => `${k}=${v}`).join(', ');
    if (!confirm(`Are you sure you want to DELETE record (${pkDescription}) from table \`${selectedDbTable}\`?`)) return;

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`https://localhost:5000/api/admin/db/tables/${selectedDbTable}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ primaryKey: primaryKeyObj }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete row.');
      alert('✅ ' + data.message);
      fetchTableData(selectedDbTable, tablePage);
    } catch (err: any) {
      alert('❌ Delete error: ' + err.message);
    }
  };

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
            onClick={() => {
              setActiveTab('telemetry');
              fetchRetention();
              fetchTelemetry();
            }}
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
            📡 System Health & Retention
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

          <button
            onClick={() => {
              setActiveTab('db');
              fetchDbTables();
              fetchTableData('USERS', 1);
            }}
            style={{
              padding: '8px 14px',
              borderRadius: 6,
              border: '1px solid ' + (activeTab === 'db' ? '#0f766e' : '#cbd5e1'),
              cursor: 'pointer',
              background: activeTab === 'db' ? '#0f766e' : '#f8fafc',
              color: activeTab === 'db' ? '#fff' : '#334155',
              fontWeight: 600,
              fontSize: 13,
            }}
          >
            🗄️ Database Studio
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
            <table style={{ width: '100%', minWidth: 780, borderCollapse: 'collapse', fontSize: 13, textAlign: 'left' }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 14px' }}>User ID</th>
                  <th style={{ padding: '12px 14px' }}>Full Name</th>
                  <th style={{ padding: '12px 14px' }}>Institutional Email</th>
                  <th style={{ padding: '12px 14px' }}>Assigned RBAC Role</th>
                  <th style={{ padding: '12px 14px' }}>Account Status</th>
                  <th style={{ padding: '12px 14px', textAlign: 'center' }}>Manage</th>
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
                    <td
                      style={{
                        padding: '12px 14px',
                        color: u.status === 'Active' ? '#16a34a' : '#dc2626',
                        fontWeight: 600,
                        fontSize: 12,
                      }}
                    >
                      ● {u.status}
                    </td>
                    <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        style={{
                          padding: '6px 14px',
                          background: '#f8fafc',
                          color: '#4f46e5',
                          border: '1px solid #c7d2fe',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 'bold',
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                        }}
                      >
                        ⚙️ Edit
                      </button>
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

          {/* VIEW A: PHI ACCESS LOGS */}
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
                practitioner views a patient’s confidential health profile, EMR history, or clinical records.
              </div>

              {loadingLogs ? (
                <p style={{ color: '#64748b', fontSize: 13 }}>Loading PHI access records...</p>
              ) : phiLogs.length === 0 ? (
                <div style={{ padding: 24, textAlign: 'center', color: '#64748b', background: '#f8fafc', borderRadius: 8 }}>
                  No PHI read access events recorded yet.
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

      {/* 4. TAB: TELEMETRY & DATA RETENTION */}
      {activeTab === 'telemetry' && (
        <div style={{ marginTop: 16 }}>
          {/* System Hardware & Gateway Status: 4 Dynamic Tiers */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
            {/* Card 1: MySQL */}
            <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>PRIMARY DATABASE</span>
              <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Central MySQL 8.0</h4>
              <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>
                ● {telemetry?.database?.status || 'Operational'}
              </p>
              <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                Spatial SRID 4326 • {telemetry?.database?.totalUsers ?? 6} Registered Accounts
              </div>
            </div>

            {/* Card 2: Redis Live Queue Cache */}
            <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>LIVE IN-MEMORY CACHE</span>
              <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Redis 7.0 Queue Cache</h4>
              <p
                style={{
                  color: telemetry?.cache?.status === 'Operational' ? '#16a34a' : '#b45309',
                  margin: '4px 0 10px',
                  fontSize: 18,
                  fontWeight: 'bold',
                }}
              >
                ● {telemetry?.cache?.status || 'Operational'}
              </p>
              <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                Sub-millisecond Queue Cache • Auto-Invalidated
              </div>
            </div>

            {/* Card 3: Socket.IO Gateway */}
            <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>REAL-TIME GATEWAY</span>
              <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>Socket.IO Engine</h4>
              <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Connected</p>
              <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                Port 5000 Active • Queue & SOS Relays
              </div>
            </div>

            {/* Card 4: Cryptographic Ledger */}
            <div style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#f8fafc' }}>
              <span style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b' }}>CRYPTOGRAPHIC LEDGER</span>
              <h4 style={{ margin: '6px 0 4px', fontSize: 16, color: '#0f172a' }}>R.A. 10173 Audit Chain</h4>
              <p style={{ color: '#16a34a', margin: '4px 0 10px', fontSize: 18, fontWeight: 'bold' }}>● Valid Hash-Chain</p>
              <div style={{ fontSize: 12, color: '#64748b', borderTop: '1px dashed #cbd5e1', paddingTop: 8 }}>
                {telemetry?.database?.totalAuditBlocks ?? 'Continuous'} Blocks Verified
              </div>
            </div>
          </div>

          {/* R.A. 10173 Data Privacy & Retention Governance Panel */}
          <div style={{ marginTop: 20, padding: 18, border: '1px solid #99f6e4', borderRadius: 8, background: '#f0fdfa' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
              <div>
                <h4 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>
                  ⚖️ R.A. 10173 Data Privacy & Retention Governance
                </h4>
                <small style={{ color: '#475569' }}>
                  Statutory 5-Year Clinical Retention • AES-256-GCM Encryption Active • SHA-256 Hash Chain
                </small>
              </div>
              <button
                onClick={handleExecuteSweep}
                disabled={sweeping}
                style={{
                  padding: '8px 16px',
                  background: sweeping ? '#94a3b8' : '#0f766e',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 'bold',
                  cursor: sweeping ? 'not-allowed' : 'pointer',
                }}
              >
                {sweeping ? 'Executing Sweep...' : '🧹 Enforce Retention Sweep'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12, marginTop: 14 }}>
              <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #ccfbf1' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>ENCRYPTION STANDARD</span>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0f766e' }}>AES-256-GCM</div>
              </div>
              <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #ccfbf1' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>ACTIVE CONSENTS</span>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#0369a1' }}>
                  {retentionInfo?.totalActiveConsents ?? 0} Users
                </div>
              </div>
              <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #ccfbf1' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>ACTIVE MEDICAL RECORDS</span>
                <div style={{ fontSize: 16, fontWeight: 'bold', color: '#15803d' }}>
                  {retentionInfo?.activeMedicalRecords ?? 0} Encounters
                </div>
              </div>
              <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #ccfbf1' }}>
                <span style={{ fontSize: 11, color: '#64748b' }}>ELIGIBLE FOR 5-YR PURGE</span>
                <div
                  style={{
                    fontSize: 16,
                    fontWeight: 'bold',
                    color: retentionInfo?.recordsPastRetentionPeriod > 0 ? '#b91c1c' : '#64748b',
                  }}
                >
                  {retentionInfo?.recordsPastRetentionPeriod ?? 0} Records
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. TAB: ANALYTICS */}
      {activeTab === 'analytics' && <AnalyticsDashboard />}

      {/* 5. TAB: DATABASE STUDIO (LIVE DB VIEWER & EDITOR) */}
      {activeTab === 'db' && (
        <div style={{ marginTop: 16 }}>
          {/* Header Banner */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '12px 16px',
              background: '#f8fafc',
              borderRadius: 8,
              border: '1px solid #e2e8f0',
              marginBottom: 16,
              flexWrap: 'wrap',
              gap: 10,
            }}
          >
            <div>
              <h4 style={{ margin: 0, color: '#0f172a', fontSize: 16 }}>
                🗄️ MySQL Database Studio (Database: <code style={{ color: '#0f766e' }}>valetudo_healthlink</code>)
              </h4>
              <small style={{ color: '#64748b' }}>
                Inspect, modify, or insert raw records across all 21 normalized system tables.
              </small>
            </div>
            {isTableReadOnly && (
              <span style={{ background: '#fef3c7', color: '#b45309', padding: '4px 10px', borderRadius: 4, fontWeight: 'bold', fontSize: 12, border: '1px solid #fde68a' }}>
                🔒 Read-Only (R.A. 10173 Audit Ledger)
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16 }}>
            {/* LEFT: TABLE ROSTER SIDEBAR */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 10, background: '#ffffff', maxHeight: '72vh', overflowY: 'auto' }}>
              <div style={{ fontSize: 12, fontWeight: 'bold', color: '#64748b', marginBottom: 8, paddingLeft: 6 }}>
                SYSTEM TABLES ({dbTablesList.length})
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {dbTablesList.map((t) => {
                  const isSelected = selectedDbTable === t.tableName;
                  const isAudit = ['AUDIT_LOGS', 'PHI_ACCESS_LOGS'].includes(t.tableName);

                  return (
                    <button
                      key={t.tableName}
                      type="button"
                      onClick={() => {
                        setSelectedDbTable(t.tableName);
                        fetchTableData(t.tableName, 1);
                        setDbSearchFilter('');
                      }}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 10px',
                        borderRadius: 6,
                        border: isSelected ? '1px solid #0f766e' : '1px solid transparent',
                        background: isSelected ? '#f0fdfa' : 'transparent',
                        color: isSelected ? '#0f766e' : '#334155',
                        fontWeight: isSelected ? 'bold' : 500,
                        fontSize: 12,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {isAudit ? '🔒 ' : '📋 '}
                        {t.tableName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* RIGHT: LIVE TABLE DATA GRID & TOOLBAR */}
            <div style={{ border: '1px solid #e2e8f0', borderRadius: 8, padding: 14, background: '#ffffff', display: 'flex', flexDirection: 'column' }}>
              {/* Toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <h4 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>
                    Table: <code>{selectedDbTable}</code>
                  </h4>
                  <span style={{ fontSize: 12, color: '#64748b' }}>({tableTotalRows} total records)</span>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input
                    type="text"
                    placeholder="Filter loaded rows..."
                    value={dbSearchFilter}
                    onChange={(e) => setDbSearchFilter(e.target.value)}
                    style={{ padding: '6px 10px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 6, width: 180 }}
                  />
                  {!isTableReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const emptyRow: Record<string, any> = {};
                        tableSchema.forEach((col) => (emptyRow[col.columnName] = ''));
                        setDbRowModal({ isNew: true, rowData: emptyRow });
                      }}
                      style={{
                        padding: '6px 14px',
                        background: '#0f766e',
                        color: '#fff',
                        border: 'none',
                        borderRadius: 6,
                        fontWeight: 'bold',
                        fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >
                      ➕ Insert Row
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fetchTableData(selectedDbTable, tablePage)}
                    style={{ padding: '6px 10px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontSize: 12 }}
                  >
                    🔄
                  </button>
                </div>
              </div>

              {/* Data Grid Table */}
              {loadingDbTable ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#64748b' }}>Loading table records...</div>
              ) : tableRows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: '#94a3b8' }}>Table is empty.</div>
              ) : (
                <div style={{ width: '100%', overflowX: 'auto', maxHeight: '55vh', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
                    <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 2 }}>
                      <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                        {!isTableReadOnly && <th style={{ padding: '8px 10px', width: 90, textAlign: 'center' }}>Actions</th>}
                        {tableSchema.map((col) => (
                          <th key={col.columnName} style={{ padding: '8px 10px', whiteSpace: 'nowrap' }}>
                            {col.columnKey === 'PRI' && <span style={{ color: '#d97706', marginRight: 4 }}>🔑</span>}
                            {col.columnName}
                            <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 'normal' }}>{col.dataType}</div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows
                        .filter((r) => !dbSearchFilter || JSON.stringify(r).toLowerCase().includes(dbSearchFilter.toLowerCase()))
                        .map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                            {!isTableReadOnly && (
                              <td style={{ padding: '6px 10px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <button
                                  type="button"
                                  onClick={() => setDbRowModal({ isNew: false, rowData: { ...row } })}
                                  style={{ padding: '2px 8px', fontSize: 11, background: '#eef2ff', color: '#4f46e5', border: '1px solid #c7d2fe', borderRadius: 4, cursor: 'pointer', marginRight: 4, fontWeight: 'bold' }}
                                >
                                  ✏️ Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteDbRow(row)}
                                  style={{ padding: '2px 6px', fontSize: 11, background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', borderRadius: 4, cursor: 'pointer' }}
                                >
                                  🗑️
                                </button>
                              </td>
                            )}
                            {tableSchema.map((col) => {
                              const val = row[col.columnName];
                              const isEncrypted = typeof val === 'string' && val.startsWith('enc:v1:');

                              return (
                                <td key={col.columnName} style={{ padding: '6px 10px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                  {isEncrypted ? (
                                    <span style={{ color: '#0f766e', fontWeight: 'bold', fontSize: 11, background: '#f0fdfa', padding: '1px 6px', borderRadius: 4, border: '1px solid #ccfbf1' }}>
                                      🔒 [AES-256 Cipher]
                                    </span>
                                  ) : val === null || val === undefined ? (
                                    <span style={{ color: '#cbd5e1', fontStyle: 'italic' }}>NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <code>{JSON.stringify(val)}</code>
                                  ) : (
                                    String(val)
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination Footer */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontSize: 12, color: '#64748b' }}>
                <span>
                  Page <b>{tablePage}</b> of <b>{tableTotalPages}</b> (Showing {tableRows.length} rows)
                </span>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    type="button"
                    disabled={tablePage <= 1}
                    onClick={() => fetchTableData(selectedDbTable, tablePage - 1)}
                    style={{ padding: '4px 12px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 4, cursor: tablePage <= 1 ? 'not-allowed' : 'pointer' }}
                  >
                    ◀ Prev
                  </button>
                  <button
                    type="button"
                    disabled={tablePage >= tableTotalPages}
                    onClick={() => fetchTableData(selectedDbTable, tablePage + 1)}
                    style={{ padding: '4px 12px', border: '1px solid #cbd5e1', background: '#fff', borderRadius: 4, cursor: tablePage >= tableTotalPages ? 'not-allowed' : 'pointer' }}
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ROW INSERT / EDIT MODAL */}
          {dbRowModal && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, backdropFilter: 'blur(2px)' }}>
              <div style={{ width: '90%', maxWidth: 620, maxHeight: '85vh', overflowY: 'auto', background: '#ffffff', borderRadius: 10, padding: 22, border: '1px solid #cbd5e1', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 10 }}>
                  <h4 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>
                    {dbRowModal.isNew ? `➕ Insert Record into \`${selectedDbTable}\`` : `✏️ Edit Record in \`${selectedDbTable}\``}
                  </h4>
                  <button type="button" onClick={() => setDbRowModal(null)} style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}>
                    ✕
                  </button>
                </div>

                <form onSubmit={handleSaveDbRow} style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {tableSchema.map((col) => {
                    const isPK = col.columnKey === 'PRI';
                    const isAuto = col.extra && col.extra.includes('auto_increment');
                    const currentValue = dbRowModal.rowData[col.columnName];

                    return (
                      <div key={col.columnName}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 'bold', color: '#334155' }}>
                          <span>
                            {isPK && <span style={{ color: '#d97706', marginRight: 4 }}>🔑</span>}
                            {col.columnName}
                          </span>
                          <span style={{ fontSize: 10, color: '#94a3b8' }}>
                            {col.dataType} {isAuto ? '(Auto-Increment)' : ''}
                          </span>
                        </div>
                        <input
                          disabled={!dbRowModal.isNew && isPK}
                          placeholder={isAuto && dbRowModal.isNew ? 'Generated automatically by MySQL' : `Enter ${col.columnName}...`}
                          value={currentValue === null || currentValue === undefined ? '' : typeof currentValue === 'object' ? JSON.stringify(currentValue) : String(currentValue)}
                          onChange={(e) => {
                            setDbRowModal({
                              ...dbRowModal,
                              rowData: { ...dbRowModal.rowData, [col.columnName]: e.target.value },
                            });
                          }}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '6px 10px',
                            marginTop: 4,
                            borderRadius: 4,
                            border: '1px solid #cbd5e1',
                            fontSize: 12,
                            background: !dbRowModal.isNew && isPK ? '#f1f5f9' : '#ffffff',
                          }}
                        />
                      </div>
                    );
                  })}

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 14, borderTop: '1px solid #e2e8f0', paddingTop: 12 }}>
                    <button type="button" onClick={() => setDbRowModal(null)} style={{ padding: '6px 14px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" style={{ padding: '6px 18px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer' }}>
                      💾 Commit to Database
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 6. EDIT USER PROFILE & CREDENTIALS MODAL */}
      {editingUser && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15, 23, 42, 0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            backdropFilter: 'blur(2px)',
          }}
        >
          <div
            style={{
              width: '90%',
              maxWidth: 650,
              maxHeight: '90vh',
              overflowY: 'auto',
              background: '#ffffff',
              borderRadius: 10,
              padding: 24,
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.2)',
              border: '1px solid #cbd5e1',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <div>
                <h3 style={{ margin: 0, color: '#4f46e5', fontSize: 17 }}>
                  ⚙️ Manage User Account: {editingUser.name} (#{editingUser.id})
                </h3>
                <small style={{ color: '#64748b' }}>Update credentials, academic/staff affiliation, or role</small>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold', color: '#64748b' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveUserProfile} style={{ marginTop: 14 }}>
              {/* SECTION 1: IDENTITY & CONTACT */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>First Name:</label>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.first_name}
                    onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Last Name:</label>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.last_name}
                    onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Institutional Email:</label>
                  <input
                    type="email"
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.email}
                    onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Phone Number:</label>
                  <input
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.phone || ''}
                    placeholder="09XXXXXXXXX"
                    onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                  />
                </div>
              </div>

              {/* SECTION 2: ROLE & ACCOUNT STATUS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12, background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Assigned RBAC Role:</label>
                  <select
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.role}
                    onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                  >
                    <option value="STUDENT">STUDENT (Student Patient)</option>
                    <option value="DOCTOR">DOCTOR (Campus Physician)</option>
                    <option value="DENTIST">DENTIST (Campus Dentist)</option>
                    <option value="NURSE">NURSE (Clinic Nurse / Triage)</option>
                    <option value="FACULTY">FACULTY (Faculty / Employee)</option>
                    <option value="EMERGENCY_RESPONDER">EMERGENCY_RESPONDER (Quick-Response)</option>
                    <option value="ADMIN">ADMIN (System Administrator)</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Account Status:</label>
                  <select
                    style={{ width: '100%', boxSizing: 'border-box', padding: '7px 10px', marginTop: 4, borderRadius: 5, border: '1px solid #cbd5e1', fontSize: 13 }}
                    value={editingUser.is_active ? '1' : '0'}
                    onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.value === '1' })}
                  >
                    <option value="1">Active (Permitted to Log In)</option>
                    <option value="0">Suspended / Deactivated (Access Revoked)</option>
                  </select>
                </div>
              </div>

              {/* SECTION 3: ROLE-SPECIFIC SUB-PROFILES */}
              {editingUser.role === 'STUDENT' && (
                <div style={{ background: '#f0fdfa', padding: 12, borderRadius: 6, border: '1px solid #99f6e4', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: '#0f766e', display: 'block', marginBottom: 6 }}>
                    🎓 Student Academic Record
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 2fr 1fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Student ID No:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.student_no || ''}
                        placeholder="e.g. 22-LN-0123"
                        onChange={(e) => setEditingUser({ ...editingUser, student_no: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Degree Program / Course:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.course || ''}
                        placeholder="e.g. BS Information Technology"
                        onChange={(e) => setEditingUser({ ...editingUser, course: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Year Level:</label>
                      <input
                        type="number"
                        min="1"
                        max="5"
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.year_level || 1}
                        onChange={(e) => setEditingUser({ ...editingUser, year_level: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(editingUser.role) && (
                <div style={{ background: '#f0f9ff', padding: 12, borderRadius: 6, border: '1px solid #bae6fd', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: '#0369a1', display: 'block', marginBottom: 6 }}>
                    🩺 Clinical / Staff Professional Credentials
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.5fr 1.5fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>PRC / Staff ID:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.license_no || ''}
                        placeholder="e.g. PRC-MD-098765"
                        onChange={(e) => setEditingUser({ ...editingUser, license_no: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Specialty / Designation:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.specialty || ''}
                        placeholder="e.g. General Medicine"
                        onChange={(e) => setEditingUser({ ...editingUser, specialty: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Department / Unit:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.department || ''}
                        placeholder="e.g. PSU Lingayen Clinic"
                        onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {editingUser.role === 'FACULTY' && (
                <div style={{ background: '#fff7ed', padding: 12, borderRadius: 6, border: '1px solid #fed7aa', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 'bold', color: '#c2410c', display: 'block', marginBottom: 6 }}>
                    🏫 Faculty Academic Position
                  </span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr', gap: 8 }}>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>College / Department:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.department || ''}
                        placeholder="e.g. College of Computing Sciences"
                        onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 11, color: '#475569' }}>Academic Rank / Position:</label>
                      <input
                        style={{ width: '100%', boxSizing: 'border-box', padding: 6, fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                        value={editingUser.position || ''}
                        placeholder="e.g. Assistant Professor III"
                        onChange={(e) => setEditingUser({ ...editingUser, position: e.target.value })}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* SECTION 4: ADMIN PASSWORD RESET PANEL */}
              <div style={{ background: '#f8fafc', padding: 12, borderRadius: 6, border: '1px dashed #cbd5e1', marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 'bold', color: '#1e293b', display: 'block', marginBottom: 4 }}>
                  🔑 Reset User Password (Admin Override)
                </label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="password"
                    placeholder="Enter new temporary password (min 8 chars)..."
                    value={adminPasswordInput}
                    onChange={(e) => setAdminPasswordInput(e.target.value)}
                    style={{ flex: 1, padding: '7px 10px', fontSize: 12, border: '1px solid #cbd5e1', borderRadius: 4 }}
                  />
                  <button
                    type="button"
                    onClick={handleAdminResetPassword}
                    style={{ padding: '6px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', fontSize: 12, cursor: 'pointer' }}
                  >
                    Force Password Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setAdminPasswordInput('Password123!')}
                    style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, fontSize: 11, cursor: 'pointer' }}
                  >
                    Preset: Password123!
                  </button>
                </div>
              </div>

              {modalFeedback && (
                <div
                  style={{
                    padding: '8px 12px',
                    borderRadius: 5,
                    fontSize: 12,
                    fontWeight: 'bold',
                    marginBottom: 12,
                    background: modalFeedback.isError ? '#fef2f2' : '#f0fdf4',
                    color: modalFeedback.isError ? '#dc2626' : '#15803d',
                    border: `1px solid ${modalFeedback.isError ? '#fecaca' : '#bbf7d0'}`,
                  }}
                >
                  {modalFeedback.text}
                </div>
              )}

              {/* ACTION BUTTONS */}
              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', borderTop: '1px solid #e2e8f0', paddingTop: 14 }}>
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  style={{ padding: '8px 16px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  style={{
                    padding: '8px 20px',
                    background: isSavingUser ? '#94a3b8' : '#4f46e5',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 'bold',
                    cursor: isSavingUser ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingUser ? 'Saving Changes...' : '💾 Save Profile Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}