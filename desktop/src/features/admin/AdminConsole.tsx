import ServerConsole from './ServerConsole';
import ConnectedUsers from './ConnectedUsers';
import WorkerHealth from './WorkerHealth';
import { useTabMotion } from '../../shared/ui/selectionMotion';
import { navigateTabs } from '../../shared/ui/tabKeyboard';
import { useConfirmAction } from '../../shared/ui/ConfirmAction';
import { useActionFeedback } from '../../shared/ui/feedback';
import Dialog from '../../shared/ui/Dialog';
import HealthProfileEditor, { type HealthProfileDraft } from './HealthProfileEditor';
import { I } from './adminIcons';
import ActiveAccounts from './ActiveAccounts';
import ArchivedAccounts from './ArchivedAccounts';
import AuditPanels from './AuditPanels';
import DatabaseStudio from './DatabaseStudio';
// desktop/src/features/admin/AdminConsole.tsx
import React, { useState, useEffect, useRef } from 'react';
import AnalyticsDashboard from '../analytics/AnalyticsDashboard';
import IncidentRecords from '../emergency/IncidentRecords';
import CreateUserModal from './CreateUserModal';
import { T, inputStyle, btnPrimary, btnGhost } from '../../theme';
import { getTextColorOn } from '../../theme/presets';
import { API_BASE_URL } from '../../config/api';
import ServerPingMonitor from './ServerPingMonitor';
import ServerPolicyPanel from './ServerPolicyPanel';
import Icon from '../../shared/ui/Icon';
import './AdminConsole.css';
import StaffAnalyticsPermissions from './StaffAnalyticsPermissions';

/* ── Icons (inline, no dependency) ─────────────────────────────── */


/* ── Advanced profile editor (Basic / Advanced modes) ─────────────────────────
   Shared styles + the segmented-toggle button style. Basic mode keeps
   the everyday fields; Advanced exposes every editable schema column. */
const modeBtnStyle = (active: boolean): React.CSSProperties => ({
  flex: 1, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 12px',
  border: `1px solid ${active ? T.primary : 'transparent'}`,
  borderRadius: T.radius.pill,
  background: active ? '#FFFFFF' : 'transparent',
  color: active ? T.primary : T.textSub,
  fontWeight: active ? 800 : 600,
  fontSize: 12.5, fontFamily: T.font,
  cursor: 'pointer',
  boxShadow: active ? T.shadow.xs : 'none',
  transition: 'all 120ms ease',
  whiteSpace: 'nowrap',
});

/* ── No-permission notice — rendered only for LIMITED admin archetypes.
      Full/super admins never see this panel (unchanged legacy behaviour). ── */
function NoPermissionPanel({ required, description }: { required?: string; description?: string }) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg,
      padding: '56px 32px',
      textAlign: 'center',
      boxShadow: T.shadow.xs,
    }}>
      <div style={{
        width: 52, height: 52, margin: '0 auto 18px', borderRadius: T.radius.md,
        background: '#EDE9FE', color: '#6D28D9',
        display: 'grid', placeItems: 'center',
      }}><Icon name="shield" size={26} tone="inherit" /></div>
      <div style={{ fontSize: 17, fontWeight: 800, color: T.text, marginBottom: 8 }}>
        Restricted admin archetype
      </div>
      <p style={{
        fontSize: 13, color: T.textSub, margin: 0, lineHeight: 1.6,
        maxWidth: 460, marginInline: 'auto',
      }}>
        {description ?? (
          <>This console section requires the <b>{required}</b> permission, which this
          administrator account does not hold.</>
        )}{' '}
        Contact a Super Admin to review this administrator account's access.
      </p>
    </div>
  );
}

export type AdminTab = 'users' | 'archived' | 'audit' | 'telemetry' | 'analytics' | 'incidents' | 'db' | 'serverPolicy' | 'terminal';

interface AdminConsoleProps {
  /** Optional controlled active tab — if provided, the sidebar drives the tab. */
  activeTab?: AdminTab;
  /** Called whenever the user clicks an inner pill or the sidebar item. */
  onTabChange?: (tab: AdminTab) => void;
  onIncidentAccessChange?: (allowed: boolean) => void;
  onTerminalAccessChange?: (allowed: boolean) => void;
}

