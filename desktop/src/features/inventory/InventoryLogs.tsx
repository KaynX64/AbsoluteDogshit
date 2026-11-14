import { T, inputStyle, btnGhost } from '../../theme';
import Icon from '../../shared/ui/Icon';
import type { InventoryRead } from './InventoryManager';

interface InventoryLog {
  log_id: number; created_at: string; transaction_type: string; medicine_name: string;
  generic_name: string; strength: string; batch_no: string; quantity_change: number;
  performed_by_name: string; performed_by_email: string; reason: string;
  prescription_id?: number | null; prescription_item_id?: number | null;
}

interface InventoryLogsProps {
  filteredLogs: InventoryLog[];
  inventoryLogs: InventoryLog[];
  fetchLogs: () => Promise<boolean>;
  loadingLogs: boolean;
  logTypeFilter: "all" | "dispense" | "receive" | "dispose";
  setLogTypeFilter: React.Dispatch<React.SetStateAction<"all" | "dispense" | "receive" | "dispose">>;
  logSearchQuery: string;
  setLogSearchQuery: React.Dispatch<React.SetStateAction<string>>;
  emptyText: (resource: InventoryRead, ready: string) => string;
}

export default function InventoryLogs({
  filteredLogs,
  inventoryLogs,
  fetchLogs,
  loadingLogs,
  logTypeFilter,
  setLogTypeFilter,
  logSearchQuery,
  setLogSearchQuery,
  emptyText,
}: InventoryLogsProps) {
  return (
    <div>
      <div style={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12,
      }}>
        <div>
          <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.primary }}>
            <Icon name="article" size={14} /> Central inventory consumption log
          </h4>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
            Showing <b>{filteredLogs.length}</b> of <b>{inventoryLogs.length}</b> recorded transactions
          </p>
        </div>
        <button type="button" onClick={fetchLogs} style={btnGhost} disabled={loadingLogs}>
          <Icon name="refresh" size={14} /> Refresh
        </button>
      </div>

      <div className="inventory-log-toolbar">
        <div className="inventory-log-filter-group" role="group" aria-label="Filter consumption logs by action">
          {([
            { id: 'all', label: 'All actions', count: inventoryLogs.length, icon: 'history', tone: 'primary' },
            { id: 'dispense', label: 'Dispensed', count: inventoryLogs.filter((l) => l.transaction_type === 'dispense').length, icon: 'medication', tone: 'info' },
            { id: 'receive', label: 'Received', count: inventoryLogs.filter((l) => l.transaction_type === 'receive').length, icon: 'download', tone: 'success' },
            { id: 'dispose', label: 'Disposals', count: inventoryLogs.filter((l) => ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)).length, icon: 'delete', tone: 'danger' },
          ] as const).map((chip) => {
            const isActive = logTypeFilter === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                className="inventory-log-filter"
                aria-pressed={isActive}
                onClick={() => setLogTypeFilter(chip.id)}
              >
                <Icon name={chip.icon} size={15} tone={isActive ? 'inherit' : chip.tone} />
                <span>{chip.label}</span>
                <span className="inventory-log-filter-count">{chip.count}</span>
              </button>
            );
          })}
        </div>

        <input
          type="text"
          aria-label="Search logs by medicine, lot, staff, or reason"
          placeholder="Search drug, lot, staff…"
          value={logSearchQuery}
          onChange={(e) => setLogSearchQuery(e.target.value)}
          style={{ ...inputStyle, width: 240, padding: '8px 14px', fontSize: 12, borderRadius: T.radius.pill }}
        />
      </div>

      {loadingLogs ? (
        <div style={{ padding: 40, textAlign: 'center', color: T.textSub, fontSize: 13 }}>
          Loading activity logs…
        </div>
      ) : filteredLogs.length === 0 ? (
        <div style={{
          padding: 40, textAlign: 'center', color: T.textMuted, fontSize: 13,
          background: T.sage50, borderRadius: T.radius.md,
          border: `1px dashed ${T.border}`,
        }}>
          {emptyText('logs', 'No transaction records found matching the selected filter.')}
        </div>
      ) : (
        <div className="inventory-table" style={{ maxHeight: 480 }} tabIndex={0} role="region" aria-label="Consumption logs">
          <table className="tbl" style={{ fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th style={{ width: 70 }}>Log ID</th>
                <th>Date & time</th>
                <th>Action</th>
                <th>Medicine & lot</th>
                <th style={{ textAlign: 'right' }}>Delta</th>
                <th>Performed by</th>
                <th>Reason</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.map((l) => {
                const isInbound = l.transaction_type === 'receive' || l.transaction_type === 'return';
                const isDispense = l.transaction_type === 'dispense';
                return (
                  <tr key={l.log_id}>
                    <td style={{ fontFamily: T.mono, fontSize: 11.5, color: T.textSub, fontWeight: 700 }}>
                      #{l.log_id}
                    </td>
                    <td style={{ fontSize: 11.5, color: T.textSub }}>
                      {new Date(l.created_at).toLocaleString()}
                    </td>
                    <td>
                      <span style={{
                        padding: '3px 10px', borderRadius: T.radius.xs,
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3, whiteSpace: 'nowrap', overflowWrap: 'normal',
                        background: isInbound ? T.successSoft : isDispense ? T.infoSoft : T.dangerSoft,
                        color: isInbound ? T.success : isDispense ? T.info : T.danger,
                      }}>
                        {l.transaction_type.toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: T.text }}>{l.medicine_name}</div>
                      <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 2 }}>
                        {l.generic_name} · {l.strength} · {l.batch_no}
                      </div>
                    </td>
                    <td style={{
                      textAlign: 'right', fontWeight: 800,
                      color: l.quantity_change > 0 ? T.success : T.danger,
                    }}>
                      {l.quantity_change > 0 ? `+${l.quantity_change}` : l.quantity_change}
                    </td>
                    <td>
                      <div style={{ fontWeight: 700, color: T.text }}>{l.performed_by_name}</div>
                      <div style={{ fontSize: 10.5, color: T.textMuted }}>{l.performed_by_email}</div>
                    </td>
                    <td style={{ color: T.textSub }}>
                      <div>{l.reason}</div>
                      {l.prescription_id && l.prescription_item_id && (
                        <div style={{ marginTop: 3, fontSize: 10.5, color: T.info, fontWeight: 700 }}>
                          Prescription #{l.prescription_id} · Item #{l.prescription_item_id}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>


  );
}
