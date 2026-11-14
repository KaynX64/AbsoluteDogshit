import { T, inputStyle, rolePill } from '../../theme';
import Icon from '../../shared/ui/Icon';

export interface AccountListRow {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  archived_at?: string | null;
  is_qualified_responder?: boolean | number;
  qualified_responder_since?: string | null;
  qualified_responder_note?: string | null;
  admin_archetype?: string | null;
  admin_permissions?: string[];
}

interface ActiveAccountsProps {
  searchTerm: string;
  setSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  usersList: AccountListRow[];
  activeUsersCount: number;
  suspendedUsersCount: number;
  setShowCreateUserModal: React.Dispatch<React.SetStateAction<boolean>>;
  userRoleFilter: string;
  setUserRoleFilter: React.Dispatch<React.SetStateAction<string>>;
  userStatusFilter: "ALL" | "Active" | "Suspended";
  setUserStatusFilter: React.Dispatch<React.SetStateAction<"ALL" | "Active" | "Suspended">>;
  userQrOnly: boolean;
  setUserQrOnly: React.Dispatch<React.SetStateAction<boolean>>;
  userSortKey: "id_asc" | "id_desc" | "name_asc" | "name_desc" | "role";
  setUserSortKey: React.Dispatch<React.SetStateAction<"id_asc" | "id_desc" | "name_asc" | "name_desc" | "role">>;
  processedUsers: AccountListRow[];
  viewingAsLimited: boolean;
  myPerms: { userId: number | null; archetype: string; is_super: boolean; permissions: string[]; };
  handleOpenEditModal: (user: AccountListRow) => void;
  handleArchiveUser: (user: AccountListRow) => Promise<void>;
  archivingUserId: number | null;
  userActionFeedback: { text: string; isError: boolean } | null;
}

