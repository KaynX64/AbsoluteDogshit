import { T } from '../../theme';
import Icon from '../../shared/ui/Icon';
import type { InventoryRead } from './InventoryManager';

interface AlertLot {
  batch_id: number; name: string; generic_name: string; strength: string;
  batch_no: string; quantity_on_hand: number; expiry_date: string; unit?: string;
  reorder_level: number;
}

interface ReorderSuggestion {
  medicine_id: number; name: string; unit: string; total_stock_on_hand: number;
  reorder_level: number; suggested_reorder_qty: number; stock_status: string;
}

interface InventoryAlertsProps {
  readStatus: Partial<Record<InventoryRead, "ready" | "error">>;
  lowStockLots: AlertLot[];
  emptyText: (resource: InventoryRead, ready: string) => string;
  expiringLots: (Pick<AlertLot, 'batch_id' | 'name' | 'generic_name' | 'quantity_on_hand' | 'expiry_date'> & { alert_level: string })[];
  reorderSuggestions: ReorderSuggestion[];
}

export default function InventoryAlerts({
  readStatus,
  lowStockLots,
  emptyText,
  expiringLots,
  reorderSuggestions,
}: InventoryAlertsProps) {
  return (
    <div className="inventory-alerts-view inventory-alerts-page" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Top row: 2 columns for Low stock lots & Expiry alerts */}
      <div className="inventory-split inventory-alerts">
        <div className="inventory-alert-panel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h4 style={{
              margin: 0, fontSize: 14, fontWeight: 800, color: T.warning,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <Icon name="warning" size={14} /> Low stock lots
            </h4>
            {readStatus.batches === 'ready' && (
              <span style={{ fontSize: 11.5, color: T.textSub, fontWeight: 600 }}>
                {lowStockLots.length} lot{lowStockLots.length === 1 ? '' : 's'} at or below reorder buffer
              </span>
            )}
          </div>

          <div className="inventory-table inventory-alert-table inventory-alert-table-low-stock" tabIndex={0} role="region" aria-label="Low stock lots">
            {lowStockLots.length === 0 ? (
              <div style={{
                padding: 28, textAlign: 'center',
                color: T.textSub, fontSize: 12.5, fontWeight: 700,
              }}>
                {emptyText('batches', 'No active lots at or below their reorder buffer.')}
              </div>
            ) : (
              <table className="tbl inventory-low-stock-table" style={{ fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th style={{ width: '28%' }}>Medicine</th>
                    <th style={{ width: '14%' }}>Lot / batch</th>
                    <th style={{ width: '22%', textAlign: 'right' }}>Stock / buffer</th>
                    <th style={{ width: '16%' }}>Expiry</th>
                    <th style={{ width: '20%' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockLots.map((lot) => {
                    const isCritical = lot.quantity_on_hand <= Math.max(5, Math.floor((lot.reorder_level || 20) / 2));
                    return (
                      <tr key={lot.batch_id}>
                        <td>
                          <div style={{ fontWeight: 700 }}>{lot.name}</div>
                          <div style={{ fontSize: 10.5, color: T.textMuted }}>{lot.generic_name} · {lot.strength}</div>
                        </td>
                        <td style={{ fontFamily: T.mono, fontSize: 11.5, color: T.textSub }}>
                          {lot.batch_no}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ fontWeight: 800, color: isCritical ? T.danger : T.warning }}>
                            {lot.quantity_on_hand} {lot.unit || 'pcs'}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 10.5, color: T.textSub }}>
                            Buffer: {lot.reorder_level || 20} {lot.unit || 'pcs'}
                          </div>
                        </td>
                        <td style={{ fontSize: 11, color: T.textSub }}>
                          {new Date(lot.expiry_date).toISOString().split('T')[0]}
                        </td>
                        <td>
                          <span style={{
                            padding: '2px 5px', borderRadius: T.radius.pill,
                            background: isCritical ? T.dangerSoft : T.warningSoft,
                            color: isCritical ? T.danger : T.warning,
                            fontSize: 9, fontWeight: 800, letterSpacing: 0.2, whiteSpace: 'nowrap',
                          }}>
                            {isCritical ? 'CRITICAL BUFFER' : 'LOW STOCK'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="inventory-alert-panel">
          <h4 style={{
            margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.danger,
            display: 'flex', alignItems: 'center', gap: 8,
          }}>
            <Icon name="schedule" size={14} /> Expiry alerts
          </h4>
          <div className="inventory-table inventory-alert-table" tabIndex={0} role="region" aria-label="Expiry alerts">
            {expiringLots.length === 0 ? (
              <div style={{
                padding: 24, textAlign: 'center',
                color: T.textSub, fontSize: 12.5, fontWeight: 700,
              }}>
                {emptyText('expiring-soon', 'No expired lots or lots expiring within 30 days.')}
              </div>
            ) : (
              <table className="tbl" style={{ fontSize: 12 }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                  <tr>
                    <th>Medicine</th>
                    <th style={{ textAlign: 'right' }}>Stock on hand</th>
                    <th>Expiry date</th>
                    <th>Alert</th>
                  </tr>
                </thead>
                <tbody>
                  {expiringLots.map((e) => (
                    <tr key={e.batch_id}>
                      <td>
                        <div style={{ fontWeight: 700 }}>{e.name}</div>
                        <div style={{ fontSize: 10.5, color: T.textMuted }}>{e.generic_name}</div>
                      </td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: T.danger }}>
                        {e.quantity_on_hand}
                      </td>
                      <td style={{ fontSize: 11, color: T.textSub }}>{e.expiry_date}</td>
                      <td>
                        <span style={{
                          padding: '2px 8px', borderRadius: T.radius.pill,
                          background: e.alert_level === 'EXPIRED' ? T.dangerSoft : T.warningSoft,
                          color: e.alert_level === 'EXPIRED' ? T.danger : T.warning,
                          fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                        }}>
                          {e.alert_level}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="inventory-reorder-panel">
        <h4 style={{
          margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.warning,
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <Icon name="trending_down" size={14} /> Automated reorder suggestions
        </h4>
        <div className="inventory-table inventory-alert-table inventory-reorder-table" tabIndex={0} role="region" aria-label="Reorder suggestions">
          <table className="tbl" style={{ fontSize: 12 }}>
            <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
              <tr>
                <th>Medicine</th>
                <th style={{ textAlign: 'right' }}>Current stock</th>
                <th style={{ textAlign: 'right' }}>Buffer</th>
                <th style={{ textAlign: 'right' }}>Suggested order</th>
              </tr>
            </thead>
            <tbody>
              {reorderSuggestions.length === 0 && (
                <tr><td colSpan={4}>{emptyText('reorder-suggestions', 'No reorder suggestions available.')}</td></tr>
              )}
              {reorderSuggestions.map((s) => (
                <tr key={s.medicine_id}>
                  <td style={{ fontWeight: 700 }}>{s.name}</td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: s.total_stock_on_hand <= s.reorder_level ? T.danger : T.success,
                  }}>
                    {s.total_stock_on_hand} {s.unit}
                  </td>
                  <td style={{ textAlign: 'right', color: T.textSub }}>
                    {s.reorder_level} {s.unit}
                  </td>
                  <td style={{
                    textAlign: 'right', fontWeight: 700,
                    color: s.suggested_reorder_qty > 0 ? T.warning : T.textMuted,
                  }}>
                    {s.suggested_reorder_qty > 0 ? `+${s.suggested_reorder_qty} ${s.unit}` : s.stock_status === 'OUT_OF_STOCK' ? 'Set a buffer' : 'Adequate'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>


  );
}
