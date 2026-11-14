import { T, btnGhost } from '../../theme';
import Icon from '../../shared/ui/Icon';
import { I } from './adminIcons';

interface DatabaseStudioProps {
  dbTablesList: { tableName: string }[];
  isTableReadOnly: boolean;
  tableReadOnlyReason: 'audit' | 'security' | null;
  selectedDbTable: string | null;
  setSelectedDbTable: (table: string) => void;
  setDbSearchFilter: React.Dispatch<React.SetStateAction<string>>;
  prevDbSearchRef: React.RefObject<string>;
  fetchTableData: (table?: string, page?: number, search?: string) => Promise<void>;
  tableTotalRows: number;
  dbSearchFilter: string;
  tablePage: number;
  tableSchema: { columnName: string; columnKey: string; dataType: string }[];
  setDbRowModal: (value: { isNew: boolean; rowData: Record<string, unknown> }) => void;
  loadingDbTable: boolean;
  tableRows: Record<string, unknown>[];
  handleDeleteDbRow: (row: Record<string, unknown>) => Promise<void>;
  tableTotalPages: number;
}

export default function DatabaseStudio({
  dbTablesList,
  isTableReadOnly,
  tableReadOnlyReason,
  selectedDbTable,
  setSelectedDbTable,
  setDbSearchFilter,
  prevDbSearchRef,
  fetchTableData,
  tableTotalRows,
  dbSearchFilter,
  tablePage,
  tableSchema,
  setDbRowModal,
  loadingDbTable,
  tableRows,
  handleDeleteDbRow,
  tableTotalPages,
}: DatabaseStudioProps) {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '14px 20px', background: T.sage100,
        borderRadius: T.radius.lg, marginBottom: 20, flexWrap: 'wrap', gap: 12,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{
            fontFamily: T.mono, fontSize: 12, fontWeight: 700,
            background: T.primary, color: T.textOnPrimary,
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
            <I.Lock /> {tableReadOnlyReason === 'security' ? 'Super-admin-only security table' : 'Read-only audit table'}
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
                    setDbSearchFilter('');
                    prevDbSearchRef.current = '';
                    fetchTableData(t.tableName, 1, '');
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
                    {isAudit ? '' : ''} {t.tableName}
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
                {tableTotalRows} {dbSearchFilter ? 'matching ' : ''}records
              </span>
            </div>

            <div className="my-toolbar">
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <input
                  type="text"
                  placeholder="Search records across table…"
                  value={dbSearchFilter}
                  onChange={(e) => setDbSearchFilter(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      fetchTableData(selectedDbTable, 1, dbSearchFilter);
                    }
                  }}
                  className="my-toolbar-search"
                  style={{ paddingRight: dbSearchFilter ? 28 : undefined }}
                />
                {dbSearchFilter && (
                  <button
                    type="button"
                    onClick={() => {
                      setDbSearchFilter('');
                      prevDbSearchRef.current = '';
                      fetchTableData(selectedDbTable, 1, '');
                    }}
                    style={{
                      position: 'absolute',
                      right: 8,
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      color: T.textSub,
                      fontSize: 13,
                      lineHeight: 1,
                      padding: '4px 6px',
                    }}
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => fetchTableData(selectedDbTable, tablePage, dbSearchFilter)}
                className="my-toolbar-icon-btn"
                title="Refresh"
              >
                <I.Refresh />
              </button>
              {!isTableReadOnly && (
                <button
                  type="button"
                  onClick={() => {
                    const emptyRow: Record<string, unknown> = {};
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
            <div style={{ padding: 40, textAlign: 'center', color: T.textMuted }}>
              {dbSearchFilter.trim() ? `No records found matching "${dbSearchFilter}".` : 'Table is empty.'}
            </div>
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
                        {col.columnKey === 'PRI' && <span style={{ color: T.warning, marginRight: 4 }}><Icon name="key" size={14} /></span>}
                        {col.columnName}
                        <div style={{ fontSize: 9.5, color: T.textMuted, fontWeight: 500, textTransform: 'none', letterSpacing: 0, marginTop: 2 }}>
                          {col.dataType}
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableRows.map((row, idx) => (
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
                          const isEncrypted = typeof val === 'string' && /^enc:v[12]:/.test(val);
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
                                  <Icon name="lock" size={14} /> AES-256
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
              Page <b style={{ color: T.text }}>{tablePage}</b> of <b style={{ color: T.text }}>{Math.max(1, tableTotalPages)}</b>
              {' · '}Showing {tableRows.length} of {tableTotalRows} records{dbSearchFilter.trim() ? ' (matching search)' : ''}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                disabled={tablePage <= 1}
                onClick={() => fetchTableData(selectedDbTable, tablePage - 1, dbSearchFilter)}
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
                onClick={() => fetchTableData(selectedDbTable, tablePage + 1, dbSearchFilter)}
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
  );
}