export default function ActiveAccounts({
  searchTerm,
  setSearchTerm,
  usersList,
  activeUsersCount,
  suspendedUsersCount,
  setShowCreateUserModal,
  userRoleFilter,
  setUserRoleFilter,
  userStatusFilter,
  setUserStatusFilter,
  userQrOnly,
  setUserQrOnly,
  userSortKey,
  setUserSortKey,
  processedUsers,
  viewingAsLimited,
  myPerms,
  handleOpenEditModal,
  handleArchiveUser,
  archivingUserId,
  userActionFeedback,
}: ActiveAccountsProps) {
  return (
    <div>
      {/* Search + count row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, marginBottom: 14, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
          <span style={{
            position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
            color: T.textMuted, display: 'grid', placeItems: 'center',
          }}>
            <Icon name="search" size={16} />
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
          <button
            type="button"
            onClick={() => setShowCreateUserModal(true)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 16px',
              borderRadius: T.radius.pill,
              background: T.primary,
              color: T.textOnPrimary,
              border: 'none',
              fontSize: 12.5,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: T.font,
              boxShadow: '0 4px 12px rgba(31,74,52,0.18)',
              transition: 'background 120ms ease',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = T.primaryDark)}
            onMouseLeave={(e) => (e.currentTarget.style.background = T.primary)}
          >
            <span style={{ fontSize: 14, lineHeight: 1 }}>＋</span>
            Add account
          </button>
        </div>
      </div>

      <div className="admin-user-filterbar">
        <div className="admin-user-filter-groups">
          <div className="admin-filter-section">
            <span className="admin-filter-section-label">Role</span>
            <div className="admin-filter-control" role="group" aria-label="Filter accounts by role">
              {[
                { code: 'ALL', label: 'All roles', icon: 'groups' },
                { code: 'DOCTOR', label: 'Doctor', icon: 'stethoscope' },
                { code: 'DENTIST', label: 'Dentist', icon: 'dentistry' },
                { code: 'NURSE', label: 'Nurse', icon: 'medical_information' },
                { code: 'STUDENT', label: 'Student', icon: 'school' },
                { code: 'FACULTY', label: 'Faculty', icon: 'co_present' },
                { code: 'NON_TEACHING', label: 'Non-Teaching', icon: 'badge' },
                { code: 'EMERGENCY_RESPONDER', label: 'Responder', icon: 'emergency' },
                { code: 'ADMIN', label: 'Admin', icon: 'admin_panel_settings' },
              ].map((r) => {
                const isSelected = userRoleFilter === r.code;
                return (
                  <button
                    key={r.code}
                    type="button"
                    className={`admin-filter-button${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setUserRoleFilter(r.code)}
                  >
                    <Icon name={r.icon} size={14} /> {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="admin-filter-section">
            <span className="admin-filter-section-label">Status</span>
            <div className="admin-filter-control" role="group" aria-label="Filter accounts by status">
              {(['ALL', 'Active', 'Suspended'] as const).map((s) => {
                const isSelected = userStatusFilter === s;
                return (
                  <button
                    key={s}
                    type="button"
                    className={`admin-filter-button${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setUserStatusFilter(s)}
                  >
                    {s !== 'ALL' && <span className={`admin-status-dot admin-status-dot-${s.toLowerCase()}`} aria-hidden="true" />}
                    {s === 'ALL' ? 'All statuses' : s}
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={`admin-qualified-filter${userQrOnly ? ' is-selected' : ''}`}
            aria-pressed={userQrOnly}
            onClick={() => setUserQrOnly((v) => !v)}
            title="Show only accounts labelled Qualified Responder (role-independent SOS label)"
          >
            <Icon name="emergency" size={16} tone={userQrOnly ? 'warning' : 'sub'} />
            <span>Qualified responders</span>
            <span className="admin-qualified-switch" aria-hidden="true" />
          </button>
        </div>

        <select
          className="admin-filter-sort"
          value={userSortKey} aria-label="Sort accounts"
          onChange={(e) => setUserSortKey(e.target.value as typeof userSortKey)}
        >
          <option value="id_asc">ID: Lowest first</option>
          <option value="id_desc">ID: Highest first</option>
          <option value="name_asc">Name: A to Z</option>
          <option value="name_desc">Name: Z to A</option>
          <option value="role">Role: A to Z</option>
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
        <div className="vd-table-wrap" style={{ overflowX: "auto" }}>
          <table className="tbl" style={{ minWidth: 820 }}>
            <thead>
              <tr>
                <th style={{ width: 90 }}>User ID</th>
                <th>Full name</th>
                <th>Institutional email</th>
                <th>Assigned RBAC role</th>
                <th style={{ width: 110 }}>Status</th>
                <th style={{ width: 190, textAlign: 'right' }}>Action</th>
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
                    {(u.is_qualified_responder === true || u.is_qualified_responder === 1) && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          marginLeft: 8, padding: '2px 9px',
                          borderRadius: T.radius.pill,
                          fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
                          background: '#FFF7ED', color: '#C2410C',
                          border: '1px solid #FED7AA',
                        }}
                        title={
                          `Qualified Responder (independent SOS label)${
                            u.qualified_responder_since ? ` · since ${u.qualified_responder_since}` : ''
                          }${u.qualified_responder_note ? ` · ${u.qualified_responder_note}` : ''}`
                        }
                      >
                        <Icon name="emergency" size={14} /> QUALIFIED RESPONDER
                      </span>
                    )}
                    {u.role === 'ADMIN' && u.admin_archetype && (
                      <span
                        style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          marginLeft: 8, padding: '2px 9px',
                          borderRadius: T.radius.pill,
                          fontSize: 9.5, fontWeight: 800, letterSpacing: 0.4,
                          background: u.admin_archetype === 'super' ? '#EDE9FE' : T.sage50,
                          color: u.admin_archetype === 'super' ? '#6D28D9' : T.textMuted,
                          border: `1px solid ${u.admin_archetype === 'super' ? '#DDD6FE' : T.borderSoft}`,
                        }}
                        title={
                          u.admin_archetype === 'super'
                            ? 'Super Admin — unrestricted access'
                            : `Limited Admin — ${(u.admin_permissions || []).join(', ')}`
                        }
                      >
                        {u.admin_archetype === 'super' ? 'SUPER' : `LIMITED · ${u.admin_permissions?.length ?? 0}`}
                      </span>
                    )}
                  </td>
                  <td>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '4px 12px', borderRadius: T.radius.pill,
                      fontSize: 11, fontWeight: 700,
                      background: u.status === 'Active' ? T.successSoft : '#F5EFE9',
                      color: u.status === 'Active' ? T.success : T.warning,
                    }}>
                      <span style={{ fontSize: 7 }}>●</span>
                      {u.status}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                    {viewingAsLimited && u.role === 'ADMIN' && Number(u.id) !== Number(myPerms.userId) ? (
                      <button
                        type="button"
                        onClick={() => handleOpenEditModal(u)}
                        title="Administrator accounts are read-only for limited admins — only a Super Admin can modify them"
                        style={{
                          padding: '6px 14px', borderRadius: T.radius.pill,
                          background: 'transparent', color: T.textSub,
                          border: `1px solid ${T.border}`,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
                          fontFamily: T.font,
                          display: 'inline-flex', alignItems: 'center', gap: 5,
                        }}
                      >
                        <Icon name="lock" size={14} /> View
                      </button>
                    ) : (
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
                    )}
                    {Number(u.id) !== Number(myPerms.userId)
                      && (u.role !== 'ADMIN' || myPerms.is_super) && (
                      <button
                        type="button"
                        onClick={() => handleArchiveUser(u)}
                        disabled={archivingUserId === Number(u.id)}
                        title="Archive account; clinical and audit history will be retained"
                        style={{
                          padding: '6px 12px',
                          borderRadius: T.radius.pill,
                          background: T.dangerSoft,
                          color: T.danger,
                          borderWidth: 1,
                          borderStyle: 'solid',
                          borderColor: T.dangerBorder,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: archivingUserId === Number(u.id) ? 'wait' : 'pointer',
                          opacity: archivingUserId === Number(u.id) ? 0.65 : 1,
                          fontFamily: T.font,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                        }}
                      >
                        <Icon name="archive" size={14} />
                        {archivingUserId === Number(u.id) ? 'Archiving...' : 'Archive'}
                      </button>
                    )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {userActionFeedback && (
          <div
            role={userActionFeedback.isError ? 'alert' : 'status'}
            style={{
              margin: '12px 16px',
              padding: '10px 14px',
              borderRadius: T.radius.md,
              background: userActionFeedback.isError ? T.dangerSoft : T.successSoft,
              color: userActionFeedback.isError ? T.danger : T.success,
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            {userActionFeedback.text}
          </div>
        )}

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
        ADMIN accounts carry an archetype — <b>Super</b> (full access) or <b>Limited</b> (only
        the capabilities granted at creation).
        {viewingAsLimited && (
          <> You are signed in as a <b>Limited Admin</b>: administrator accounts are
          read-only, admin passwords cannot be overridden, and new administrator
          accounts cannot be created — those actions require a Super Admin.</>
        )}
      </p>
    </div>
  );
}
