import { T, inputStyle, rolePill } from '../../theme';
import Icon from '../../shared/ui/Icon';

import type { AccountListRow } from './ActiveAccounts';

interface ArchivedAccountsProps {
  archivedUsersError: string;
  loadingArchivedUsers: boolean;
  archivedUsers: AccountListRow[];
  archivedSearchTerm: string;
  setArchivedSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  filteredArchivedUsers: AccountListRow[];
}

export default function ArchivedAccounts({
  archivedUsersError,
  loadingArchivedUsers,
  archivedUsers,
  archivedSearchTerm,
  setArchivedSearchTerm,
  filteredArchivedUsers,
}: ArchivedAccountsProps) {
  return (
    <div style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg,
      overflow: 'hidden',
      boxShadow: T.shadow.xs,
    }}>
      {archivedUsersError && (
        <div role="alert" style={{
          margin: 16,
          padding: '10px 14px',
          borderRadius: T.radius.md,
          background: T.dangerSoft,
          color: T.danger,
          fontSize: 13,
          fontWeight: 600,
        }}>
          {archivedUsersError}
        </div>
      )}
      {loadingArchivedUsers ? (
        <div role="status" style={{ padding: 32, textAlign: 'center', color: T.textMuted }}>
          Loading archived accounts...
        </div>
      ) : archivedUsers.length === 0 && archivedUsersError ? null : archivedUsers.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
          No archived accounts.
        </div>
      ) : (
        <>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            padding: '14px 16px',
            borderBottom: `1px solid ${T.border}`,
          }}>
            <div style={{ position: 'relative', flex: '1 1 320px', maxWidth: 520 }}>
              <span style={{
                position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)',
                color: T.textMuted, display: 'grid', placeItems: 'center',
              }}>
                <Icon name="search" size={16} />
              </span>
              <input
                type="text"
                aria-label="Search archived accounts"
                placeholder="Search by name, email, role or ID"
                value={archivedSearchTerm}
                onChange={(e) => setArchivedSearchTerm(e.target.value)}
                style={{
                  ...inputStyle,
                  paddingLeft: 40,
                  borderRadius: T.radius.pill,
                  background: T.surface,
                }}
              />
            </div>
            <span style={{ fontSize: 12.5, color: T.textSub }}>
              {filteredArchivedUsers.length} of {archivedUsers.length} accounts
            </span>
          </div>
          {filteredArchivedUsers.length === 0 ? (
            <div style={{ padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13 }}>
              No archived accounts match your search.
            </div>
          ) : (
            <div className="vd-table-wrap" style={{ overflowX: 'auto' }}>
              <table className="tbl" style={{ minWidth: 760 }}>
                <thead>
                  <tr>
                    <th style={{ width: 90 }}>User ID</th>
                    <th>Full name</th>
                    <th>Institutional email</th>
                    <th>Assigned RBAC role</th>
                    <th style={{ width: 190 }}>Archived</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArchivedUsers.map((archivedUser) => (
                    <tr key={archivedUser.id}>
                      <td style={{ color: T.textSub, fontWeight: 600, fontFamily: T.mono, fontSize: 12 }}>
                        {archivedUser.id}
                      </td>
                      <td style={{ fontWeight: 600, color: T.text }}>{archivedUser.name}</td>
                      <td style={{ color: T.textSub }}>{archivedUser.email}</td>
                      <td><span style={rolePill(archivedUser.role)}>{archivedUser.role}</span></td>
                      <td style={{ color: T.textSub }}>
                        {archivedUser.archived_at
                          ? new Date(archivedUser.archived_at).toLocaleString()
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