export default function AdminConsole({
  activeTab: controlledTab,
  onTabChange,
  onIncidentAccessChange,
  onTerminalAccessChange,
}: AdminConsoleProps = {}) {
  /* Controlled or uncontrolled: fall back to internal state when no parent props are passed. */
  const [internalTab, setInternalTab] = useState<AdminTab>('users');
  const activeTab = controlledTab ?? internalTab;
  const changeTab = (tab: AdminTab) => {
    setInternalTab(tab);
    onTabChange?.(tab);
  };

  const [auditSubTab, setAuditSubTab] = useState<'mutations' | 'phi'>('phi');

  const [usersList, setUsersList] = useState<any[]>([]);
  const [archivedUsers, setArchivedUsers] = useState<any[]>([]);
  const [loadingArchivedUsers, setLoadingArchivedUsers] = useState(false);
  const [archivedUsersError, setArchivedUsersError] = useState('');
  const [mutationLogs, setMutationLogs] = useState<any[]>([]);
  const [phiLogs, setPhiLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [archivedSearchTerm, setArchivedSearchTerm] = useState('');
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [showCreateUserModal, setShowCreateUserModal] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [dbBusy, setDbBusy] = useState(false);
  const [dbError, setDbError] = useState('');
  const { confirmAction, confirmation } = useConfirmAction();
  const { notify, notice } = useActionFeedback();
  const [archivingUserId, setArchivingUserId] = useState<number | null>(null);
  const [userActionFeedback, setUserActionFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  /* ── Admin archetype permissions (additive — only gates LIMITED admins) ── */
  const [myPerms, setMyPerms] = useState<{ userId: number | null; archetype: string; is_super: boolean; permissions: string[] }>({
    userId: null, archetype: 'super', is_super: true, permissions: ['SUPER_ADMIN'],
  });
  const [permCatalog, setPermCatalog] = useState<any[]>([]);
  const [canViewIncidentRecords, setCanViewIncidentRecords] = useState(false);
  const [editAdminArchetype, setEditAdminArchetype] = useState<'super' | 'limited'>('super');
  const [editAdminPerms, setEditAdminPerms] = useState<string[]>([]);
  const [adminPasswordInput, setAdminPasswordInput] = useState('');
  const [modalFeedback, setModalFeedback] = useState<{ text: string; isError: boolean } | null>(null);
// ── Admin Vaccination History State ──────────────────────────────────────────
  const [adminUserVaccines, setAdminUserVaccines] = useState<string[]>([]);
  const [adminNewVaccine, setAdminNewVaccine] = useState('');

  /* ── Advanced profile editor state (Basic / Advanced modes) ──────────────────
     editHealth holds the decrypted HEALTH_PROFILES form values; it is
     lazily fetched the first time the operator switches to Advanced. */
  const [editMode, setEditMode] = useState<'basic' | 'advanced'>('basic');
  const [editHealth, setEditHealth] = useState<HealthProfileDraft | null>(null);
  const [editHealthLoaded, setEditHealthLoaded] = useState(false);
  const [editHealthLoading, setEditHealthLoading] = useState(false);
  const [editHealthExists, setEditHealthExists] = useState(false);
  const [editAccountMeta, setEditAccountMeta] = useState<any | null>(null);
  /* Qualified Responder: snapshot of the flag/note as loaded from the
     server — diffs against it decide whether the save flow must call the
     dedicated label endpoint after the main profile PUT. */
  const [editQrOriginal, setEditQrOriginal] = useState<{ flag: boolean; note: string } | null>(null);
  /* Database Studio state */
  const [dbTablesList, setDbTablesList] = useState<any[]>([]);
  const [selectedDbTable, setSelectedDbTable] = useState<string>('USERS');
  const [tableSchema, setTableSchema] = useState<any[]>([]);
  const [tableRows, setTableRows] = useState<any[]>([]);
  const [tablePage, setTablePage] = useState<number>(1);
  const [tableTotalPages, setTableTotalPages] = useState<number>(1);
  const [tableTotalRows, setTableTotalRows] = useState<number>(0);
  const [isTableReadOnly, setIsTableReadOnly] = useState<boolean>(false);
  const [tableReadOnlyReason, setTableReadOnlyReason] = useState<'audit' | 'security' | null>(null);
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
  const [userQrOnly, setUserQrOnly] = useState(false);
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

  const fetchArchivedUsers = async () => {
    setLoadingArchivedUsers(true);
    setArchivedUsersError('');
    try {
      const token = localStorage.getItem('valetudo_token');
      if (!token) throw new Error('Your session has expired. Please sign in again.');
      const response = await fetch(`${API_BASE_URL}/api/admin/users?archived=true`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Failed to load archived accounts (HTTP ${response.status}).`);
      }
      if (!Array.isArray(result)) throw new Error('The server returned an invalid archived account list.');
      setArchivedUsers(result);
    } catch (error) {
      setArchivedUsersError(error instanceof Error ? error.message : 'Failed to load archived accounts.');
    } finally {
      setLoadingArchivedUsers(false);
    }
  };

  /* Caller's effective admin permission state (super admins keep full access). */
  const fetchMyPermissions = async (signal: AbortSignal) => {
    const token = localStorage.getItem('valetudo_token');
    let incidentAccess = false;
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/my-permissions`, {
        headers: { Authorization: `Bearer ${token}` },
        signal,
      });
      if (res.ok) {
        const data = await res.json();
        if (signal.aborted) return;
        incidentAccess = data.is_super === true ||
          (Array.isArray(data.permissions) && data.permissions.includes('INCIDENT_RECORDS_VIEW'));
        const isSuper = data.is_super === true;
        const permissions = Array.isArray(data.permissions) ? data.permissions : [];
        onTerminalAccessChange?.(isSuper || permissions.includes('TERMINAL_VIEW'));
        setMyPerms({
          userId: data.user_id ?? null,
          archetype: data.archetype || (isSuper ? 'super' : 'limited'),
          is_super: isSuper,
          permissions,
        });
      } else if (!signal.aborted && (res.status === 401 || res.status === 403)) {
        onTerminalAccessChange?.(false);
        setMyPerms({ userId: null, archetype: 'limited', is_super: false, permissions: [] });
      }
    } catch (_) {}
    if (!signal.aborted) {
      setCanViewIncidentRecords(incidentAccess);
      onIncidentAccessChange?.(incidentAccess);
    }
  };

  /* Live permission catalog for the archetype editors. */
  const fetchPermissionCatalog = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/permissions`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.permissions) && data.permissions.length > 0) {
          setPermCatalog(data.permissions);
        }
      }
    } catch (_) {}
  };

  /* Permission gate — super admins always pass (unchanged legacy behaviour). */
  const can = (code: string) => myPerms.is_super || myPerms.permissions.includes(code);

  /* ── Adjusted manage-user-account feature (non-super admins) ──────
     Limited admins keep the full Users workflow for REGULAR accounts, but
     administrator accounts are hands-off for them (server-enforced):
       • other admins  <Icon name="arrow_forward" size={14} /> read-only “View” mode (403 on any write)
       • own account   <Icon name="arrow_forward" size={14} /> profile fields editable; role & status locked;
                         password override disabled (use Change password)
     Super admins see the console exactly as before. */
  const viewingAsLimited = !myPerms.is_super;
  const editingSelf = Boolean(editingUser && Number(editingUser.id) === Number(myPerms.userId));
  const editingAdminTarget = Boolean(editingUser && editingUser.role === 'ADMIN');
  const editingProtectedAdmin = viewingAsLimited && editingAdminTarget && !editingSelf;
  const editingSelfAdminLocked = viewingAsLimited && editingAdminTarget && editingSelf;

  /* Advanced editor: live BMI preview (the server-side generated column
     remains authoritative — this mirrors ROUND(weight / POW(height/100, 2), 2)). */
  const todayIso = new Date().toISOString().slice(0, 10);
  const previewBmi = (() => {
    if (!editHealth) return null;
    const h = Number(editHealth.height);
    const w = Number(editHealth.weight);
    if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
    return (w / Math.pow(h / 100, 2)).toFixed(2);
  })();

  const viewFetch = async (path: string, signal?: AbortSignal) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}${path}`, {
        headers: { Authorization: `Bearer ${token}` }, signal,
      });
      if (res.ok) return await res.json();
    } catch {
      // A refresh can leave the last successful result visible.
    }
    return undefined;
  };

  const fetchRetention = async (signal?: AbortSignal) => {
    const data = await viewFetch('/api/privacy/retention/status', signal);
    if (!signal?.aborted && data) setRetentionInfo(data);
  };

  const telemetryRequest = useRef<AbortController | null>(null);
  const fetchTelemetry = async () => {
    telemetryRequest.current?.abort();
    const request = new AbortController();
    telemetryRequest.current = request;
    const data = await viewFetch('/api/admin/telemetry', request.signal);
    if (!request.signal.aborted && data) setTelemetry(data);
  };

  const handleExecuteSweep = async () => {
    if (sweeping || !await confirmAction('Run retention sweep', 'Expired records will be soft-deleted under the five-year retention policy.')) return;
    setSweeping(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/privacy/retention/sweep`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'The sweep could not be completed.');
      notify(data.message || 'Retention sweep completed.');
      fetchRetention();
    } catch (err: any) {
      notify(`Sweep failed. ${err.message}`, true);
    } finally {
      setSweeping(false);
    }
  };

  useEffect(() => {
    fetchUsers();
    fetchPermissionCatalog();
  }, []);

  useEffect(() => {
    let pending: AbortController | undefined;
    const refresh = () => {
      pending?.abort();
      pending = new AbortController();
      void fetchMyPermissions(pending.signal);
    };
    refresh();
    window.addEventListener('focus', refresh);
    return () => {
      pending?.abort();
      window.removeEventListener('focus', refresh);
      onIncidentAccessChange?.(false);
    };
  }, [onIncidentAccessChange, onTerminalAccessChange]);

  // Refetch contextual data whenever the parent (sidebar) switches the active tab
  useEffect(() => {
    if (activeTab === 'archived') fetchArchivedUsers();
    if (activeTab === 'db') {
      fetchDbTables();
      setDbSearchFilter('');
      prevDbSearchRef.current = '';
      fetchTableData('USERS', 1, '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const canAudit = myPerms.userId !== null && can('AUDIT_VIEW');
  const canViewTelemetry = myPerms.userId !== null && can('TELEMETRY_VIEW');
  const canManageRetention = myPerms.userId !== null && can('RETENTION_MANAGE');

  useEffect(() => {
    if (activeTab !== 'audit' || !canAudit) return;
    const request = new AbortController();
    setLoadingLogs(true);
    void Promise.all([
      viewFetch('/api/admin/phi-access-logs', request.signal),
      viewFetch('/api/admin/audit-logs', request.signal),
    ]).then(([phi, mutations]) => {
      if (request.signal.aborted) return;
      if (Array.isArray(phi)) setPhiLogs(phi);
      if (Array.isArray(mutations)) setMutationLogs(mutations);
      setLoadingLogs(false);
    });
    return () => request.abort();
  }, [activeTab, canAudit]);

  useEffect(() => {
    if (activeTab !== 'telemetry') return;
    const request = new AbortController();
    if (canManageRetention) void fetchRetention(request.signal);
    if (canViewTelemetry) void fetchTelemetry();
    return () => {
      request.abort();
      telemetryRequest.current?.abort();
    };
  }, [activeTab, canManageRetention, canViewTelemetry]);

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
      const matchesQr = !userQrOnly || u.is_qualified_responder === true || u.is_qualified_responder === 1;
      return matchesSearch && matchesRole && matchesStatus && matchesQr;
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

    const archivedQuery = archivedSearchTerm.trim().toLowerCase();
    const filteredArchivedUsers = archivedUsers.filter((user) =>
      [user.id, user.name, user.email, user.role].some((value) =>
        String(value ?? '').toLowerCase().includes(archivedQuery),
      ),
    );

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
      const matchesRole = phiRoleFilter === 'ALL' || (log.viewer_roles ?? log.viewer_role).split(',').includes(phiRoleFilter);
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
  const handleArchiveUser = async (target: any) => {
    const targetLabel = target.name || `account #${target.id}`;
    if (archivingUserId !== null || !await confirmAction('Archive account',
      `Archive ${targetLabel} (#${target.id}). This disables sign-in and retains clinical and audit history.`)) return;

    const targetUserId = Number(target.id);
    setArchivingUserId(targetUserId);
    setUserActionFeedback(null);
    try {
      const token = localStorage.getItem('valetudo_token');
      if (!token) throw new Error('Your session has expired. Please sign in again.');

      const response = await fetch(`${API_BASE_URL}/api/admin/users/${targetUserId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || `Account archive failed (HTTP ${response.status}).`);
      }

      setUsersList((current) => current.filter((user) => Number(user.id) !== targetUserId));
      setUserActionFeedback({
        text: result.message || 'Account archived. Clinical and audit history has been retained.',
        isError: false,
      });
    } catch (error) {
      setUserActionFeedback({
        text: error instanceof Error ? error.message : 'Failed to archive account.',
        isError: true,
      });
    } finally {
      setArchivingUserId(null);
    }
  };

  const handleOpenEditModal = (u: any) => {
    setEditingUser({
      ...u,
      student_no: u.student_no || '',
      course: u.course || '',
      year_level: u.year_level || 1,
      faculty_no: u.faculty_no || '',
      employee_no: u.employee_no || '',
      license_no: u.license_no || '',
      admin_no: u.admin_no || '',
      specialty: u.specialty || '',
      department: u.department || '',
      position: u.position || '',
      is_active: u.status === 'Active' || u.is_active === 1 || u.is_active === true,
      // Qualified Responder (account property, shown on the Basic tab).
      is_qualified_responder: u.is_qualified_responder === true || u.is_qualified_responder === 1,
      qualified_responder_since: u.qualified_responder_since || null,
      qualified_responder_note: (u.qualified_responder_note || ''),
      sos_via_role: u.sos_via_role === true || u.sos_via_role === 1,
    });
    setEditQrOriginal({
      flag: u.is_qualified_responder === true || u.is_qualified_responder === 1,
      note: (u.qualified_responder_note || '').trim(),
    });
    setAdminPasswordInput('');
    setModalFeedback(null);
    /* Advanced editor: every open starts fresh in Basic mode. */
    setEditMode('basic');
    setEditHealth(null);
    setEditHealthLoaded(false);
    setEditHealthLoading(false);
    setEditHealthExists(false);
    setEditAccountMeta(null);
    fetchUserVaccinesForAdmin(u.id);

    /* Seed the admin-archetype editor state from the target's current grants. */
    const targetIsLimited = u.admin_archetype === 'limited';
    setEditAdminArchetype(
      targetIsLimited ? 'limited' : (myPerms.is_super ? 'super' : 'limited')
    );
    setEditAdminPerms(
      targetIsLimited
        ? (Array.isArray(u.admin_permissions) ? u.admin_permissions : [])
        : (myPerms.is_super ? [] : myPerms.permissions.filter((c) => c !== 'SUPER_ADMIN'))
    );
  };
const fetchUserVaccinesForAdmin = async (userId: number) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/patient/${userId}/immunizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setAdminUserVaccines(data.immunizations || []);
      }
    } catch (_) {
      setAdminUserVaccines([]);
    }
  };

  /* ── Advanced editor: lazily load the decrypted health record + account
     metadata the first time the operator switches to Advanced mode. */
  const fetchEditHealthProfile = async (userId: number) => {
    setEditHealthLoading(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${userId}/health-profile`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (res.ok) {
        setEditHealthExists(Boolean(data.health_profile));
        setEditHealth(
          data.health_profile
            ? {
                blood_type: data.health_profile.blood_type || '',
                allergies: data.health_profile.allergies || '',
                chronic_conditions: data.health_profile.chronic_conditions || '',
                emergency_contact_name: data.health_profile.emergency_contact_name || '',
                emergency_contact_phone: data.health_profile.emergency_contact_phone || '',
                sex: data.health_profile.sex || '',
                date_of_birth: data.health_profile.date_of_birth || '',
                height: data.health_profile.height ?? '',
                weight: data.health_profile.weight ?? '',
                bmi: data.health_profile.bmi ?? null,
                hp_version: data.health_profile.hp_version ?? null,
                hp_updated_at: data.health_profile.hp_updated_at || null,
              }
            : {
                blood_type: '', allergies: '', chronic_conditions: '',
                emergency_contact_name: '', emergency_contact_phone: '',
                sex: '', date_of_birth: '', height: '', weight: '',
                bmi: null, hp_version: null, hp_updated_at: null,
              }
        );
        setEditAccountMeta({ account: data.account, staff_signature: data.staff_signature });
        setEditHealthLoaded(true);
      } else {
        setModalFeedback({ text: data.error || 'Failed to load the health record.', isError: true });
      }
    } catch (err: any) {
      setModalFeedback({ text: 'Network error while loading the health record: ' + err.message, isError: true });
    } finally {
      setEditHealthLoading(false);
    }
  };

  const handleEditModeSwitch = (mode: 'basic' | 'advanced') => {
    setEditMode(mode);
    // Limited admins cannot read another administrator's health record
    // (the server 403s) — keep the section as a read-only notice.
    if (
      mode === 'advanced' && editingUser && !editHealthLoaded && !editHealthLoading &&
      !editingProtectedAdmin
    ) {
      fetchEditHealthProfile(Number(editingUser.id));
    }
  };

  const handleAdminAddVaccine = (vacName: string) => {
    const trimmed = vacName.trim();
    if (!trimmed || adminUserVaccines.includes(trimmed)) return;
    setAdminUserVaccines([...adminUserVaccines, trimmed]);
    setAdminNewVaccine('');
  };

  const handleAdminRemoveVaccine = (vacName: string) => {
    setAdminUserVaccines(adminUserVaccines.filter((v) => v !== vacName));
  };
  const handleSaveUserProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser || isSavingUser || resettingPassword) return;
    if (
      adminPasswordInput.trim() &&
      !await confirmAction('Save profile changes', 'The temporary password you entered is pending. Continue to save the profile with the current password.')
    ) return;
    // Adjusted manage-user-account feature: protected administrator accounts
    // are read-only for limited admins (the server 403s any write anyway).
    if (editingProtectedAdmin) {
      setModalFeedback({
        text: 'Read-only: only a Super Admin can modify another administrator account.',
        isError: true,
      });
      return;
    }
    // Guard: a Limited archetype with zero permissions would be stored as an
    // empty grant set, which the server treats as a LEGACY FULL admin — the
    // exact opposite of the operator's intent. Block it client-side (the
    // server rejects the empty set too).
    if (editingUser.role === 'ADMIN' && editAdminArchetype === 'limited' && editAdminPerms.length === 0) {
      setModalFeedback({
        text: 'Select at least one permission for the Limited Admin archetype (an empty set means full access).',
        isError: true,
      });
      return;
    }
    setIsSavingUser(true);
    setModalFeedback(null);
    // Advanced editor: only send health_profile once the health section has
    // been loaded (Basic mode / never-visited Advanced → the server leaves
    // the health record completely untouched).
    const healthPayload = editHealthLoaded && editHealth
      ? {
          blood_type: editHealth.blood_type || null,
          allergies: (editHealth.allergies || '').trim() || null,
          chronic_conditions: (editHealth.chronic_conditions || '').trim() || null,
          emergency_contact_name: (editHealth.emergency_contact_name || '').trim() || null,
          emergency_contact_phone: (editHealth.emergency_contact_phone || '').trim() || null,
          sex: editHealth.sex || null,
          date_of_birth: editHealth.date_of_birth || null,
          height: editHealth.height ? Number(editHealth.height) : null,
          weight: editHealth.weight ? Number(editHealth.weight) : null,
        }
      : null;
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
          faculty_no: editingUser.faculty_no,
          employee_no: editingUser.employee_no,
          license_no: editingUser.license_no,
          admin_no: editingUser.admin_no,
          specialty: editingUser.specialty,
          department: editingUser.department,
          position: editingUser.position,
          ...(healthPayload ? { health_profile: healthPayload } : {}),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setModalFeedback({ text: '' + data.message, isError: false });
        // Save updated immunization history
     await fetch(`${API_BASE_URL}/api/profile/patient/${editingUser.id}/immunizations`, {
       method: 'PUT',
       headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
       body: JSON.stringify({ immunizations: adminUserVaccines }),
     });

        /* Sync the Qualified Responder label (dedicated endpoint guarded by
           RESPONDERS_MANAGE). Reported separately — a failure here must never
           roll back the profile save (partial success, like permissions). */
        let qrWarning: string | null = null;
        const qrNoteNow = (editingUser.qualified_responder_note || '').trim();
        const qrFlagChanged = editQrOriginal ? editQrOriginal.flag !== Boolean(editingUser.is_qualified_responder) : false;
        const qrNoteChanged = editQrOriginal ? editQrOriginal.note !== qrNoteNow : false;
        if (editQrOriginal && (qrFlagChanged || qrNoteChanged)) {
          try {
            const qrRes = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}/qualified-responder`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
              body: JSON.stringify({
                is_qualified_responder: Boolean(editingUser.is_qualified_responder),
                // Note is only meaningful while the flag is ON; sending it
                // while ON keeps/edits it, and the server clears it on OFF.
                note: editingUser.is_qualified_responder ? qrNoteNow : undefined,
              }),
            });
            const qrData = await qrRes.json().catch(() => ({}));
            if (!qrRes.ok) {
              qrWarning = qrData.error || 'The Qualified Responder label was not changed.';
              setModalFeedback({ text: 'Profile saved, but the Qualified Responder label failed: ' + qrWarning, isError: true });
            } else {
              setEditQrOriginal({ flag: Boolean(editingUser.is_qualified_responder), note: qrNoteNow });
            }
          } catch (qrErr: any) {
            qrWarning = qrErr.message;
            setModalFeedback({ text: 'Profile saved, but the Qualified Responder label sync failed: ' + qrErr.message, isError: true });
          }
        }
        /* Sync admin archetype permissions (dedicated endpoint; the server
           enforces self-edit and super-only guards). Only Super Admins may
           modify administrator permission sets (adjusted feature). */
        let permWarning: string | null = null;
        if (editingUser.role === 'ADMIN' && myPerms.is_super) {
          const originalPerms = editingUser.admin_archetype === 'limited'
            ? (editingUser.admin_permissions || [])
            : ['SUPER_ADMIN'];
          const nextPerms = editAdminArchetype === 'super' ? ['SUPER_ADMIN'] : editAdminPerms;
          const permsChanged =
            JSON.stringify([...originalPerms].sort()) !== JSON.stringify([...nextPerms].sort());
          if (permsChanged) {
            try {
              const permRes = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}/permissions`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                body: JSON.stringify({ admin_permissions: nextPerms }),
              });
              const permData = await permRes.json();
              if (!permRes.ok) {
                permWarning = permData.error || 'Permissions were not changed.';
                setModalFeedback({ text: 'Profile saved, but permissions were not changed: ' + permWarning, isError: true });
              }
            } catch (permErr: any) {
              permWarning = permErr.message;
              setModalFeedback({ text: 'Profile saved, but permission sync failed: ' + permErr.message, isError: true });
            }
          }
        }
        fetchUsers();
        // Refresh the Advanced editor (BMI / versions) if it was in use.
        if (editHealthLoaded) fetchEditHealthProfile(Number(editingUser.id));
        if (!permWarning && !qrWarning) {
          setEditingUser(null);
          notify(data.message || 'Account profile saved.');
        }
      } else {
        setModalFeedback({ text: '' + (data.error || 'Failed to update profile.'), isError: true });
      }
    } catch (err: any) {
      setModalFeedback({ text: 'Error: ' + err.message, isError: true });
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleAdminResetPassword = async () => {
    if (!editingUser || resettingPassword || isSavingUser) return;
    if (adminPasswordInput.trim().length < 8) {
      setModalFeedback({ text: 'Enter a temporary password of at least 8 characters.', isError: true });
      document.getElementById('admin-temporary-password')?.focus();
      return;
    }
    const accountLabel = editingUser.name
      || [editingUser.first_name, editingUser.last_name].filter(Boolean).join(' ')
      || `account #${editingUser.id}`;
    if (!await confirmAction('Reset password',
      `Reset the password for ${accountLabel} (#${editingUser.id}). This immediately replaces the current password.`)) return;
    setResettingPassword(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users/${editingUser.id}/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ newPassword: adminPasswordInput.trim() }),
      });
      const data = await res.json();
      if (res.ok) {
        setModalFeedback({ text: '' + data.message, isError: false });
        setAdminPasswordInput('');
      } else {
        setModalFeedback({ text: '' + (data.error || 'Password reset failed.'), isError: true });
      }
    } catch (err: any) {
      setModalFeedback({ text: 'Network error: ' + err.message, isError: true });
    } finally {
      setResettingPassword(false);
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

  const prevDbSearchRef = useRef(dbSearchFilter);

  const fetchTableData = async (table = selectedDbTable, page = 1, search = dbSearchFilter) => {
    setLoadingDbTable(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const searchParam = search ? `&search=${encodeURIComponent(search.trim())}` : '';
      const res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${table}?page=${page}&limit=15${searchParam}`, {
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
        setTableReadOnlyReason(data.readOnlyReason ?? null);
      }
    } catch (err) {
      console.error('Failed to load table content:', err);
    } finally {
      setLoadingDbTable(false);
    }
  };

  useEffect(() => {
    if (activeTab !== 'db') return;
    if (prevDbSearchRef.current === dbSearchFilter) return;
    prevDbSearchRef.current = dbSearchFilter;
    const timer = setTimeout(() => {
      fetchTableData(selectedDbTable, 1, dbSearchFilter);
    }, 300);
    return () => clearTimeout(timer);
  }, [dbSearchFilter, activeTab, selectedDbTable]);

  const handleSaveDbRow = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!dbRowModal || dbBusy) return;
    setDbBusy(true);
    setDbError('');
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
      notify(result.message || 'Database row saved.');
      setDbRowModal(null);
      fetchTableData(selectedDbTable, tablePage);
    } catch (err: any) {
      setDbError(`Could not save the row. ${err.message}`);
    } finally {
      setDbBusy(false);
    }
  };

  const handleDeleteDbRow = async (row: any) => {
    if (isTableReadOnly || dbBusy) return;
    const pkCols = tableSchema.filter((c) => c.columnKey === 'PRI').map((c) => c.columnName);
    const primaryKeyObj: Record<string, any> = {};
    pkCols.forEach((col) => { primaryKeyObj[col] = row[col]; });
    const pkDescription = Object.entries(primaryKeyObj).map(([k, v]) => `${k}=${v}`).join(', ');
    if (!await confirmAction('Delete database row', `Delete record (${pkDescription}) from ${selectedDbTable}.`)) return;
    setDbBusy(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/db/tables/${selectedDbTable}/rows`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ primaryKey: primaryKeyObj }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete row.');
      notify(data.message || 'Database row deleted.');
      fetchTableData(selectedDbTable, tablePage);
    } catch (err: any) {
      notify(`Could not delete the row. ${err.message}`, true);
    } finally {
      setDbBusy(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════════ */
  /* RENDER                                                          */
  /* ═══════════════════════════════════════════════════════════════ */

  useTabMotion(activeTab, ['users', 'archived'], tab => `admin-account-panel-${tab}`,
    activeTab === 'users' || activeTab === 'archived');
  const activeUsersCount = usersList.filter((u) => u.status === 'Active').length;
  const suspendedUsersCount = usersList.length - activeUsersCount;

  return (
    <div style={{ width: '100%' }}>
      {notice}
      {confirmation}
      <div data-workspace-view>
      {/* ── Header ────────────────────────────────────────────── */}
      {activeTab !== 'terminal' && (activeTab !== 'analytics' || !can('ANALYTICS_VIEW')) && <div className="vd-page-head">
        <div className="vd-page-head-eyebrow">Administration</div>
        <h1 className="vd-page-head-title">
          {activeTab === 'users' && 'Users & roles'}
          {activeTab === 'archived' && 'Archived accounts'}
          {activeTab === 'audit' && 'Privacy & audit'}
          {activeTab === 'telemetry' && 'System health & retention'}
          {activeTab === 'analytics' && 'Health analytics'}
          {activeTab === 'incidents' && 'Incident records'}
          {activeTab === 'db' && 'Database Studio'}
          {activeTab === 'serverPolicy' && 'Server Policy'}
        </h1>
        <p className="vd-page-head-sub">
          {activeTab === 'users' && 'Manage institutional accounts, access permissions and account status. Seven RBAC roles govern access. Editing a user changes their assigned permissions; suspending an account disables access without deleting its profile.'}
          {activeTab === 'archived' && 'Review accounts that have been archived. Sign-in is disabled; associated clinical and audit history is retained.'}
          {activeTab === 'audit' && 'Trace access and changes to clinic information with read-only audit records.'}
          {activeTab === 'telemetry' && 'Service telemetry and clinical data lifecycle governance, in one place.'}
          {activeTab === 'analytics' && 'Campus illness trajectories, seasonal spike monitoring & health reports.'}
          {activeTab === 'incidents' && 'Official documentation and MinIO-archived PDF records of resolved emergency incidents.'}
          {activeTab === 'db' && 'Inspect and maintain system records · valetudo_healthlink'}
          {activeTab === 'serverPolicy' && 'Review and update rate limits, no-show grace, and appointment rules.'}
        </p>
      </div>}

      {activeTab === 'terminal' && (
        myPerms.userId === null ? <p role="status">Checking Terminal access…</p>
          : can('TERMINAL_VIEW') ? <ServerConsole />
          : <NoPermissionPanel required="TERMINAL_VIEW" />
      )}

      {activeTab === 'serverPolicy' && (
        myPerms.is_super
          ? <ServerPolicyPanel />
          : <NoPermissionPanel description="Server Policy requires Super Admin access." />
      )}

      {(activeTab === 'users' || activeTab === 'archived') && (
        <div
          role="tablist"
          aria-label="Account views"
          onKeyDown={event => navigateTabs(event, false)}
          style={{
            display: 'flex',
            gap: 8,
            marginBottom: 18,
            borderBottom: `1px solid ${T.border}`,
          }}
        >
          {([
            { key: 'users', label: 'Active accounts' },
            { key: 'archived', label: 'Archived accounts' },
          ] as const).map(({ key, label }) => {
            const isSelected = activeTab === key;
            return (
              <button
                key={key}
                type="button"
                role="tab"
                id={`admin-account-tab-${key}`}
                aria-controls={`admin-account-panel-${key}`}
                aria-selected={isSelected}
                tabIndex={isSelected ? 0 : -1}
                onClick={() => changeTab(key)}
                style={{
                  padding: '10px 14px',
                  border: 0,
                  borderBottom: `2px solid ${isSelected ? T.primary : 'transparent'}`,
                  background: 'transparent',
                  color: isSelected ? T.primary : T.textSub,
                  fontSize: 13,
                  fontWeight: isSelected ? 700 : 600,
                  fontFamily: T.font,
                  cursor: 'pointer',
                }}
              >
                {label}
              </button>
            );
          })}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: USERS                                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {(activeTab === 'users' || activeTab === 'archived') && <div id="admin-account-panel-users"
        role="tabpanel" aria-labelledby="admin-account-tab-users" tabIndex={0} hidden={activeTab !== 'users'}>
      {activeTab === 'users' && !can('USERS_MANAGE') && (<NoPermissionPanel required="USERS_MANAGE" />)}
      {activeTab === 'users' && can('USERS_MANAGE') && (
        <ActiveAccounts
          searchTerm={searchTerm}
          setSearchTerm={setSearchTerm}
          usersList={usersList}
          activeUsersCount={activeUsersCount}
          suspendedUsersCount={suspendedUsersCount}
          setShowCreateUserModal={setShowCreateUserModal}
          userRoleFilter={userRoleFilter}
          setUserRoleFilter={setUserRoleFilter}
          userStatusFilter={userStatusFilter}
          setUserStatusFilter={setUserStatusFilter}
          userQrOnly={userQrOnly}
          setUserQrOnly={setUserQrOnly}
          userSortKey={userSortKey}
          setUserSortKey={setUserSortKey}
          processedUsers={processedUsers}
          viewingAsLimited={viewingAsLimited}
          myPerms={myPerms}
          handleOpenEditModal={handleOpenEditModal}
          handleArchiveUser={handleArchiveUser}
          archivingUserId={archivingUserId}
          userActionFeedback={userActionFeedback}
        />
      )}
      </div>}
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: ARCHIVED ACCOUNTS                                     */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {(activeTab === 'users' || activeTab === 'archived') && <div id="admin-account-panel-archived"
        role="tabpanel" aria-labelledby="admin-account-tab-archived" tabIndex={0} hidden={activeTab !== 'archived'}>
      {activeTab === 'archived' && !can('USERS_MANAGE') && (<NoPermissionPanel required="USERS_MANAGE" />)}
      {activeTab === 'archived' && can('USERS_MANAGE') && (
        <ArchivedAccounts
          archivedUsersError={archivedUsersError}
          loadingArchivedUsers={loadingArchivedUsers}
          archivedUsers={archivedUsers}
          archivedSearchTerm={archivedSearchTerm}
          setArchivedSearchTerm={setArchivedSearchTerm}
          filteredArchivedUsers={filteredArchivedUsers}
        />
      )}
      </div>}
      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: AUDIT                                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'audit' && !can('AUDIT_VIEW') && (<NoPermissionPanel required="AUDIT_VIEW" />)}
      {activeTab === 'audit' && can('AUDIT_VIEW') && (
        <AuditPanels
          auditSubTab={auditSubTab}
          setAuditSubTab={setAuditSubTab}
          phiSearchTerm={phiSearchTerm}
          setPhiSearchTerm={setPhiSearchTerm}
          phiTableFilter={phiTableFilter}
          setPhiTableFilter={setPhiTableFilter}
          phiSortOrder={phiSortOrder}
          setPhiSortOrder={setPhiSortOrder}
          processedPhiLogs={processedPhiLogs}
          phiLogs={phiLogs}
          phiRoleFilter={phiRoleFilter}
          setPhiRoleFilter={setPhiRoleFilter}
          loadingLogs={loadingLogs}
          mutationSearchTerm={mutationSearchTerm}
          setMutationSearchTerm={setMutationSearchTerm}
          mutationSortOrder={mutationSortOrder}
          setMutationSortOrder={setMutationSortOrder}
          processedMutationLogs={processedMutationLogs}
          mutationLogs={mutationLogs}
          mutationActionFilter={mutationActionFilter}
          setMutationActionFilter={setMutationActionFilter}
        />
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: TELEMETRY / SYSTEM HEALTH                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'telemetry' && !can('TELEMETRY_VIEW') && !can('RETENTION_MANAGE') && (
        <NoPermissionPanel required="TELEMETRY_VIEW" />
      )}
      {activeTab === 'telemetry' && (can('TELEMETRY_VIEW') || can('RETENTION_MANAGE')) && (
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
                value: telemetry?.database?.totalUsers ?? '—',
                sub: 'Registered accounts',
                status: telemetry?.database?.status ?? 'Unknown',
                icon: <I.Database />,
              },
              {
                label: 'Redis 7.0 queue cache',
                value: telemetry?.cache?.status ? 'Redis' : '—',
                sub: 'Cache status',
                status: telemetry?.cache?.status ?? 'Unknown',
                icon: <I.Activity />,
              },
              {
                label: 'Socket.IO gateway',
                value: 'Socket.IO',
                sub: 'Queue and SOS relays',
                status: 'See connection status above',
                icon: <I.Activity />,
              },
              {
                label: 'R.A. 10173 cryptographic ledger',
                value: telemetry?.database?.totalAuditBlocks ?? '—',
                sub: 'Recorded audit blocks',
                status: 'Block count',
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

          {/* Live server ping monitor */}
          <ServerPingMonitor />
          {can('TELEMETRY_VIEW') && <WorkerHealth workers={telemetry?.workers} onRefresh={fetchTelemetry} />}
          {canViewTelemetry && <ConnectedUsers />}

          {/* Retention governance panel — RETENTION_MANAGE permission */}
          {can('RETENTION_MANAGE') ? (
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
                <Icon name="cleaning_services" size={14} /> {sweeping ? 'Executing sweep…' : 'Enforce retention sweep'}
              </button>
            </div>
          </div>
          ) : (
            <NoPermissionPanel required="RETENTION_MANAGE" />
          )}
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: ANALYTICS                                            */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'analytics' && !can('ANALYTICS_VIEW') && (<NoPermissionPanel required="ANALYTICS_VIEW" />)}
      {activeTab === 'analytics' && can('ANALYTICS_VIEW') && <AnalyticsDashboard />}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: INCIDENT RECORDS                                       */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'incidents' && (canViewIncidentRecords ? <IncidentRecords /> : <NoPermissionPanel required="INCIDENT_RECORDS_VIEW" />)}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* TAB: DATABASE STUDIO                                      */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {activeTab === 'db' && !can('DATABASE_MANAGE') && (<NoPermissionPanel required="DATABASE_MANAGE" />)}
      {activeTab === 'db' && can('DATABASE_MANAGE') && (
        <DatabaseStudio
          dbTablesList={dbTablesList}
          isTableReadOnly={isTableReadOnly}
          tableReadOnlyReason={tableReadOnlyReason}
          selectedDbTable={selectedDbTable}
          setSelectedDbTable={setSelectedDbTable}
          setDbSearchFilter={setDbSearchFilter}
          prevDbSearchRef={prevDbSearchRef}
          fetchTableData={fetchTableData}
          tableTotalRows={tableTotalRows}
          dbSearchFilter={dbSearchFilter}
          tablePage={tablePage}
          tableSchema={tableSchema}
          setDbRowModal={setDbRowModal}
          loadingDbTable={loadingDbTable}
          tableRows={tableRows}
          handleDeleteDbRow={handleDeleteDbRow}
          tableTotalPages={tableTotalPages}
        />
      )}

      </div>

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL: CREATE USER ACCOUNT                                 */}
      {/* ═══════════════════════════════════════════════════════════ */}
      <CreateUserModal
        isOpen={showCreateUserModal}
        onClose={() => setShowCreateUserModal(false)}
        onCreated={(message, error) => { notify(message, error); void fetchUsers(); }}
      />

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL: DB ROW INSERT / EDIT                                */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {dbRowModal && (
        <Dialog label={dbRowModal.isNew ? "Insert database row" : "Edit database row"} busy={dbBusy} onDismiss={() => { setDbError(''); setDbRowModal(null); }}>
          <div className="modal-card" style={{ maxWidth: 640 }}>
            <div className="dialog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <h3 tabIndex={-1} data-dialog-initial style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.text }}>
                {dbRowModal.isNew ? 'Insert database row' : 'Edit database row'}
              </h3>
              <button
                type="button"
                aria-label="Close database editor"
                disabled={dbBusy}
                onClick={() => { setDbError(''); setDbRowModal(null); }}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textSub }}
              ><Icon name="close" size={14} /></button>
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
              <strong><Icon name="warning" size={14} /> Direct database change.</strong> Committing writes directly to this system record.
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
                          {isPK && <span style={{ color: T.warning, marginRight: 4 }}><Icon name="key" size={14} /></span>}
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

              <div className="dialog-footer">
                {dbError && <p role="alert" className="dialog-error">{dbError}</p>}
                <button type="button" disabled={dbBusy} onClick={() => { setDbError(''); setDbRowModal(null); }} style={btnGhost}>
                  Cancel
                </button>
                <button type="submit" style={btnPrimary} disabled={dbBusy}>
                  <Icon name="save" size={14} /> {dbBusy ? "Saving…" : "Commit to database"}
                </button>
              </div>
            </form>
          </div>
        </Dialog>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* MODAL: USER PROFILE EDIT                                   */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {editingUser && (
        <Dialog label="Manage user account" size="wide" busy={isSavingUser || resettingPassword} className="admin-profile-editor-backdrop" onDismiss={() => setEditingUser(null)}>
          <div
            className="modal-card admin-profile-editor"
            style={{
              width: 'min(1180px, calc(100vw - 40px))',
              maxWidth: 1180,
              height: 'min(90vh, 900px)',
              maxHeight: 'min(90vh, 900px)',
              padding: 0,
              overflow: 'hidden',
            }}
          >
            <div className="admin-profile-editor__layout" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(260px, 1fr)', height: '100%' }}>
              {/* LEFT: form */}
              <div className="admin-profile-editor__form-pane">
                <div className="admin-profile-editor__scroll">
                <div className="dialog-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div>
                    <h2 tabIndex={-1} data-dialog-initial style={{ fontSize: 24, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.5 }}>
                      Manage user account
                    </h2>
                    <p style={{ fontSize: 13, color: T.textSub, margin: '6px 0 0' }}>
                      {editingUser.name} · User ID {editingUser.id}
                    </p>
                  </div>
                </div>

                {editingProtectedAdmin && (
                  <div style={{
                    marginTop: 16, padding: '12px 16px',
                    borderRadius: T.radius.md,
                    background: '#FFFBEB', border: '1px solid #FDE68A',
                    fontSize: 12.5, color: T.warning, lineHeight: 1.55,
                    display: 'flex', gap: 8, alignItems: 'flex-start',
                  }}>
                    <span style={{ fontSize: 15, lineHeight: 1.3 }}><Icon name="lock" size={14} /></span>
                    <span>
                      <b>Administrator account — read-only view.</b> Only a Super Admin can
                      modify administrator accounts, change admin roles, edit admin
                      permissions or override admin passwords.
                    </span>
                  </div>
                )}

                {/* ── Basic / Advanced editor switch ───────────────────────────────────────────────
                    Basic keeps the everyday fields; Advanced exposes every
                    editable column in the schema (sub-profiles + the
                    encrypted HEALTH_PROFILES record). */}
                <div className="admin-profile-editor__mode-toggle" style={{
                  marginTop: 20, padding: 4,
                  background: T.sage100, border: `1px solid ${T.border}`,
                  borderRadius: T.radius.pill, display: 'flex', gap: 6, flexWrap: 'wrap',
                }}>
                  <button type="button" onClick={() => handleEditModeSwitch('basic')} style={modeBtnStyle(editMode === 'basic')}>
                    <Icon name="edit" size={14} /> Basic
                  </button>
                  <button type="button" onClick={() => handleEditModeSwitch('advanced')} style={modeBtnStyle(editMode === 'advanced')}>
                    <Icon name="settings" size={14} /> Advanced · full schema
                  </button>
                </div>
                <p style={{ fontSize: 11.5, color: T.textMuted, margin: '8px 2px 0', lineHeight: 1.5 }}>
                  {editMode === 'basic'
                    ? 'Everyday account fields — identity, contact, role and professional details.'
                    : 'Adds every HEALTH_PROFILES column (sex, date of birth, blood type, body metrics, encrypted allergies & conditions, emergency contacts) plus system metadata.'}
                </p>

                <form id="admin-account-form" onSubmit={handleSaveUserProfile} style={{ marginTop: 22 }}>
                  {/* Read-only shield for protected admin accounts: a disabled
                      fieldset locks every input/select/button inside at once. */}
                  <fieldset disabled={editingProtectedAdmin} style={{ border: 'none', padding: 0, margin: 0 }}>
                  {/* Identity & contact */}
                  <div style={{ marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase' }}>
                    Identity & contact
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 20 }}>
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

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 20 }}>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Assigned RBAC role
                      </label>
                      <select
                        style={inputStyle}
                        value={editingUser.role}
                        disabled={editingProtectedAdmin || editingSelfAdminLocked}
                        onChange={(e) => setEditingUser({ ...editingUser, role: e.target.value })}
                      >
                        <option value="STUDENT">STUDENT</option>
                        <option value="FACULTY">FACULTY</option>
                        <option value="NON_TEACHING">NON_TEACHING</option>
                        <option value="DOCTOR">DOCTOR</option>
                        <option value="DENTIST">DENTIST</option>
                        <option value="NURSE">NURSE</option>
                        <option value="EMERGENCY_RESPONDER">EMERGENCY_RESPONDER</option>
                        <option value="ADMIN" disabled={viewingAsLimited}>ADMIN</option>
                      </select>
                      {viewingAsLimited && editingUser.role !== 'ADMIN' && (
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5, fontStyle: 'italic' }}>
                          <Icon name="lock" size={14} /> Only a Super Admin can assign the ADMIN role.
                        </div>
                      )}
                      {editingSelfAdminLocked && (
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5, fontStyle: 'italic' }}>
                          <Icon name="lock" size={14} /> Administrator roles can only be changed by a Super Admin.
                        </div>
                      )}
                    </div>
                    <div>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                        Account status
                      </label>
                      <select
                        style={inputStyle}
                        value={editingUser.is_active ? '1' : '0'}
                        disabled={editingProtectedAdmin || editingSelfAdminLocked}
                        onChange={(e) => setEditingUser({ ...editingUser, is_active: e.target.value === '1' })}
                      >
                        <option value="1">Active</option>
                        <option value="0">Suspended / deactivated</option>
                      </select>
                      {editingSelfAdminLocked && (
                        <div style={{ fontSize: 11, color: T.textMuted, marginTop: 5, fontStyle: 'italic' }}>
                          <Icon name="lock" size={14} /> Your own admin account status is managed by a Super Admin.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Role-specific fields */}
                  <div style={{ marginTop: 24, marginBottom: 8, fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase' }}>
                    Professional details
                  </div>

                  {editingUser.role === 'STUDENT' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 14, marginBottom: 20 }}>
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

                  {/* Clinical staff — doctors, dentists, nurses, responders */}
                  {['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER'].includes(editingUser.role) && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 20 }}>
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

                  {myPerms.userId !== null && myPerms.is_super && ['DOCTOR', 'DENTIST', 'NURSE'].includes(editingUser.role) &&
                    usersList.find(user => user.id === editingUser.id)?.role === editingUser.role &&
                    <StaffAnalyticsPermissions key={editingUser.id} userId={editingUser.id} />}

                  {/* ADMIN — admin number replaces PRC license */}
                  {editingUser.role === 'ADMIN' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Admin number
                        </label>
                        <input
                          style={inputStyle}
                          value={editingUser.admin_no || ''}
                          placeholder="PSU-ADM-2024-0001"
                          onChange={(e) => setEditingUser({ ...editingUser, admin_no: e.target.value })}
                        />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Specialty / scope
                        </label>
                        <input style={inputStyle} value={editingUser.specialty || ''}
                               placeholder="System Administration"
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

                  {/* ADMIN ARCHETYPE — permission grants editor */}
                  {editingUser.role === 'ADMIN' && (
                    <div style={{
                      marginBottom: 20, padding: 16,
                      borderRadius: T.radius.md,
                      background: '#F5F3FF', border: '1px solid #DDD6FE',
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10, gap: 10, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 12.5, fontWeight: 800, color: '#6D28D9' }}>
                          <Icon name="shield" size={14} /> Admin archetype &amp; permissions
                        </span>
                        {editingUser.id === myPerms.userId && (
                          <span style={{ fontSize: 10.5, color: '#5B21B6', fontStyle: 'italic' }}>
                            This is your own account — permissions cannot be self-modified
                          </span>
                        )}
                      </div>

                      {myPerms.is_super ? (
                        <>
                          <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                            <button
                              type="button"
                              onClick={() => setEditAdminArchetype('super')}
                              disabled={!myPerms.is_super}
                              style={{
                                flex: 1, padding: '9px 12px',
                                border: `1px solid ${editAdminArchetype === 'super' ? '#6D28D9' : 'transparent'}`,
                                borderRadius: T.radius.pill,
                                background: editAdminArchetype === 'super' ? '#FFFFFF' : 'transparent',
                                color: editAdminArchetype === 'super' ? '#6D28D9' : T.textSub,
                                fontWeight: editAdminArchetype === 'super' ? 800 : 600,
                                fontSize: 12, fontFamily: T.font,
                                cursor: !myPerms.is_super ? 'not-allowed' : 'pointer',
                                opacity: !myPerms.is_super ? 0.55 : 1,
                                boxShadow: editAdminArchetype === 'super' ? T.shadow.xs : 'none',
                                transition: 'all 120ms ease',
                                whiteSpace: 'nowrap',
                              }}
                              title={!myPerms.is_super ? 'Only a Super Admin can assign the SUPER_ADMIN archetype' : undefined}
                            >
                              <Icon name="shield" size={14} /> Super Admin · full access
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditAdminArchetype('limited')}
                              style={{
                                flex: 1, padding: '9px 12px',
                                border: `1px solid ${editAdminArchetype === 'limited' ? '#6D28D9' : 'transparent'}`,
                                borderRadius: T.radius.pill,
                                background: editAdminArchetype === 'limited' ? '#FFFFFF' : 'transparent',
                                color: editAdminArchetype === 'limited' ? '#6D28D9' : T.textSub,
                                fontWeight: editAdminArchetype === 'limited' ? 800 : 600,
                                fontSize: 12, fontFamily: T.font,
                                cursor: 'pointer',
                                boxShadow: editAdminArchetype === 'limited' ? T.shadow.xs : 'none',
                                transition: 'all 120ms ease',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              <Icon name="settings" size={14} /> Limited Admin · choose permissions
                            </button>
                          </div>

                          {editAdminArchetype === 'super' ? (
                            <p style={{ fontSize: 12, color: '#5B21B6', margin: 0, lineHeight: 1.55 }}>
                              Unrestricted access to every console capability — identical to the
                              seeded administrator account.
                            </p>
                          ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 8 }}>
                              {permCatalog.filter((p: any) => p.code !== 'SUPER_ADMIN').map((p: any) => {
                                const checked = editAdminPerms.includes(p.code);
                                const beyondCaller = !myPerms.is_super && !myPerms.permissions.includes(p.code);
                                return (
                                  <label
                                    key={p.code}
                                    style={{
                                      display: 'flex', alignItems: 'flex-start', gap: 8,
                                      padding: '9px 11px',
                                      borderRadius: T.radius.sm,
                                      background: checked ? '#EDE9FE' : '#FFFFFF',
                                      border: `1px solid ${checked ? '#C4B5FD' : '#E9E5F8'}`,
                                      cursor: beyondCaller ? 'not-allowed' : 'pointer',
                                      opacity: beyondCaller ? 0.55 : 1,
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={checked}
                                      disabled={beyondCaller}
                                      onChange={() =>
                                        setEditAdminPerms((prev) =>
                                          prev.includes(p.code) ? prev.filter((c) => c !== p.code) : [...prev, p.code]
                                        )
                                      }
                                      style={{ marginTop: 2, accentColor: '#6D28D9' }}
                                    />
                                    <span>
                                      <span style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.text }}>
                                        {p.name}
                                      </span>
                                      <span style={{ display: 'block', fontSize: 10.5, color: T.textSub, marginTop: 1, lineHeight: 1.4 }}>
                                        {p.description}
                                      </span>
                                    </span>
                                  </label>
                                );
                              })}
                            </div>
                          )}
                        </>
                      ) : (
                        <p style={{ fontSize: 12, color: '#5B21B6', margin: 0, lineHeight: 1.55 }}>
                          <Icon name="lock" size={14} /> Only a Super Admin can modify administrator permissions
                          {editingUser.admin_archetype === 'super'
                            ? ' — this is a full-access administrator.'
                            : '.'}
                        </p>
                      )}
                    </div>
                  )}

                  {editingUser.role === 'FACULTY' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Faculty number
                        </label>
                        <input
                          style={inputStyle}
                          value={editingUser.faculty_no || ''}
                          placeholder="PSU-FAC-2024-0451"
                          onChange={(e) => setEditingUser({ ...editingUser, faculty_no: e.target.value })}
                        />
                      </div>
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

                  {editingUser.role === 'NON_TEACHING' && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 20 }}>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Employee no. (optional)
                        </label>
                        <input style={inputStyle} value={editingUser.employee_no || ''}
                               placeholder="PSU-NT-2024-0187"
                               onChange={(e) => setEditingUser({ ...editingUser, employee_no: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Department / office
                        </label>
                        <input style={inputStyle} value={editingUser.department || ''}
                               placeholder="Campus Maintenance & Facilities"
                               onChange={(e) => setEditingUser({ ...editingUser, department: e.target.value })} />
                      </div>
                      <div>
                        <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                          Position
                        </label>
                        <input style={inputStyle} value={editingUser.position || ''}
                               placeholder="Utility Worker"
                               onChange={(e) => setEditingUser({ ...editingUser, position: e.target.value })} />
                      </div>
                    </div>
                  )}

                  {/* ── QUALIFIED RESPONDER — account property, every role ──
                      Not a health field: it lives on the Basic tab for every
                      role. The flag is ADDITIVE: accounts that already
                      receive SOS through their role keep it when off. */}
                  <div style={{
                    marginTop: 24, marginBottom: 20, padding: 16,
                    borderRadius: T.radius.md,
                    background: '#FFF7ED', border: '1px solid #FED7AA',
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: '#C2410C' }}>
                        <Icon name="emergency" size={14} /> Emergency response · Qualified Responder
                      </span>
                      <label
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 8,
                          cursor: (can('RESPONDERS_MANAGE') && !(editingUser.role === 'ADMIN' && !myPerms.is_super))
                            ? 'pointer' : 'not-allowed',
                          opacity: (can('RESPONDERS_MANAGE') && !(editingUser.role === 'ADMIN' && !myPerms.is_super)) ? 1 : 0.6,
                          fontWeight: 700, fontSize: 12.5, color: T.text,
                        }}
                        title={
                          !can('RESPONDERS_MANAGE')
                            ? 'Requires the RESPONDERS_MANAGE permission (ask a Super Admin).'
                            : (editingUser.role === 'ADMIN' && !myPerms.is_super)
                              ? 'Only a Super Admin may change this label on an administrator account.'
                              : 'Label this account a Qualified Responder — it will receive Emergency SOS alarms on any role.'
                        }
                      >
                        <input
                          type="checkbox"
                          checked={Boolean(editingUser.is_qualified_responder)}
                          disabled={!can('RESPONDERS_MANAGE') || (editingUser.role === 'ADMIN' && !myPerms.is_super)}
                          onChange={(e) => setEditingUser({ ...editingUser, is_qualified_responder: e.target.checked })}
                          style={{ width: 16, height: 16, accentColor: '#C2410C' }}
                        />
                        Qualified Responder
                      </label>
                    </div>

                    <p style={{ fontSize: 11.5, color: T.textSub, margin: '0 0 12px', lineHeight: 1.55 }}>
                      Role-independent SOS label. A labelled account receives Emergency SOS
                      alarms and can act on them — whatever its role is.{' '}
                      {Boolean(editingUser.sos_via_role) && (
                        <b style={{ color: '#9A3412' }}>
                          This account also receives SOS through its {editingUser.role} role —
                          turning the label off will NOT stop role-based alerts (change the role instead).
                        </b>
                      )}
                    </p>

                    {Boolean(editingUser.is_qualified_responder) && (
                      <>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 14 }}>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                              Note (max 150 chars)
                            </label>
                            <input
                              style={inputStyle}
                              maxLength={150}
                              placeholder="e.g. First-aid certified, campus volunteer responder"
                              value={editingUser.qualified_responder_note || ''}
                              disabled={!can('RESPONDERS_MANAGE') || (editingUser.role === 'ADMIN' && !myPerms.is_super)}
                              onChange={(e) => setEditingUser({ ...editingUser, qualified_responder_note: e.target.value })}
                            />
                          </div>
                          <div>
                            <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6 }}>
                              Qualified since
                            </label>
                            <input
                              style={{ ...inputStyle, background: '#FFFDF9' }}
                              readOnly
                              value={editingUser.qualified_responder_since || '—'}
                              title="Read-only: set automatically when the label was granted"
                            />
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {/* ── ADVANCED: Health record — every HEALTH_PROFILES column ── */}
                  {editMode === 'advanced' && (
                    <HealthProfileEditor
                      editingProtectedAdmin={editingProtectedAdmin}
                      editHealthExists={editHealthExists}
                      editHealthLoading={editHealthLoading}
                      editHealth={editHealth}
                      setEditHealth={setEditHealth}
                      todayIso={todayIso}
                      previewBmi={previewBmi}
                    />
                  )}

                  {/* ── ADVANCED: system & integrity metadata (read-only) ── */}
                  {editMode === 'advanced' && (
                    <div style={{
                      marginTop: 16, padding: 16,
                      borderRadius: T.radius.md,
                      background: T.sage100, border: `1px solid ${T.sage300}`,
                    }}>
                      <div style={{ fontSize: 13, fontWeight: 800, color: T.primary, marginBottom: 12 }}>
                        <Icon name="badge" size={14} /> System &amp; integrity metadata
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: '8px 18px' }}>
                        {[
                          { label: 'User ID', value: `#${editingUser.id}` },
                          { label: 'Account version', value: editAccountMeta?.account?.version != null ? `v${editAccountMeta.account.version}` : '—' },
                          { label: 'Account created', value: editAccountMeta?.account?.created_at ? new Date(editAccountMeta.account.created_at).toLocaleString() : '—' },
                          { label: 'Account last updated', value: editAccountMeta?.account?.updated_at ? new Date(editAccountMeta.account.updated_at).toLocaleString() : '—' },
                          { label: 'Health record version', value: editHealth?.hp_version != null ? `v${editHealth.hp_version}` : '—' },
                          { label: 'Health record updated', value: editHealth?.hp_updated_at || '—' },
                          ...(editAccountMeta?.staff_signature ? [{
                            label: 'Clinical signature',
                            value: editAccountMeta.staff_signature.enrolled
                              ? `Enrolled · ${editAccountMeta.staff_signature.updated_at || 'date unknown'}`
                              : 'Not enrolled',
                          }] : []),
                        ].map((row) => (
                          <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, borderBottom: `1px dashed ${T.sage300}`, paddingBottom: 6 }}>
                            <span style={{ fontSize: 11.5, color: T.textMuted, fontWeight: 600 }}>{row.label}</span>
                            <span style={{ fontSize: 11.5, color: T.textSub, fontWeight: 700, textAlign: 'right' }}>{row.value}</span>
                          </div>
                        ))}
                      </div>
                      <p style={{ fontSize: 10.5, color: T.textMuted, margin: '10px 0 0', fontStyle: 'italic' }}>
                        Read-only: signatures are enrolled cryptographically via the Signature Enrollment screen.
                      </p>
                    </div>
                  )}

                  {/* Admin password override panel */}
                  {/* <Icon name="vaccines" size={14} /> SECTION: VACCINATION / IMMUNIZATION RECORDS */}
                  <div style={{
                    background: T.tonalTealBg,
                    padding: 16,
                    borderRadius: T.radius.md,
                    border: '1px solid #99F6E4',
                    marginBottom: 16,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{ fontSize: 13, fontWeight: 800, color: T.tonalTealFg }}>
                        <Icon name="vaccines" size={14} /> Vaccination & Immunization History
                      </span>
                      <span style={{ fontSize: 11.5, color: T.textSub, fontWeight: 600 }}>
                        {adminUserVaccines.length} vaccine(s) on file
                      </span>
                    </div>

                    {/* Badges List */}
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                      {adminUserVaccines.length === 0 ? (
                        <span style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
                          No immunization records on file. Type a vaccine below to add.
                        </span>
                      ) : (
                        adminUserVaccines.map((v) => (
                          <span
                            key={v}
                            style={{
                              padding: '4px 12px',
                              borderRadius: 20,
                              background: '#CCFBF1',
                              color: T.tonalTealFg,
                              fontSize: 11.5,
                              fontWeight: 700,
                              border: '1px solid #99F6E4',
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 6,
                            }}
                          >
                            <Icon name="check" size={14} /> {v}
                            <button
                              type="button"
                              onClick={() => handleAdminRemoveVaccine(v)}
                              style={{ background: 'none', border: 'none', color: T.danger, cursor: 'pointer', fontWeight: 900, padding: 0, fontSize: 12 }}
                            >
                              <Icon name="close" size={14} />
                            </button>
                          </span>
                        ))
                      )}
                    </div>

                    {/* Add Input */}
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <input
                        type="text"
                        placeholder="Add vaccine (e.g. Hepatitis B, COVID-19 Booster, Anti-Rabies)..."
                        value={adminNewVaccine}
                        onChange={(e) => setAdminNewVaccine(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAdminAddVaccine(adminNewVaccine);
                          }
                        }}
                        style={{ ...inputStyle, flex: 1, padding: '7px 12px', fontSize: 12.5 }}
                      />
                      <button
                        type="button"
                        onClick={() => handleAdminAddVaccine(adminNewVaccine)}
                        style={{ ...btnGhost, padding: '7px 16px', fontSize: 12.5, fontWeight: 700, color: T.tonalTealFg, borderColor: '#9FD9CB' }}
                      >
                        + Add Vaccine
                      </button>
                    </div>
                  </div>
                  {/* Adjusted manage-user-account feature: administrator passwords
                      (Super Admins included) can only be overridden by a Super
                      Admin. Limited admins keep the override for regular users. */}
                  {viewingAsLimited && editingUser.role === 'ADMIN' ? (
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
                        <Icon name="key" size={14} /> Password admin override
                      </div>
                      <p style={{ fontSize: 12, color: '#5B21B6', margin: 0, lineHeight: 1.55 }}>
                        <Icon name="lock" size={14} /> Only a Super Admin can override an administrator password.
                        {editingSelf
                          ? ' To change your own password, use the Change password screen after closing this window.'
                          : ' Ask a Super Admin if this administrator is locked out.'}
                      </p>
                    </div>
                  ) : (
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
                      <Icon name="key" size={14} /> Password admin override
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
                        id="admin-temporary-password"
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
                        disabled={resettingPassword || isSavingUser}
                        onClick={handleAdminResetPassword}
                        style={{
                          padding: '0 18px', borderRadius: T.radius.pill,
                          background: T.tonalLilacFg, color: getTextColorOn(T.tonalLilacFg),
                          border: 'none', fontWeight: 700, fontSize: 12.5,
                          cursor: 'pointer', fontFamily: T.font,
                        }}
                      >
                        {resettingPassword ? 'Resetting…' : 'Force reset'}
                      </button>
                    </div>
                    <div style={{ fontSize: 11, color: '#5B21B6', marginTop: 8, fontStyle: 'italic' }}>
                      Only this action applies the password override.
                    </div>
                  </div>
                  )}

                  </fieldset>
                </form>
                </div>
                <div className="dialog-footer admin-profile-editor__actions">
                  {modalFeedback && (
                    <div role={modalFeedback.isError ? 'alert' : 'status'} style={{ flexBasis: '100%',
                      padding: '12px 16px', borderRadius: T.radius.md,
                      fontSize: 12.5, fontWeight: 600,
                      background: modalFeedback.isError ? T.dangerSoft : T.successSoft,
                      color: modalFeedback.isError ? T.danger : T.success,
                      border: `1px solid ${modalFeedback.isError ? T.dangerBorder : T.successBorder}`,
                    }}>
                      {modalFeedback.text}
                    </div>
                  )}

                    <button type="button" disabled={isSavingUser || resettingPassword} onClick={() => setEditingUser(null)} style={btnGhost}>
                      Close
                    </button>
                    {!editingProtectedAdmin && (
                      <button
                        type="submit"
                        form="admin-account-form"
                        disabled={isSavingUser || resettingPassword}
                        style={{
                          ...btnPrimary,
                          opacity: isSavingUser ? 0.6 : 1,
                          cursor: isSavingUser ? 'not-allowed' : 'pointer',
                        }}
                      >
                        {isSavingUser ? 'Saving…' : 'Save profile changes'}
                      </button>
                    )}
                </div>
              </div>

              {/* RIGHT: side info panel */}
              <div className="admin-profile-editor__info-pane" style={{
                background: T.sage100,
                padding: '28px 24px',
                display: 'flex', flexDirection: 'column', gap: 24,
                minHeight: 0, overflowY: 'auto',
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
                    Switch to <b>Advanced</b> to edit every schema column,
                    including the encrypted health record.
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
        </Dialog>
      )}
    </div>
  );
}
