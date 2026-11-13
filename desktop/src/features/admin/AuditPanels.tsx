import { T, inputStyle } from '../../theme';
import Icon from '../../shared/ui/Icon';
import { I } from './adminIcons';

interface PhiAccessRow {
  id: number; viewer_name: string; viewer_role: string; viewer_email: string;
  patient_name: string; student_no?: string | null; table_affected: string;
  purpose: string; ip_address: string; accessed_at: string;
}

interface MutationRow {
  id: number; user: string; action: string; target: string;
  hash?: string | null; created_at: string;
}

interface AuditPanelsProps {
  auditSubTab: "mutations" | "phi";
  setAuditSubTab: React.Dispatch<React.SetStateAction<"mutations" | "phi">>;
  phiSearchTerm: string;
  setPhiSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  phiTableFilter: string;
  setPhiTableFilter: React.Dispatch<React.SetStateAction<string>>;
  phiSortOrder: "desc" | "asc" | "patient_asc";
  setPhiSortOrder: React.Dispatch<React.SetStateAction<"desc" | "asc" | "patient_asc">>;
  processedPhiLogs: PhiAccessRow[];
  phiLogs: PhiAccessRow[];
  phiRoleFilter: string;
  setPhiRoleFilter: React.Dispatch<React.SetStateAction<string>>;
  loadingLogs: boolean;
  mutationSearchTerm: string;
  setMutationSearchTerm: React.Dispatch<React.SetStateAction<string>>;
  mutationSortOrder: "desc" | "asc";
  setMutationSortOrder: React.Dispatch<React.SetStateAction<"desc" | "asc">>;
  processedMutationLogs: MutationRow[];
  mutationLogs: MutationRow[];
  mutationActionFilter: string;
  setMutationActionFilter: React.Dispatch<React.SetStateAction<string>>;
}

export default function AuditPanels({
  auditSubTab,
  setAuditSubTab,
  phiSearchTerm,
  setPhiSearchTerm,
  phiTableFilter,
  setPhiTableFilter,
  phiSortOrder,
  setPhiSortOrder,
  processedPhiLogs,
  phiLogs,
  phiRoleFilter,
  setPhiRoleFilter,
  loadingLogs,
  mutationSearchTerm,
  setMutationSearchTerm,
  mutationSortOrder,
  setMutationSortOrder,
  processedMutationLogs,
  mutationLogs,
  mutationActionFilter,
  setMutationActionFilter,
}: AuditPanelsProps) {
  return (
    <div>
      {/* Sub-tabs — clean pill toggle */}
      <div className="vd-subtabs" style={{ marginBottom: 20 }}>
        <button
          type="button"
          className={`vd-subtab${auditSubTab === 'phi' ? ' is-active' : ''}`}
          onClick={() => setAuditSubTab('phi')}
        >
          <Icon name="visibility" size={14} /> PHI access
        </button>
        <button
          type="button"
          className={`vd-subtab${auditSubTab === 'mutations' ? ' is-active' : ''}`}
          onClick={() => setAuditSubTab('mutations')}
        >
          <Icon name="check" size={14} /> SHA-256 mutation ledger
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

            <select aria-label="Sort PHI access logs" value={phiSortOrder} onChange={(e) => setPhiSortOrder(e.target.value as typeof phiSortOrder)}
                    style={{ ...inputStyle, width: 'auto', padding: '8px 16px', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700 }}>
              <option value="desc">Access date: Newest first</option>
              <option value="asc">Access date: Oldest first</option>
              <option value="patient_asc">Patient name: A to Z</option>
            </select>

            <span style={{ alignSelf: 'center', fontSize: 12, color: T.textSub, fontWeight: 700 }}>
              {processedPhiLogs.length} of {phiLogs.length} entries
            </span>
          </div>

          <div className="admin-phi-role-filters">
            <span className="admin-filter-section-label">Role</span>
            <div className="admin-filter-control" role="group" aria-label="Filter PHI access logs by role">
              {[
                { role: 'ALL', label: 'All roles', icon: 'groups' },
                { role: 'DOCTOR', label: 'Doctor', icon: 'stethoscope' },
                { role: 'NURSE', label: 'Nurse', icon: 'medical_information' },
                { role: 'DENTIST', label: 'Dentist', icon: 'dentistry' },
                { role: 'ADMIN', label: 'Admin', icon: 'admin_panel_settings' },
              ].map(({ role, label, icon }) => {
                const isSelected = phiRoleFilter === role;
                return (
                  <button
                    key={role}
                    type="button"
                    className={`admin-filter-button${isSelected ? ' is-selected' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setPhiRoleFilter(role)}
                  >
                    <Icon name={icon} size={14} />
                    {label}
                  </button>
                );
              })}
            </div>
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
              <div className="vd-table-wrap" style={{ overflowX: "auto" }}>
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

            <select aria-label="Sort mutation logs" value={mutationSortOrder} onChange={(e) => setMutationSortOrder(e.target.value as typeof mutationSortOrder)}
                    style={{ ...inputStyle, width: 'auto', padding: '8px 16px', borderRadius: T.radius.pill, fontSize: 12, fontWeight: 700 }}>
              <option value="desc">Created: Newest first</option>
              <option value="asc">Created: Oldest first</option>
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
              <div className="vd-table-wrap" style={{ overflowX: "auto" }}>
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
  );
}
