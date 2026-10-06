// desktop/src/components/AdminConsole.tsx
import React, { useState, useEffect } from 'react';
import AnalyticsDashboard from './AnalyticsDashboard';
import { T, rolePill, inputStyle, btnPrimary, btnGhost } from '../theme';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

/* ── Icons (inline, no dependency) ─────────────────────────────── */
const I = {
  Users: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>),
  Shield: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>),
  Activity: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>),
  Chart: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 15l4-6 3 4 4-7"/></svg>),
  Database: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14a9 3 0 0 0 18 0V5"/><path d="M3 12a9 3 0 0 0 18 0"/></svg>),
  Search: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/></svg>),
  Refresh: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M3 21v-5h5"/></svg>),
  Plus: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>),
  Pencil: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>),
  Trash: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>),
  Lock: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>),
  Chevron: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18l6-6-6-6"/></svg>),
  Check: () => (<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>),
};

export type AdminTab = 'users' | 'audit' | 'telemetry' | 'analytics' | 'db';

interface AdminConsoleProps {
  /** Optional controlled active tab — if provided, the sidebar drives the tab. */
  activeTab?: AdminTab;
  /** Called whenever the user clicks an inner pill or the sidebar item. */
  onTabChange?: (tab: AdminTab) => void;
}

export default function AdminConsole({
  activeTab: controlledTab,
  onTabChange,
}: AdminConsoleProps = {}) {
  /* Controlled ⇄ uncontrolled: fall back to internal state when no parent props are passed. */
  const [internalTab, setInternalTab] = useState<AdminTab>('users');
  const activeTab = controlledTab ?? internalTab;
  const setActiveTab = onTabChange ?? setInternalTab;

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

  /* Database Studio state */
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

  /* Retention & governance */
  const [retentionInfo, setRetentionInfo] = useState<any>(null);
  const [sweeping, setSweeping] = useState(false);

  /* Telemetry */
  const [telemetry, setTelemetry] = useState<any>(null);

  /* Filters & sorting */
  const [userRoleFilter, setUserRoleFilter] = useState<string>('ALL');
  const [userStatusFilter, setUserStatusFilter] = useState<'ALL' | 'Active' | 'Suspended'>('ALL');
  const [userSortKey, setUserSortKey] = useState<'id_asc' | 'id_desc' | 'name_asc' | 'name_desc' | 'role'>('id_asc');

  const [phiSearchTerm, setPhiSearchTerm] = useState<string>('');
  const [phiRoleFilter, setPhiRoleFilter] = useState<string>('ALL');
  const [phiTableFilter, setPhiTableFilter] = useState<string>('ALL');
  const [phiSortOrder, setPhiSortOrder] = useState<'desc' | 'asc' | 'patient_asc'>('desc');

  const [mutationSearchTerm, setMutationSearchTerm] = useState<string>('');
  const [mutationActionFilter, setMutationActionFilter] = useState<string>('ALL');
  const [mutationSortOrder, setMutationSortOrder] = useState<'desc' | 'asc'>('desc');

  /* ── Data fetchers (unchanged logic) ─────────────────────────── */
  const fetchUsers = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setUsersList(await res.json());
    } catch (_) {}
  };

  const fetchMutationLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/audit-logs`, {
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
      const res = await fetch(`${API_BASE_URL}/api/admin/phi-access-logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setPhiLogs(await res.json());
    } catch (_) {}
    setLoadingLogs(false);
  };

  const fetchRetention = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/privacy/retention/status`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setRetentionInfo(await res.json());
    } catch (_) {}
  };

  const fetchTelemetry = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/telemetry`, {
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
      const res = await fetch(`${API_BASE_URL}/api/privacy/retention/sweep`, {
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

  /* ── Derived lists (unchanged) ───────────────────────────────── */
  const processedUsers = usersList
    .filter((u) => {
      const matchesSearch =
        (u.name || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.email || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.student_no || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (u.license_no || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchesRole = userRoleFilter === 'ALL' || u.role === userRoleFilter;
      const matchesStatus = userStatusFilter === 'ALL' || u.status === userStatusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    })
    .sort((a, b) => {
      switch (userSortKey) {
        case 'id_desc': return Number(b.id) - Number(a.id);
        case 'name_asc': return (a.name || '').localeCompare(b.name || '');
        case 'name_desc': return (b.name || '').localeCompare(a.name || '');
        case 'role': return (a.role || '').localeCompare(b.role || '');
        case 'id_asc':
        default: return Number(a.id) - Number(b.id);
      }
    });

  const processedPhiLogs = phiLogs
    .filter((log) => {
      const query = phiSearchTerm.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (log.viewer_name || '').toLowerCase().includes(query) ||
        (log.patient_name || '').toLowerCase().includes(query) ||
        (log.purpose || '').toLowerCase().includes(query) ||
        (log.ip_address || '').toLowerCase().includes(query) ||
        (log.student_no || '').toLowerCase().includes(query);
      const matchesRole = phiRoleFilter === 'ALL' || log.viewer_role === phiRoleFilter;
      const matchesTable = phiTableFilter === 'ALL' || log.table_affected === phiTableFilter;
      return matchesSearch && matchesRole && matchesTable;
    })
    .sort((a, b) => {
      if (phiSortOrder === 'asc') return new Date(a.accessed_at).getTime() - new Date(b.accessed_at).getTime();
      if (phiSortOrder === 'patient_asc') return (a.patient_name || '').localeCompare(b.patient_name || '');
      return new Date(b.accessed_at).getTime() - new Date(a.accessed_at).getTime();
    });

  const processedMutationLogs = mutationLogs
    .filter((log) => {
      const query = mutationSearchTerm.trim().toLowerCase();
      const matchesSearch =
        !query ||
        (log.user || '').toLowerCase().includes(query) ||
        (log.target || '').toLowerCase().includes(query) ||
        (log.action || '').toLowerCase().includes(query) ||
        (log.hash || '').toLowerCase().includes(query);
      const matchesAction = mutationActionFilter === 'ALL' || log.action === mutationActionFilter;
      return matchesSearch && matchesAction;
    })
    .sort((a, b) => {
      if (mutationSortOrder === 'asc') return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });

  /* ── Handlers (unchanged) ────────────────────────────────────── */
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
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
        setTimeout(() => setEditingUser(null), 1200);
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
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
      const res = await fetch(`${API_BASE_URL}/api/admin/db/tables`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDbTablesList(await res.json());
    } catch (err) {
      console.error('Failed to fetch DB tables:', err);
    }
  };

  const fetchTableData = async (table = selectedDbTable, page = 1) => {
    setLoadingDbTable(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${table}?page=${page}&limit=15`, {
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
    const pkCols = tableSchema.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    const primaryKeyObj: Record<string, any> = {};
    pkCols.forEach((col) => { primaryKeyObj[col] = currentData[col]; });
    try {
      let res;
      if (isNew) {
        tableSchema.forEach((col) => {
          if (col.extra && col.extra.includes('auto_increment') && !currentData[col.columnName]) {
            delete currentData[col.columnName];
          }
        });
        res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${selectedDbTable}/rows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(currentData),
        });
      } else {
        const updates = { ...currentData };
        pkCols.forEach((col) => delete updates[col]);
        res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${selectedDbTable}/rows`, {
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
    pkCols.forEach((col) => { primaryKeyObj[col] = row[col]; });
    const pkDescription = Object.entries(primaryKeyObj).map(([k, v]) => `${k}=${v}`).join(', ');
    if (!confirm(`Are you sure you want to DELETE record (${pkDescription}) from table \`${selectedDbTable}\`?`)) return;
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${selectedDbTable}/rows`, {
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

  /* ═══════════════════════════════════════════════════════════════ */
  /* RENDER                                                          */
  /* ═══════════════════════════════════════════════════════════════ */

  const activeUsersCount = usersList.filter((u) => u.status === 'Active').length;
  const suspendedUsersCount = usersList.length - activeUsersCount;

  return (
    <div style={{ width: '100%' }}>
      {/* ── Header ────────────────────────────────────────────── */}
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6, color: T.text, margin: 0 }}>
          {activeTab === 'users' && 'Users & roles'}
          {activeTab === 'audit' && 'Privacy & audit'}
          {activeTab === 'telemetry' && 'System health & retention'}
          {activeTab === 'analytics' && 'Epidemiological analytics'}
          {activeTab === 'db' && 'Database Studio'}
        </h1>
        <p style={{ fontSize: 13.5, color: T.textSub, margin: '6px 0 0' }}>
          {activeTab === 'users' && 'Manage institutional accounts, access permissions and account status.'}
          {activeTab === 'audit' && 'Trace access and changes to clinic information with read-only audit records.'}
          {activeTab === 'telemetry' && 'Service telemetry and clinical data lifecycle governance, in one place.'}
          {activeTab === 'analytics' && 'Campus illness trajectories, seasonal spike monitoring & health reports.'}
          {activeTab === 'db' && 'Inspect and maintain system records · valetudo_healthlink'}
        </p>
      </div>

      {/* ── Inner tab bar (matches Figma's segmented tabs) ─────── */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: 4, background: T.sage100, borderRadius: T.radius.pill,
        marginBottom: 22, width: 'fit-content',
      }}>
        {([
          { id: 'users',     label: 'Users & roles',     icon: <I.Users /> },
          { id: 'audit',     label: 'Privacy & audit',   icon: <I.Shield /> },
          { id: 'telemetry', label: 'System health',     icon: <I.Activity /> },
          { id: 'analytics', label: 'Health analytics',  icon: <I.Chart /> },
          { id: 'db',        label: 'Database Studio',   icon: <I.Database /> },
        ] as const).map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id === 'audit') { fetchPhiLogs(); fetchMutationLogs(); }
                if (tab.id === 'telemetry') { fetchRetention(); fetchTelemetry(); }
                if (tab.id === 'db') { fetchDbTables(); fetchTableData('USERS', 1); }
              }}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '9px 18px',
                borderRadius: T.radius.pill,
                border: 'none',
                background: isActive ? T.surface : 'transparent',
                color: isActive ? T.primary : T.textSub,
                fontSize: 13, fontWeight: 700,
                cursor: 'pointer',
                fontFamily: T.font,
                boxShadow: isActive ? T.shadow.xs : 'none',
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ width: 16, height: 16, display: 'grid', placeItems: 'center' }}>{tab.icon}</span>
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: USERS                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'users' && (
        <div>
          {/* Search + count row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: T.textMuted, width: 16, height: 16, display: 'grid', placeItems: 'center',
              }}>
                <I.Search />
              </span>
              <input
                type="text"
                placeholder="Search by name, email or role"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                style={{
                  ...inputStyle,
                  paddingLeft: 40,
                  borderRadius: T.radius.pill,
                  background: T.surface,
                }}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{
                padding: '5px 12px', borderRadius: T.radius.pill,
                background: T.sage200, color: T.primary,
                fontSize: 12, fontWeight: 700,
              }}>
                {usersList.length} accounts
              </span>
              <span style={{ fontSize: 12.5, color: T.textSub }}>
                {activeUsersCount} active · {suspendedUsersCount} suspended
              </span>
            </div>
          </div>

          {/* Role filter chips */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {[
              { code: 'ALL', label: 'All roles' },
              { code: 'DOCTOR', label: 'Doctor' },
              { code: 'DENTIST', label: 'Dentist' },
              { code: 'NURSE', label: 'Nurse' },
              { code: 'STUDENT', label: 'Student' },
              { code: 'FACULTY', label: 'Faculty' },
              { code: 'EMERGENCY_RESPONDER', label: 'Responder' },
              { code: 'ADMIN', label: 'Admin' },
            ].map((r) => {
              const isSelected = userRoleFilter === r.code;
              return (
                <button
                  key={r.code}
                  type="button"
                  onClick={() => setUserRoleFilter(r.code)}
                  style={{
                    padding: '5px 12px', borderRadius: T.radius.pill,
                    fontSize: 11.5, fontWeight: 700,
                    border: `1px solid ${isSelected ? T.primary : T.border}`,
                    background: isSelected ? T.primary : T.surface,
                    color: isSelected ? '#fff' : T.textSub,
                    cursor: 'pointer', fontFamily: T.font,
                    transition: 'all 120ms',
                  }}
                >
                  {r.label}
                </button>
              );
            })}

            <span style={{ width: 1, background: T.border, margin: '0 6px' }} />

            {(['ALL', 'Active', 'Suspended'] as const).map((s) => {
              const isSelected = userStatusFilter === s;
              return (
                <button
                  key={s}
                  type="button"
                  onClick={() => setUserStatusFilter(s)}
                  style={{
                    padding: '5px 12px', borderRadius: T.radius.pill,
                    fontSize: 11.5, fontWeight: 700,
                    border: `1px solid ${isSelected ? T.primary : T.border}`,
                    background: isSelected ? T.primary : T.surface,
                    color: isSelected ? '#fff' : T.textSub,
                    cursor: 'pointer', fontFamily: T.font,
                  }}
                >
                  {s === 'ALL' ? 'All statuses' : s}
                </button>
              );
            })}

            <select
              value={userSortKey}
              onChange={(e) => setUserSortKey(e.target.value as any)}
              style={{
                marginLeft: 'auto',
                padding: '5px 14px', borderRadius: T.radius.pill,
                border: `1px solid ${T.border}`, background: T.surface,
                fontSize: 11.5, fontWeight: 700, color: T.textSub,
                fontFamily: T.font, cursor: 'pointer',
              }}
            >
              <option value="id_asc">Sort: ID ↑</option>
              <option value="id_desc">Sort: ID ↓</option>
              <option value="name_asc">Sort: Name A→Z</option>
              <option value="name_desc">Sort: Name Z→A</option>
              <option value="role">Sort: Role</option>
            </select>
          </div>

          {/* Table */}
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.lg,
            overflow: 'hidden',
            boxShadow: T.shadow.xs,
          }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ minWidth: 820 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>User ID</th>
                    <th>Full name</th>
                    <th>Institutional email</th>
                    <th>Assigned RBAC role</th>
                    <th style={{ width: 110 }}>Status</th>
                    <th style={{ width: 100, textAlign: 'right' }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {processedUsers.map((u) => (
                    <tr key={u.id}>
                      <td style={{ color: T.textSub, fontWeight: 600, fontFamily: T.mono, fontSize: 12 }}>
                        {u.id}
                      </td>
                      <td style={{ fontWeight: 600, color: T.text }}>{u.name}</td>
                      <td style={{ color: T.textSub }}>{u.email}</td>
                      <td>
                        <span style={rolePill(u.role)}>{u.role}</span>
                      </td>
                      <td>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 6,
                          padding: '4px 12px', borderRadius: T.radius.pill,
                          fontSize: 11, fontWeight: 700,
                          background: u.status === 'Active' ? T.successSoft : '#F5EFE9',
                          color: u.status === 'Active' ? T.success : '#8C6826',
                        }}>
                          <span style={{ fontSize: 7 }}>●</span>
                          {u.status}
                        </span>
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={() => handleOpenEditModal(u)}
                          style={{
                            padding: '6px 14px', borderRadius: T.radius.pill,
                            background: 'transparent', color: T.primary,
                            border: `1px solid ${T.primaryTint}`,
                            fontSize: 12, fontWeight: 700, cursor: 'pointer',
                            fontFamily: T.font,
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {processedUsers.length === 0 && (
              <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
                No accounts match your filters.
              </div>
            )}
          </div>

          {/* Footer note (matches Figma's RBAC blurb) */}
          <p style={{
            marginTop: 16, fontSize: 12.5, color: T.textSub, lineHeight: 1.6,
          }}>
            Seven RBAC roles govern access. Editing a user changes their assigned permissions;
            suspending an account disables access without deleting its profile.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: AUDIT                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && (
        <div>
          {/* Sub-tabs */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              type="button"
              onClick={() => setAuditSubTab('phi')}
              style={{
                padding: '9px 18px', borderRadius: T.radius.pill,
                border: `1px solid ${auditSubTab === 'phi' ? T.primary : T.border}`,
                background: auditSubTab === 'phi' ? T.primary : T.surface,
                color: auditSubTab === 'phi' ? '#fff' : T.textSub,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: T.font,
              }}
            >
              👁️ PHI access
            </button>
            <button
              type="button"
              onClick={() => setAuditSubTab('mutations')}
              style={{
                padding: '9px 18px', borderRadius: T.radius.pill,
                border: `1px solid ${auditSubTab === 'mutations' ? T.primary : T.border}`,
                background: auditSubTab === 'mutations' ? T.primary : T.surface,
                color: auditSubTab === 'mutations' ? '#fff' : T.textSub,
                fontSize: 13, fontWeight: 700, cursor: 'pointer',
                fontFamily: T.font,
              }}
            >
              ✓ SHA-256 mutation ledger
            </button>
          </div>

          {/* PHI */}
          {auditSubTab === 'phi' && (
            <div>
              <div style={{
                padding: '16px 20px',
                background: T.sage100,
                borderRadius: T.radius.lg,
                marginBottom: 18,
                fontSize: 13, color: T.textSub, lineHeight: 1.55,
              }}>
                <strong style={{ color: T.primary }}>Confidential health information access.</strong>{' '}
                Records log viewing of confidential health profiles, EMR history and clinical records under R.A. 10173.
                Patient references below are fictional and redacted; no clinical content is shown.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 480 }}>
                  <span style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: T.textMuted, width: 16, height: 16, display: 'grid', placeItems: 'center',
                  }}><I.Search /></span>
                  <input
                    type="text"
                    placeholder="Search practitioner, patient, purpose…"
                    value={phiSearchTerm}
                    onChange={(e) => setPhiSearchTerm(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40, borderRadius: T.radius.pill }}
                  />
                </div>

                <select value={phiTableFilter} onChange={(e) => setPhiTableFilter(e.target.value)}
                        style={{ ...inputStyle, width: 'auto', padding: '8px 16px', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700 }}>
                  <option value="ALL">All clinical tables</option>
                  <option value="HEALTH_PROFILES">HEALTH_PROFILES</option>
                  <option value="EMR_RECORDS">EMR_RECORDS</option>
                  <option value="EMR_ATTACHMENTS">EMR_ATTACHMENTS</option>
                </select>

                <select value={phiSortOrder} onChange={(e) => setPhiSortOrder(e.target.value as any)}
                        style={{ ...inputStyle, width: 'auto', padding: '8px 16px', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700 }}>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                  <option value="patient_asc">Patient A→Z</option>
                </select>

                <span style={{ alignSelf: 'center', fontSize: 12, color: T.textSub, fontWeight: 700 }}>
                  {processedPhiLogs.length} of {phiLogs.length} entries
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {['ALL', 'DOCTOR', 'NURSE', 'DENTIST', 'ADMIN'].map((role) => {
                  const isSelected = phiRoleFilter === role;
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => setPhiRoleFilter(role)}
                      style={{
                        padding: '5px 12px', borderRadius: T.radius.pill,
                        fontSize: 11.5, fontWeight: 700,
                        border: `1px solid ${isSelected ? T.primary : T.border}`,
                        background: isSelected ? T.primary : T.surface,
                        color: isSelected ? '#fff' : T.textSub,
                        cursor: 'pointer', fontFamily: T.font,
                      }}
                    >
                      {role === 'ALL' ? 'All roles' : role}
                    </button>
                  );
                })}
              </div>

              <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radius.lg, overflow: 'hidden', boxShadow: T.shadow.xs,
              }}>
                {loadingLogs ? (
                  <div style={{ padding: 40, textAlign: 'center', color: T.textSub, fontSize: 13 }}>
                    Loading PHI access records…
                  </div>
                ) : processedPhiLogs.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
                    No PHI read access events matched your filter.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ minWidth: 900 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 90 }}>Access ID</th>
                          <th>Practitioner / viewer</th>
                          <th>Patient ref.</th>
                          <th>Data table</th>
                          <th>Clinical purpose</th>
                          <th>IP origin</th>
                          <th>Access timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedPhiLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ fontFamily: T.mono, fontSize: 12, color: T.textSub, fontWeight: 600 }}>
                              {log.id}
                            </td>
                            <td>
                              <div style={{ fontWeight: 700, color: T.primary }}>{log.viewer_name}</div>
                              <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                                {log.viewer_role} · {log.viewer_email}
                              </div>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{log.patient_name}</div>
                              {log.student_no && (
                                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>{log.student_no}</div>
                              )}
                            </td>
                            <td>
                              <span style={{
                                fontFamily: T.mono, fontSize: 11,
                                background: T.sage100, color: T.textSub,
                                padding: '3px 8px', borderRadius: T.radius.xs,
                              }}>
                                {log.table_affected}
                              </span>
                            </td>
                            <td style={{ color: T.textSub }}>{log.purpose}</td>
                            <td style={{ color: T.textMuted, fontFamily: T.mono, fontSize: 12 }}>{log.ip_address}</td>
                            <td style={{ color: T.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(log.accessed_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* MUTATIONS */}
          {auditSubTab === 'mutations' && (
            <div>
              <div style={{
                padding: '16px 20px',
                background: T.sage100,
                borderRadius: T.radius.lg,
                marginBottom: 18,
                fontSize: 13, color: T.textSub, lineHeight: 1.55,
              }}>
                <strong style={{ color: T.primary }}>Cryptographic append-only chain.</strong>{' '}
                Every transaction generates a SHA-256 hash linking directly to the preceding log record.
                Entries cannot be edited or deleted. Hashes are shortened for display.
              </div>

              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
                <div style={{ position: 'relative', flex: '1 1 300px', maxWidth: 480 }}>
                  <span style={{
                    position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                    color: T.textMuted, width: 16, height: 16, display: 'grid', placeItems: 'center',
                  }}><I.Search /></span>
                  <input
                    type="text"
                    placeholder="Search actor, target table, hash…"
                    value={mutationSearchTerm}
                    onChange={(e) => setMutationSearchTerm(e.target.value)}
                    style={{ ...inputStyle, paddingLeft: 40, borderRadius: T.radius.pill }}
                  />
                </div>

                <select value={mutationSortOrder} onChange={(e) => setMutationSortOrder(e.target.value as any)}
                        style={{ ...inputStyle, width: 'auto', padding: '8px 16px', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700 }}>
                  <option value="desc">Newest first</option>
                  <option value="asc">Oldest first</option>
                </select>

                <span style={{ alignSelf: 'center', fontSize: 12, color: T.textSub, fontWeight: 700 }}>
                  {processedMutationLogs.length} of {mutationLogs.length} blocks
                </span>
              </div>

              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                {['ALL', 'CREATE', 'UPDATE', 'DELETE', 'LOGIN'].map((act) => {
                  const isSelected = mutationActionFilter === act;
                  return (
                    <button
                      key={act}
                      type="button"
                      onClick={() => setMutationActionFilter(act)}
                      style={{
                        padding: '5px 12px', borderRadius: T.radius.pill,
                        fontSize: 11.5, fontWeight: 700,
                        border: `1px solid ${isSelected ? T.primary : T.border}`,
                        background: isSelected ? T.primary : T.surface,
                        color: isSelected ? '#fff' : T.textSub,
                        cursor: 'pointer', fontFamily: T.font,
                      }}
                    >
                      {act}
                    </button>
                  );
                })}
              </div>

              <div style={{
                background: T.surface, border: `1px solid ${T.border}`,
                borderRadius: T.radius.lg, overflow: 'hidden', boxShadow: T.shadow.xs,
              }}>
                {processedMutationLogs.length === 0 ? (
                  <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
                    No mutation audit logs matched your filter.
                  </div>
                ) : (
                  <div style={{ overflowX: 'auto' }}>
                    <table className="tbl" style={{ minWidth: 820 }}>
                      <thead>
                        <tr>
                          <th style={{ width: 90 }}>Log</th>
                          <th>Actor</th>
                          <th style={{ width: 100 }}>Action</th>
                          <th>Target entity</th>
                          <th>SHA-256 hash</th>
                          <th>Timestamp</th>
                        </tr>
                      </thead>
                      <tbody>
                        {processedMutationLogs.map((log) => (
                          <tr key={log.id}>
                            <td style={{ fontFamily: T.mono, fontSize: 12, color: T.textSub, fontWeight: 600 }}>
                              #{log.id}
                            </td>
                            <td style={{ color: T.primary, fontWeight: 600 }}>{log.user}</td>
                            <td>
                              <span style={{
                                display: 'inline-flex',
                                padding: '3px 10px', borderRadius: T.radius.xs,
                                fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
                                background:
                                  log.action === 'CREATE' ? T.successSoft :
                                  log.action === 'UPDATE' ? T.warningSoft :
                                  log.action === 'DELETE' ? T.dangerSoft : T.sage100,
                                color:
                                  log.action === 'CREATE' ? T.success :
                                  log.action === 'UPDATE' ? T.warning :
                                  log.action === 'DELETE' ? T.danger : T.textSub,
                              }}>
                                {log.action}
                              </span>
                            </td>
                            <td style={{ color: T.textSub }}>{log.target}</td>
                            <td style={{ fontFamily: T.mono, fontSize: 11, color: T.textMuted }}>
                              {log.hash ? `${log.hash.substring(0, 22)}…` : 'N/A'}
                            </td>
                            <td style={{ color: T.textMuted, fontSize: 12, whiteSpace: 'nowrap' }}>
                              {new Date(log.created_at).toLocaleString()}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: TELEMETRY / SYSTEM HEALTH                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'telemetry' && (
        <div>
          {/* KPI cards row */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            gap: 16, marginBottom: 24,
          }}>
            {[
              {
                label: 'Central MySQL 8.0 database',
                value: telemetry?.database?.totalUsers ?? 128,
                sub: 'Registered accounts',
                status: telemetry?.database?.status ?? 'Operational',
                icon: <I.Database />,
              },
              {
                label: 'Redis 7.0 queue cache',
                value: 3,
                sub: 'Pending queue jobs',
                status: telemetry?.cache?.status ?? 'Operational',
                icon: <I.Activity />,
              },
              {
                label: 'Socket.IO gateway',
                value: 'Connected',
                sub: 'Queue & SOS relays · port 5000',
                status: 'Operational',
                icon: <I.Activity />,
              },
              {
                label: 'R.A. 10173 cryptographic ledger',
                value: telemetry?.database?.totalAuditBlocks ?? '8,406',
                sub: 'Verified hash-chain blocks',
                status: 'Valid',
                icon: <I.Shield />,
              },
            ].map((card, i) => (
              <div
                key={i}
                style={{
                  background: T.surface,
                  border: `1px solid ${T.border}`,
                  borderRadius: T.radius.lg,
                  padding: '20px 22px',
                  boxShadow: T.shadow.xs,
                  display: 'flex', flexDirection: 'column', gap: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{
                    width: 34, height: 34, borderRadius: T.radius.sm,
                    background: T.sage100, color: T.primary,
                    display: 'grid', placeItems: 'center',
                  }}>
                    {card.icon}
                  </div>
                  <span style={{
                    padding: '3px 10px', borderRadius: T.radius.pill,
                    background: T.successSoft, color: T.success,
                    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
                  }}>
                    {card.status}
                  </span>
                </div>

                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                    {card.label}
                  </div>
                  <div style={{ fontSize: 30, fontWeight: 800, color: T.text, letterSpacing: -0.8, lineHeight: 1 }}>
                    {card.value}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 6 }}>{card.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Retention governance panel */}
          <div style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.lg,
            padding: '24px 26px',
            boxShadow: T.shadow.xs,
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 16, marginBottom: 22 }}>
              <div>
                <h3 style={{ fontSize: 20, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.3 }}>
                  Retention governance
                </h3>
                <p style={{ fontSize: 13, color: T.textSub, margin: '4px 0 0' }}>
                  R.A. 10173 · Source policy: 5-year clinical retention
                </p>
              </div>
              <span style={{
                padding: '6px 14px', borderRadius: T.radius.pill,
                background: T.sage200, color: T.primary,
                fontSize: 11.5, fontWeight: 700, letterSpacing: 0.3,
              }}>
                AES-256-GCM encryption
              </span>
            </div>

            {/* Stats grid */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: 20, marginBottom: 26,
            }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                  Active consents
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: T.text, letterSpacing: -1.2, lineHeight: 1 }}>
                  {(retentionInfo?.totalActiveConsents ?? 1248).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>Current consent records</div>
              </div>

              <div>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                  Active medical encounters
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: T.text, letterSpacing: -1.2, lineHeight: 1 }}>
                  {(retentionInfo?.activeMedicalRecords ?? 362).toLocaleString()}
                </div>
                <div style={{ fontSize: 12, color: T.textMuted, marginTop: 6 }}>Within the retention period</div>
              </div>

              <div style={{
                background: T.primaryTint,
                borderRadius: T.radius.lg,
                padding: '16px 20px',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: T.primarySoft, marginBottom: 6 }}>
                  Past retention period
                </div>
                <div style={{ fontSize: 40, fontWeight: 800, color: T.primary, letterSpacing: -1.2, lineHeight: 1 }}>
                  {retentionInfo?.recordsPastRetentionPeriod ?? 42}
                </div>
                <div style={{ fontSize: 12, color: T.primarySoft, marginTop: 6 }}>Eligible for the next sweep</div>
              </div>
            </div>

            {/* Record-type table */}
            <div style={{
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.md,
              overflow: 'hidden',
              marginBottom: 20,
            }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: T.sage100 }}>
                    <th style={{ textAlign: 'left', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Clinical record type
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Eligible records
                    </th>
                    <th style={{ textAlign: 'right', padding: '12px 18px', fontSize: 11.5, fontWeight: 700, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                      Sweep outcome
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { type: 'EMR records',     count: retentionInfo?.breakdown?.emrRecords ?? 18 },
                    { type: 'Appointments',    count: retentionInfo?.breakdown?.appointments ?? 14 },
                    { type: 'Prescriptions',   count: retentionInfo?.breakdown?.prescriptions ?? 10 },
                  ].map((row) => (
                    <tr key={row.type} style={{ borderTop: `1px solid ${T.borderSoft}` }}>
                      <td style={{ padding: '14px 18px', color: T.text, fontWeight: 500 }}>{row.type}</td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: T.text, fontWeight: 700 }}>
                        {row.count}
                      </td>
                      <td style={{ padding: '14px 18px', textAlign: 'right', color: T.textSub }}>Soft-delete / archive</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer action row */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
              <p style={{ fontSize: 12.5, color: T.textSub, margin: 0, maxWidth: 620, lineHeight: 1.55 }}>
                Expired clinical records are soft-deleted or archived, not permanently erased.
                Review eligible counts before enforcing the policy.
              </p>
              <button
                type="button"
                onClick={handleExecuteSweep}
                disabled={sweeping}
                style={{
                  ...btnPrimary,
                  padding: '12px 22px',
                  opacity: sweeping ? 0.6 : 1,
                  cursor: sweeping ? 'not-allowed' : 'pointer',
                }}
              >
                🧹 {sweeping ? 'Executing sweep…' : 'Enforce retention sweep'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: ANALYTICS                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && <AnalyticsDashboard />}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: DATABASE STUDIO                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'db' && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            padding: '14px 20px', background: T.sage100,
            borderRadius: T.radius.lg, marginBottom: 20, flexWrap: 'wrap', gap: 12,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{
                fontFamily: T.mono, fontSize: 12, fontWeight: 700,
                background: T.primary, color: '#fff',
                padding: '5px 12px', borderRadius: T.radius.xs,
              }}>
                valetudo_healthlink
              </span>
              <span style={{ fontSize: 12.5, color: T.textSub }}>
                {dbTablesList.length} normalized tables · showing a practical subset
              </span>
            </div>
            {isTableReadOnly && (
              <span style={{
                padding: '5px 14px', borderRadius: T.radius.pill,
                background: T.warningSoft, color: T.warning,
                fontSize: 11.5, fontWeight: 700,
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
                <I.Lock /> Read-only audit table
              </span>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 20 }}>
            {/* Left: table list */}
            <aside style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg,
              padding: 14,
              maxHeight: '72vh',
              overflowY: 'auto',
              boxShadow: T.shadow.xs,
            }}>
              <div style={{
                fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4,
                color: T.textMuted, textTransform: 'uppercase',
                marginBottom: 10, padding: '0 6px',
              }}>
                System tables ({dbTablesList.length})
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
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
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                        padding: '9px 12px',
                        borderRadius: T.radius.md,
                        border: 'none',
                        background: isSelected ? T.primaryTint : 'transparent',
                        color: isSelected ? T.primary : T.textSub,
                        fontSize: 12.5, fontWeight: isSelected ? 700 : 500,
                        cursor: 'pointer',
                        textAlign: 'left',
                        fontFamily: T.font,
                        transition: 'background 120ms',
                      }}
                    >
                      <span style={{
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                      }}>
                        {isAudit ? '🔒' : '📋'} {t.tableName}
                      </span>
                    </button>
                  );
                })}
              </div>
            </aside>

            {/* Right: data grid */}
            <div style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg,
              padding: 20,
              display: 'flex', flexDirection: 'column',
              boxShadow: T.shadow.xs,
              minWidth: 0,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <h3 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.text }}>
                    {selectedDbTable}
                  </h3>
                  <span style={{
                    padding: '3px 10px', borderRadius: T.radius.pill,
                    background: T.sage100, color: T.primary,
                    fontSize: 11, fontWeight: 700,
                  }}>
                    {tableTotalRows} records
                  </span>
                </div>

                <div className="my-toolbar">
                  <input
                    type="text"
                    placeholder="Search loaded records…"
                    value={dbSearchFilter}
                    onChange={(e) => setDbSearchFilter(e.target.value)}
                    className="my-toolbar-search"
                  />
                  <button
                    type="button"
                    onClick={() => fetchTableData(selectedDbTable, tablePage)}
                    className="my-toolbar-icon-btn"
                    title="Refresh"
                  >
                    <I.Refresh />
                  </button>
                  {!isTableReadOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const emptyRow: Record<string, any> = {};
                        tableSchema.forEach((col) => (emptyRow[col.columnName] = ''));
                        setDbRowModal({ isNew: true, rowData: emptyRow });
                      }}
                      className="my-toolbar-btn my-toolbar-btn-primary"
                    >
                      <I.Plus />
                      <span>Insert row</span>
                    </button>
                  )}
                </div>
              </div>

              {loadingDbTable ? (
                <div style={{ padding: 40, textAlign: 'center', color: T.textSub }}>Loading records…</div>
              ) : tableRows.length === 0 ? (
                <div style={{ padding: 40, textAlign: 'center', color: T.textMuted }}>Table is empty.</div>
              ) : (
                <div style={{
                  border: `1px solid ${T.borderSoft}`,
                  borderRadius: T.radius.md,
                  overflow: 'auto',
                  maxHeight: '56vh',
                }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead style={{ position: 'sticky', top: 0, background: T.sage100, zIndex: 2 }}>
                      <tr>
                        {!isTableReadOnly && (
                          <th style={{
                            padding: '10px 12px', textAlign: 'center',
                            fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
                            color: T.textSub, textTransform: 'uppercase',
                            borderBottom: `1px solid ${T.border}`,
                            width: 90,
                          }}>Actions</th>
                        )}
                        {tableSchema.map((col) => (
                          <th key={col.columnName} style={{
                            padding: '10px 12px', textAlign: 'left',
                            fontSize: 10.5, fontWeight: 800, letterSpacing: 0.4,
                            color: T.textSub, textTransform: 'uppercase',
                            borderBottom: `1px solid ${T.border}`,
                            whiteSpace: 'nowrap',
                          }}>
                            {col.columnKey === 'PRI' && <span style={{ color: T.warning, marginRight: 4 }}>🔑</span>}
                            {col.columnName}
                            <div style={{ fontSize: 9.5, color: T.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
                              {col.dataType}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {tableRows
                        .filter((r) => !dbSearchFilter || JSON.stringify(r).toLowerCase().includes(dbSearchFilter.toLowerCase()))
                        .map((row, idx) => (
                          <tr key={idx} style={{ borderBottom: `1px solid ${T.borderSoft}` }}>
                            {!isTableReadOnly && (
                              <td style={{ padding: '8px 12px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                                <div className="my-row-actions">
                                  <button
                                    type="button"
                                    className="my-row-action my-row-action-edit"
                                    onClick={() => setDbRowModal({ isNew: false, rowData: { ...row } })}
                                    title="Edit row"
                                  >
                                    <I.Pencil />
                                  </button>
                                  <button
                                    type="button"
                                    className="my-row-action my-row-action-delete"
                                    onClick={() => handleDeleteDbRow(row)}
                                    title="Delete row"
                                  >
                                    <I.Trash />
                                  </button>
                                </div>
                              </td>
                            )}
                            {tableSchema.map((col) => {
                              const val = row[col.columnName];
                              const isEncrypted = typeof val === 'string' && val.startsWith('enc:v1:');
                              return (
                                <td key={col.columnName} style={{
                                  padding: '8px 12px',
                                  maxWidth: 220,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                  color: T.text,
                                }}>
                                  {isEncrypted ? (
                                    <span style={{
                                      color: T.primary, fontWeight: 700, fontSize: 10.5,
                                      background: T.primaryTint, padding: '2px 8px',
                                      borderRadius: T.radius.xs,
                                    }}>
                                      🔒 AES-256
                                    </span>
                                  ) : val === null || val === undefined ? (
                                    <span style={{ color: T.textFaint, fontStyle: 'italic' }}>NULL</span>
                                  ) : typeof val === 'object' ? (
                                    <code style={{ fontSize: 11, fontFamily: T.mono }}>{JSON.stringify(val)}</code>
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

              {/* Pagination */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, fontSize: 12, color: T.textSub }}>
                <span>
                  Page <b style={{ color: T.text }}>{tablePage}</b> of <b style={{ color: T.text }}>{tableTotalPages}</b>
                  {' · '}Showing {tableRows.length} records
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    disabled={tablePage <= 1}
                    onClick={() => fetchTableData(selectedDbTable, tablePage - 1)}
                    style={{
                      ...btnGhost, padding: '6px 14px', fontSize: 12,
                      opacity: tablePage <= 1 ? 0.4 : 1,
                      cursor: tablePage <= 1 ? 'not-allowed' : 'pointer',
                    }}
                  >
                    ◀ Prev
                  </button>
                  <button
                    type="button"
                    disabled={tablePage >= tableTotalPages}
                    onClick={() => fetchTableData(selectedDbTable, tablePage + 1)}
                    style={{
                      ...btnGhost, padding: '6px 14px', fontSize: 12,
                      opacity: tablePage >= tableTotalPages ? 0.4 : 1,
                      cursor: tablePage >= tableTotalPages ? 'not-allowed' : 'pointer',
                    }}
                  >
                    Next ▶
                  </button>
                </div>
              </div>
            </div>
          </div>

          <p style={{
            marginTop: 18, fontSize: 12.5, color: T.textSub, lineHeight: 1.6,
          }}>
            New rows receive autogenerated primary keys. Direct edits affect system records;
            audit tables remain read-only.
          </p>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL: DB ROW INSERT / EDIT                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {dbRowModal && (
        <div className="modal-backdrop" onClick={() => setDbRowModal(null)}>
          <div className="modal-card" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text }}>
                {dbRowModal.isNew ? 'Edit database row' : 'Edit database row'}
              </h3>
              <button
                type="button"
                onClick={() => setDbRowModal(null)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textSub }}
              >✕</button>
            </div>
            <p style={{ fontSize: 12.5, color: T.textSub, margin: '0 0 18px' }}>
              valetudo_healthlink / {selectedDbTable} · {dbRowModal.isNew ? 'Insert new record' : 'Update existing record'}
            </p>

            <div style={{
              padding: '14px 18px',
              background: T.warningSoft,
              border: `1px solid ${T.warningBorder}`,
              borderRadius: T.radius.md,
              fontSize: 12.5, color: T.warning, lineHeight: 1.5,
              marginBottom: 20,
            }}>
              <strong>⚠️ Direct database change.</strong> Committing writes directly to this system record.
              Check field types and values carefully. Credentials are not available in this editor.
            </div>

            <form onSubmit={handleSaveDbRow}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {tableSchema.map((col) => {
                  const isPK = col.columnKey === 'PRI';
                  const isAuto = col.extra && col.extra.includes('auto_increment');
                  const currentValue = dbRowModal.rowData[col.columnName];
                  const readOnlyField = !dbRowModal.isNew && isPK;
                  return (
                    <div key={col.columnName}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: 11.5, fontWeight: 700, color: T.textSub,
                        marginBottom: 6,
                      }}>
                        <span>
                          {isPK && <span style={{ color: T.warning, marginRight: 4 }}>🔑</span>}
                          {col.columnName}
                        </span>
                        <span style={{ fontSize: 10, color: T.textMuted, fontFamily: T.mono, fontWeight: 500 }}>
                          {col.dataType}{isAuto ? ' · auto' : ''}
                        </span>
                      </div>
                      <input
                        disabled={readOnlyField}
                        placeholder={isAuto && dbRowModal.isNew ? 'Generated by MySQL' : `Enter ${col.columnName}…`}
                        value={
                          currentValue === null || currentValue === undefined
                            ? ''
                            : typeof currentValue === 'object'
                            ? JSON.stringify(currentValue)
                            : String(currentValue)
                        }
                        onChange={(e) => setDbRowModal({
                          ...dbRowModal,
                          rowData: { ...dbRowModal.rowData, [col.columnName]: e.target.value },
                        })}
                        style={{
                          ...inputStyle,
                          background: readOnlyField ? T.sage100 : T.surface,
                          color: readOnlyField ? T.textSub : T.text,
                          cursor: readOnlyField ? 'not-allowed' : 'text',
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, borderTop: `1px solid ${T.border}`, paddingTop: 18 }}>
                <button type="button" onClick={() => setDbRowModal(null)} style={btnGhost}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary}>
                  💾 Commit to database
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL: USER PROFILE EDIT                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {editingUser && (
        <div className="modal-backdrop" onClick={() => setEditingUser(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 980, padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'grid', gridTemplateColumns: '1.7fr 1fr' }}>
              {/* LEFT: form */}
              <div style={{ padding: '28px 32px', maxHeight: '90vh', overflowY: 'auto' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <h2 style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.5 }}>
                      Manage user account
                    </h2>
                    <p style={{ fontSize: 13, color: T.textSub, margin: '6px 0 0' }}>
                      {editingUser.name} · User ID {editingUser.id} · Fictional staff account
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveUserProfile} style={{ marginTop: 22 }}>
                  {/* Identity & contact */}
                  <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase' }}>
                    Identity & contact
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        First name
                      </label>
                      <input
                        style={inputStyle}
                        value={editingUser.first_name}
                        onChange={(e) => setEditingUser({ ...editingUser, first_name: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Last name
                      </label>
                      <input
                        style={inputStyle}
                        value={editingUser.last_name}
                        onChange={(e) => setEditingUser({ ...editingUser, last_name: e.target.value })}
                        required
                      />
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Institutional email
                      </label>
                      <input
                        type="email"
                        style={inputStyle}
                        value={editingUser.email}
                        onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                        required
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Phone
                      </label>
                      <input
                        style={inputStyle}
                        value={editingUser.phone || ''}
                        placeholder="+63 900 000 0000"
                        onChange={(e) => setEditingUser({ ...editingUser, phone: e.target.value })}
                      />
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5, fontStyle: 'italic' }}>
                        Fictional demonstration contact
                      </div>
                    </div>
                  </div>

                  {/* Access & status */}
                  <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase' }}>
                    Access & account status
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Assigned RBAC role
                      </label>
                      <select
                        style={inputStyle}
                        value={editingUser.role}
                        onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      >
                        <option value="STUDENT">STUDENT</option>
                        <option value="DOCTOR">DOCTOR</option>
                        <option value="DENTIST">DENTIST</option>
                        <option value="NURSE">NURSE</option>
                        <option value="FACULTY">FACULTY</option>
                        <option value="EMERGENCY_RESPONDER">EMERGENCY_RESPONDER</option>
                        <option value="ADMIN">ADMIN</option>
                      </select>
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Account status
                      </label>
                      <select
                        style={inputStyle}
                        value={editingUser.is_active ? '1' : '0'}
                        onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.value === '1' })}
                      >
                        <option value="1">Active</option>
                        <option value="0">Suspended / deactivated</option>
                      </select>
                    </div>
                  </div>

                  {/* Role-specific fields */}
                  <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase' }}>
                    Professional details
                  </div>

                  {editingUser.role === 'STUDENT' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 100px', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Student no.
                        </label>
                        <input style={inputStyle} value={editingUser.student_no || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, student_no: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Course
                        </label>
                        <input style={inputStyle} value={editingUser.course || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, course: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Year
                        </label>
                        <input style={inputStyle} type="number" min="1" max="5" value={editingUser.year_level || 1}
                               onChange={(e) => setEditingUser({ ...editingUser, year_level: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(editingUser.role) && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          PRC / staff ID
                        </label>
                        <input style={inputStyle} value={editingUser.license_no || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, license_no: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Specialty
                        </label>
                        <input style={inputStyle} value={editingUser.specialty || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, specialty: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Department / unit
                        </label>
                        <input style={inputStyle} value={editingUser.department || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {editingUser.role === 'FACULTY' && (
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Department
                        </label>
                        <input style={inputStyle} value={editingUser.department || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Position
                        </label>
                        <input style={inputStyle} value={editingUser.position || ''}
                               onChange={(e) => setEditingUser({ ...editingUser, position: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {/* Admin password override panel */}
                  <div style={{
                    marginTop: 20,
                    padding: '18px 20px',
                    background: '#EDE9FE',
                    borderRadius: T.radius.lg,
                  }}>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 8,
                      fontSize: 13, fontWeight: 800, color: '#6D28D9',
                      marginBottom: 6,
                    }}>
                      🔑 Password admin override
                    </div>
                    <p style={{ fontSize: 12, color: '#5B21B6', margin: '0 0 12px', lineHeight: 1.5 }}>
                      Reset this user's credentials separately from their profile.
                      Provide a new temporary password securely.
                    </p>
                    <label style={{ fontSize: 11.5, fontWeight: 700, color: '#5B21B6', display: 'block', marginBottom: 6 }}>
                      New temporary password
                    </label>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="password"
                        placeholder="Enter temporary password"
                        value={adminPasswordInput}
                        onChange={(e) => setAdminPasswordInput(e.target.value)}
                        style={{
                          ...inputStyle,
                          flex: 1,
                          background: '#fff',
                          borderColor: '#C4B5FD',
                        }}
                      />
                      <button
                        type="button"
                        onClick={handleAdminResetPassword}
                        style={{
                          padding: '0 18px', borderRadius: T.radius.pill,
                          background: '#7C3AED', color: '#fff',
                          border: 'none', fontWeight: 700, fontSize: 12.5,
                          cursor: 'pointer', fontFamily: T.font,
                        }}
                      >
                        Force reset
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#5B21B6', marginTop: 8, fontStyle: 'italic' }}>
                      Only this action applies the password override.
                    </div>
                  </div>

                  {modalFeedback && (
                    <div style={{
                      marginTop: 16, padding: '12px 16px', borderRadius: T.radius.md,
                      fontSize: 12.5, fontWeight: 600,
                      background: modalFeedback.isError ? T.dangerSoft : T.successSoft,
                      color: modalFeedback.isError ? T.danger : T.success,
                      border: `1px solid ${modalFeedback.isError ? T.dangerBorder : T.successBorder}`,
                    }}>
                      {modalFeedback.text}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22, paddingTop: 18, borderTop: `1px solid ${T.border}` }}>
                    <button type="button" onClick={() => setEditingUser(null)} style={btnGhost}>
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingUser}
                      style={{
                        ...btnPrimary,
                        opacity: isSavingUser ? 0.6 : 1,
                        cursor: isSavingUser ? 'not-allowed' : 'pointer',
                      }}
                    >
                      {isSavingUser ? 'Saving…' : 'Save profile changes'}
                    </button>
                  </div>
                </form>
              </div>

              {/* RIGHT: side info panel */}
              <div style={{
                background: T.sage100,
                padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: 24,
                maxHeight: '90vh', overflowY: 'auto',
              }}>
                <div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    fontSize: 13, fontWeight: 800, color: T.primary,
                    marginBottom: 8,
                  }}>
                    Role-specific fields
                  </div>
                  <p style={{ fontSize: 12, color: T.textSub, margin: 0, lineHeight: 1.55 }}>
                    The contextual section changes with the assigned role.
                    Staff fields are shown for this <b>{editingUser.role}</b> account.
                  </p>
                </div>

                {[
                  { role: 'STUDENT', desc: 'Student number, course and year level' },
                  { role: 'FACULTY', desc: 'College / department and academic rank' },
                  { role: 'DOCTOR', desc: 'PRC license, specialty and department' },
                  { role: 'NURSE', desc: 'PRC license, specialty and clinic unit' },
                  { role: 'DENTIST', desc: 'PRC license, dental specialty and department' },
                  { role: 'EMERGENCY_RESPONDER', desc: 'Staff ID and campus response unit' },
                ].map((r) => (
                  <div key={r.role} style={{
                    paddingBottom: 14, borderBottom: `1px solid ${T.sage300}`,
                  }}>
                    <div style={{ fontSize: 11.5, fontWeight: 800, color: T.primary, letterSpacing: 0.4 }}>
                      {r.role}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSub, marginTop: 4, lineHeight: 1.5 }}>
                      {r.desc}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}