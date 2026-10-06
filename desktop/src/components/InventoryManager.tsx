// desktop/src/components/InventoryManager.tsx
import React, { useState, useEffect, useRef } from 'react';
import { T, btnPrimary, btnGhost, inputStyle } from '../theme';
import { API_BASE_URL } from '../config/api';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit?: string;
  reorder_level?: number;
}

type InvTab = 'catalog' | 'stockin' | 'adjust' | 'alerts' | 'logs' | 'addmed';

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState<InvTab>('catalog');

  /* ── Catalog & Deduction ─────────────────────────────────── */
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Prescription issuance');
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);

  const [barcodeQuery, setBarcodeQuery] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'dispense' | 'receive' | 'dispose'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  /* ── Stock-in ────────────────────────────────────────────── */
  const [stockInMedId, setStockInMedId] = useState<number | ''>('');
  const [stockInBatchNo, setStockInBatchNo] = useState('');
  const [stockInMfgDate, setStockInMfgDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [stockInExpDate, setStockInExpDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().split('T')[0];
  });
  const [stockInSupplier, setStockInSupplier] = useState('Unilab Philippines');
  const [stockInQty, setStockInQty] = useState('100');

  /* ── Adjust / dispose ────────────────────────────────────── */
  const [adjustBatchId, setAdjustBatchId] = useState<number | ''>('');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustType, setAdjustType] = useState<'dispose' | 'adjust' | 'recall' | 'return'>('dispose');
  const [adjustReason, setAdjustReason] = useState('Expired batch quarantine');

  /* ── Alerts / reorder ────────────────────────────────────── */
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([]);
  const [expiringLots, setExpiringLots] = useState<any[]>([]);

  /* ── Logs ────────────────────────────────────────────────── */
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  /* ── New medicine ────────────────────────────────────────── */
  const [newMedName, setNewMedName] = useState('');
  const [newMedGeneric, setNewMedGeneric] = useState('');
  const [newMedForm, setNewMedForm] = useState('Tablet');
  const [newMedStrength, setNewMedStrength] = useState('500mg');
  const [newMedUnit, setNewMedUnit] = useState('pcs');
  const [newMedReorder, setNewMedReorder] = useState('30');

  /* ── Fetchers (identical) ────────────────────────────────── */
  const fetchBatches = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/batches`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBatches(await res.json());
    } catch (err) { console.error('Failed to fetch batches:', err); }
  };

  const fetchMedicines = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/medicines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: MedicineMaster[] = await res.json();
        setMedicines(data);
        if (data.length > 0 && stockInMedId === '') setStockInMedId(data[0].medicine_id);
      }
    } catch (_) {}
  };

  const fetchReorderAndAlerts = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const [resSug, resExp] = await Promise.all([
        fetch(`${API_BASE_URL}/api/inventory/reorder-suggestions`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API_BASE_URL}/api/inventory/expiring-soon`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resSug.ok) setReorderSuggestions(await resSug.json());
      if (resExp.ok) setExpiringLots(await resExp.json());
    } catch (_) {}
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/logs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setInventoryLogs(await res.json());
    } catch (_) {}
    setLoadingLogs(false);
  };

  useEffect(() => {
    fetchBatches();
    fetchMedicines();
    fetchReorderAndAlerts();
  }, []);

  const filteredLogs = inventoryLogs.filter((l) => {
    const matchesType = logTypeFilter === 'all'
      ? true
      : logTypeFilter === 'dispose'
      ? ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)
      : l.transaction_type === logTypeFilter;
    const query = logSearchQuery.trim().toLowerCase();
    const matchesSearch = !query
      || (l.medicine_name && l.medicine_name.toLowerCase().includes(query))
      || (l.batch_no && l.batch_no.toLowerCase().includes(query))
      || (l.performed_by_name && l.performed_by_name.toLowerCase().includes(query))
      || (l.reason && l.reason.toLowerCase().includes(query));
    return matchesType && matchesSearch;
  });

  /* ── Handlers (identical) ────────────────────────────────── */
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;
    const match = batches.find((b) =>
      b.batch_no.toLowerCase() === barcodeQuery.trim().toLowerCase() || b.batch_id.toString() === barcodeQuery.trim()
    );
    if (match) {
      setBatchId(match.batch_id.toString());
      setAdjustBatchId(match.batch_id);
      setStatusMessage(`🎯 Barcode scanned: selected ${match.name} (Batch ${match.batch_no})`);
      setBarcodeQuery('');
    } else {
      setStatusMessage(`⚠️ Barcode "${barcodeQuery}" not found in active inventory.`);
    }
  };

  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/deduct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          batch_id: Number(batchId),
          quantity_deducted: Number(quantity),
          reason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✅ ' + data.message);
        fetchBatches();
        fetchReorderAndAlerts();
        setBatchId('');
        setQuantity('1');
      } else {
        setStatusMessage('❌ ' + (data.error || 'Failed to deduct stock'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network error: ' + err.message);
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Logging shipment receipt...');
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/receive`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          medicine_id: Number(stockInMedId),
          batch_no: stockInBatchNo.trim(),
          manufacture_date: stockInMfgDate,
          expiry_date: stockInExpDate,
          supplier: stockInSupplier.trim(),
          quantity_received: Number(stockInQty),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✅ ' + data.message);
        setStockInBatchNo('');
        setStockInQty('100');
        fetchBatches();
        fetchReorderAndAlerts();
      } else {
        setStatusMessage('❌ ' + (data.error || 'Failed to record shipment intake'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network error: ' + err.message);
    }
  };

  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBatchId) { alert('Please select a batch to adjust.'); return; }
    setStatusMessage('Processing inventory adjustment...');
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          batch_id: Number(adjustBatchId),
          quantity_removed: Number(adjustQty),
          transaction_type: adjustType,
          reason: adjustReason,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✅ ' + data.message);
        fetchBatches();
        fetchReorderAndAlerts();
        setAdjustBatchId('');
        setAdjustQty('1');
      } else {
        setStatusMessage('❌ ' + (data.error || 'Failed to adjust inventory'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network error: ' + err.message);
    }
  };

  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Registering new formulary medicine...');
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/medicines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          name: newMedName.trim(),
          generic_name: newMedGeneric.trim(),
          form: newMedForm,
          strength: newMedStrength.trim(),
          unit: newMedUnit,
          reorder_level: Number(newMedReorder),
        }),
      });
      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✅ ' + data.message);
        setNewMedName('');
        setNewMedGeneric('');
        fetchMedicines();
      } else {
        setStatusMessage('❌ ' + (data.error || 'Failed to add medicine'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network error: ' + err.message);
    }
  };

  const getExpiryStatus = (expiryDate: string) => {
    const daysUntil = (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    if (daysUntil < 0) return { label: 'Expired', bg: T.dangerSoft, color: T.danger };
    if (daysUntil <= 90) return { label: 'Expiring soon', bg: T.warningSoft, color: T.warning };
    return { label: 'Good', bg: T.successSoft, color: T.success };
  };

  /* ── RENDER ──────────────────────────────────────────────── */
  const tabs: { id: InvTab; label: string }[] = [
    { id: 'catalog', label: 'Catalog & dispense' },
    { id: 'stockin', label: 'Stock-in' },
    { id: 'adjust',  label: 'Adjust & dispose' },
    { id: 'alerts',  label: 'Alerts & reorder' },
    { id: 'logs',    label: 'Consumption logs' },
    { id: 'addmed',  label: 'New formulary' },
  ];

  const fieldLabel: React.CSSProperties = {
    display: 'block', fontSize: 11.5, fontWeight: 700,
    color: T.textSub, marginBottom: 6,
  };

  return (
    <section style={{
      background: T.surface,
      border: `1px solid ${T.border}`,
      borderRadius: T.radius.lg,
      padding: 22,
      boxShadow: T.shadow.xs,
    }}>
      {/* Header */}
      <div style={{ marginBottom: 18 }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: T.primary }}>
          💊 Medicine & first-aid inventory
        </h3>
        <p style={{ margin: '4px 0 0', fontSize: 12.5, color: T.textSub }}>
          FEFO lot traceability, expiration safeguards & stock monitoring
        </p>
      </div>

      {/* Pill tab bar */}
      <div style={{
        display: 'flex', gap: 6, flexWrap: 'wrap',
        padding: 4, background: T.sage100,
        borderRadius: T.radius.pill, marginBottom: 20,
        width: 'fit-content', maxWidth: '100%',
      }}>
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                setStatusMessage('');
                if (tab.id === 'logs') fetchLogs();
                if (tab.id === 'alerts') fetchReorderAndAlerts();
              }}
              style={{
                padding: '8px 16px', borderRadius: T.radius.pill, border: 'none',
                background: isActive ? T.surface : 'transparent',
                color: isActive ? T.primary : T.textSub,
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                fontFamily: T.font,
                boxShadow: isActive ? T.shadow.xs : 'none',
              }}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {statusMessage && (
        <div style={{
          padding: '12px 16px', marginBottom: 16,
          borderRadius: T.radius.md, fontSize: 13, fontWeight: 600,
          background: statusMessage.includes('✅') ? T.successSoft : T.dangerSoft,
          color: statusMessage.includes('✅') ? T.success : T.danger,
          border: `1px solid ${statusMessage.includes('✅') ? T.successBorder : T.dangerBorder}`,
        }}>
          {statusMessage}
        </div>
      )}

      {/* ── CATALOG & DISPENSE ──────────────────────────── */}
      {activeTab === 'catalog' && (
        <div>
          {/* Barcode scanner */}
          <form onSubmit={handleBarcodeSubmit} style={{
            display: 'flex', gap: 10, marginBottom: 20, alignItems: 'center',
            background: T.sage50, padding: 12,
            borderRadius: T.radius.md, border: `1px solid ${T.borderSoft}`,
          }}>
            <span style={{ fontSize: 18 }}>📟</span>
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan barcode / batch no. with USB scanner, or type and press Enter"
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              style={{ ...inputStyle, flex: 1 }}
            />
            <button type="submit" style={{ ...btnPrimary, padding: '10px 18px', fontSize: 12.5 }}>
              Find lot
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 20 }}>
            {/* FEFO batch table */}
            <div>
              <div style={{
                display: 'flex', justifyContent: 'space-between',
                alignItems: 'center', marginBottom: 12,
              }}>
                <span style={{ fontSize: 13, fontWeight: 800, color: T.text }}>
                  First-expiry-first-out batches
                </span>
                <small style={{ color: T.textMuted, fontSize: 11.5 }}>
                  Select a row to deduct
                </small>
              </div>

              <div style={{
                border: `1px solid ${T.border}`,
                borderRadius: T.radius.md,
                overflow: 'hidden',
                maxHeight: 420,
                overflowY: 'auto',
              }}>
                <table className="tbl" style={{ fontSize: 12.5 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th style={{ width: 44 }}></th>
                      <th>Medicine</th>
                      <th>Lot / batch</th>
                      <th style={{ textAlign: 'right' }}>Stock</th>
                      <th>Expires</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b) => {
                      const status = getExpiryStatus(b.expiry_date);
                      const isSelected = batchId === b.batch_id.toString();
                      return (
                        <tr
                          key={b.batch_id}
                          onClick={() => {
                            setBatchId(b.batch_id.toString());
                            setAdjustBatchId(b.batch_id);
                            setStatusMessage(`Selected: ${b.name} (${b.batch_no})`);
                          }}
                          style={{
                            cursor: 'pointer',
                            background: isSelected ? T.primaryTint : 'transparent',
                          }}
                        >
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{
                              width: 16, height: 16, borderRadius: '50%',
                              border: `2px solid ${isSelected ? T.primary : T.sage300}`,
                              background: isSelected ? T.primary : 'transparent',
                              display: 'grid', placeItems: 'center',
                            }}>
                              {isSelected && <span style={{ color: '#fff', fontSize: 9, fontWeight: 900 }}>✓</span>}
                            </div>
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <div style={{ fontWeight: 700, color: T.text }}>{b.name}</div>
                            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 2 }}>
                              {b.generic_name} · {b.strength}
                            </div>
                          </td>
                          <td style={{
                            padding: '12px 14px', fontFamily: T.mono,
                            fontSize: 11.5, color: T.textSub,
                          }}>
                            {b.batch_no}
                          </td>
                          <td style={{
                            padding: '12px 14px', textAlign: 'right', fontWeight: 800,
                            color: b.quantity_on_hand < 20 ? T.danger : T.primary,
                          }}>
                            {b.quantity_on_hand}
                            <span style={{ fontSize: 10.5, color: T.textMuted, fontWeight: 600, marginLeft: 4 }}>
                              {b.unit || 'pcs'}
                            </span>
                          </td>
                          <td style={{ padding: '12px 14px', fontSize: 11.5, color: T.textSub }}>
                            {new Date(b.expiry_date).toISOString().split('T')[0]}
                          </td>
                          <td style={{ padding: '12px 14px' }}>
                            <span style={{
                              padding: '3px 10px', borderRadius: T.radius.pill,
                              background: status.bg, color: status.color,
                              fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
                            }}>
                              {status.label}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deduction panel */}
            <div style={{
              background: T.sage50,
              padding: 18,
              borderRadius: T.radius.md,
              border: `1px solid ${T.borderSoft}`,
              height: 'fit-content',
            }}>
              <h4 style={{
                margin: '0 0 14px 0', fontSize: 14, fontWeight: 800, color: T.primary,
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                ➖ Dispense stock
              </h4>
              <form onSubmit={handleDeductStock}>
                <div style={{ marginBottom: 14 }}>
                  <label style={fieldLabel}>Selected batch</label>
                  <input
                    style={{ ...inputStyle, background: T.surface, color: batchId ? T.text : T.textMuted }}
                    value={batchId ? `Batch #${batchId}` : ''}
                    readOnly
                    placeholder="None selected"
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={fieldLabel}>Quantity</label>
                  <input
                    style={inputStyle}
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: 18 }}>
                  <label style={fieldLabel}>Reason / remarks</label>
                  <input
                    style={inputStyle}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    required
                  />
                </div>
                <button
                  type="submit"
                  disabled={!batchId}
                  style={{
                    ...btnPrimary, width: '100%', padding: 12,
                    opacity: batchId ? 1 : 0.4,
                    cursor: batchId ? 'pointer' : 'not-allowed',
                    background: batchId ? T.primary : T.sage400,
                  }}
                >
                  Confirm dispensation
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* ── STOCK-IN ────────────────────────────────────── */}
      {activeTab === 'stockin' && (
        <div style={{ maxWidth: 720 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.primary }}>
            📥 Log incoming medication shipment
          </h4>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: T.textSub }}>
            Every lot is tracked by batch and expiry for FEFO dispensing.
          </p>

          <form onSubmit={handleReceiveStock} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={fieldLabel}>Medicine master</label>
              <select style={inputStyle} value={stockInMedId} onChange={(e) => setStockInMedId(Number(e.target.value))} required>
                {medicines.map((m) => (
                  <option key={m.medicine_id} value={m.medicine_id}>
                    {m.name} ({m.generic_name}) — {m.strength} [{m.form}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={fieldLabel}>Lot / batch number</label>
              <input
                style={inputStyle}
                placeholder="e.g. BATCH-BIO-2026C"
                value={stockInBatchNo}
                onChange={(e) => setStockInBatchNo(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={fieldLabel}>Quantity received</label>
              <input
                style={inputStyle}
                type="number"
                min="1"
                value={stockInQty}
                onChange={(e) => setStockInQty(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={fieldLabel}>Manufacture date</label>
              <input
                style={inputStyle}
                type="date"
                value={stockInMfgDate}
                onChange={(e) => setStockInMfgDate(e.target.value)}
                required
              />
            </div>

            <div>
              <label style={fieldLabel}>Expiry date</label>
              <input
                style={inputStyle}
                type="date"
                value={stockInExpDate}
                onChange={(e) => setStockInExpDate(e.target.value)}
                required
              />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={fieldLabel}>Supplier / distributor</label>
              <input
                style={inputStyle}
                value={stockInSupplier}
                onChange={(e) => setStockInSupplier(e.target.value)}
                required
              />
            </div>

            <div style={{ gridColumn: 'span 2', marginTop: 6 }}>
              <button type="submit" style={{ ...btnPrimary, width: '100%', padding: 13 }}>
                📥 Record stock intake to central ledger
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── ADJUST & DISPOSE ────────────────────────────── */}
      {activeTab === 'adjust' && (
        <div style={{ maxWidth: 620 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.danger }}>
            🗑️ Discard expired / damaged medicines
          </h4>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: T.textSub }}>
            Removals are permanent and written to the activity log.
          </p>

          <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={fieldLabel}>Batch lot</label>
              <select
                style={inputStyle}
                value={adjustBatchId}
                onChange={(e) => setAdjustBatchId(Number(e.target.value))}
                required
              >
                <option value="">Choose batch lot…</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    #{b.batch_id} · {b.name} ({b.batch_no}) · Stock: {b.quantity_on_hand} · Exp: {new Date(b.expiry_date).toISOString().split('T')[0]}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Quantity to remove</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={fieldLabel}>Adjustment type</label>
                <select style={inputStyle} value={adjustType} onChange={(e: any) => setAdjustType(e.target.value)}>
                  <option value="dispose">Disposal (expired/spoiled)</option>
                  <option value="recall">Manufacturer recall</option>
                  <option value="return">Supplier return</option>
                  <option value="adjust">Audit discrepancy</option>
                </select>
              </div>
            </div>

            <div>
              <label style={fieldLabel}>Official reason / protocol</label>
              <input
                style={inputStyle}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                required
              />
            </div>

            <button
              type="submit"
              style={{ ...btnPrimary, background: T.danger, padding: 12, marginTop: 6 }}
            >
              Confirm & remove from available stock
            </button>
          </form>
        </div>
      )}

      {/* ── ALERTS & REORDER ────────────────────────────── */}
      {activeTab === 'alerts' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div>
            <h4 style={{
              margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.warning,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              📉 Automated reorder suggestions
            </h4>
            <div style={{
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.md,
              overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
            }}>
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
                        {s.suggested_reorder_qty > 0 ? `+${s.suggested_reorder_qty} ${s.unit}` : 'Adequate'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div>
            <h4 style={{
              margin: '0 0 12px', fontSize: 14, fontWeight: 800, color: T.danger,
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              ⏳ Near-expiry & critical lots (&lt; 90 days)
            </h4>
            <div style={{
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.md,
              overflow: 'hidden', maxHeight: 360, overflowY: 'auto',
            }}>
              {expiringLots.length === 0 ? (
                <div style={{
                  padding: 24, textAlign: 'center',
                  color: T.success, fontSize: 12.5, fontWeight: 700,
                }}>
                  No batches expiring within 90 days.
                </div>
              ) : (
                <table className="tbl" style={{ fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
                    <tr>
                      <th>Lot</th>
                      <th>Medicine</th>
                      <th style={{ textAlign: 'right' }}>Remaining</th>
                      <th>Expiry</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringLots.map((e) => (
                      <tr key={e.batch_id}>
                        <td style={{ fontFamily: T.mono, fontSize: 11, color: T.textSub }}>{e.batch_no}</td>
                        <td style={{ fontWeight: 700 }}>{e.name}</td>
                        <td style={{ textAlign: 'right' }}>{e.quantity_on_hand}</td>
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
      )}

      {/* ── LOGS ────────────────────────────────────────── */}
      {activeTab === 'logs' && (
        <div>
          <div style={{
            display: 'flex', justifyContent: 'space-between',
            alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12,
          }}>
            <div>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.primary }}>
                📜 Central inventory consumption log
              </h4>
              <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
                Showing <b>{filteredLogs.length}</b> of <b>{inventoryLogs.length}</b> recorded transactions
              </p>
            </div>
            <button type="button" onClick={fetchLogs} style={btnGhost}>
              🔄 Refresh
            </button>
          </div>

          {/* Filter bar */}
          <div style={{
            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            gap: 12, marginBottom: 16, flexWrap: 'wrap',
            background: T.sage50, padding: 12,
            borderRadius: T.radius.md, border: `1px solid ${T.borderSoft}`,
          }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {([
                { id: 'all',      label: `All actions (${inventoryLogs.length})` },
                { id: 'dispense', label: `📤 Dispensed (${inventoryLogs.filter((l) => l.transaction_type === 'dispense').length})` },
                { id: 'receive',  label: `📥 Received (${inventoryLogs.filter((l) => l.transaction_type === 'receive').length})` },
                { id: 'dispose',  label: `🗑️ Disposals (${inventoryLogs.filter((l) => ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)).length})` },
              ] as const).map((chip) => {
                const isActive = logTypeFilter === chip.id;
                return (
                  <button
                    key={chip.id}
                    type="button"
                    onClick={() => setLogTypeFilter(chip.id)}
                    style={{
                      padding: '5px 12px', borderRadius: T.radius.pill,
                      fontSize: 11.5, fontWeight: 700,
                      border: `1px solid ${isActive ? T.primary : T.border}`,
                      background: isActive ? T.primary : T.surface,
                      color: isActive ? '#fff' : T.textSub,
                      cursor: 'pointer', fontFamily: T.font,
                    }}
                  >
                    {chip.label}
                  </button>
                );
              })}
            </div>

            <input
              type="text"
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
              No transaction records found matching the selected filter.
            </div>
          ) : (
            <div style={{
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.md,
              overflow: 'hidden', maxHeight: 480, overflowY: 'auto',
            }}>
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
                    const isInbound = l.transaction_type === 'receive';
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
                            fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
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
                        <td style={{ color: T.textSub }}>{l.reason}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── NEW FORMULARY ───────────────────────────────── */}
      {activeTab === 'addmed' && (
        <div style={{ maxWidth: 620 }}>
          <h4 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 800, color: T.primary }}>
            ➕ Add new drug definition
          </h4>
          <p style={{ margin: '0 0 20px', fontSize: 12.5, color: T.textSub }}>
            New definitions become available in Stock-in immediately.
          </p>

          <form onSubmit={handleCreateMedicine} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div>
              <label style={fieldLabel}>Brand / trade name</label>
              <input
                style={inputStyle}
                placeholder="e.g. Alaxan FR"
                value={newMedName}
                onChange={(e) => setNewMedName(e.target.value)}
                required
              />
            </div>
            <div>
              <label style={fieldLabel}>Generic active ingredient</label>
              <input
                style={inputStyle}
                placeholder="e.g. Ibuprofen + Paracetamol"
                value={newMedGeneric}
                onChange={(e) => setNewMedGeneric(e.target.value)}
                required
              />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Dosage form</label>
                <select style={inputStyle} value={newMedForm} onChange={(e) => setNewMedForm(e.target.value)}>
                  <option value="Tablet">Tablet</option>
                  <option value="Capsule">Capsule</option>
                  <option value="Syrup">Syrup</option>
                  <option value="Suspension">Suspension</option>
                  <option value="Inhaler">Inhaler</option>
                  <option value="Ointment">Ointment</option>
                </select>
              </div>
              <div>
                <label style={fieldLabel}>Strength</label>
                <input
                  style={inputStyle}
                  placeholder="e.g. 200mg/325mg"
                  value={newMedStrength}
                  onChange={(e) => setNewMedStrength(e.target.value)}
                  required
                />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Unit of measure</label>
                <input
                  style={inputStyle}
                  placeholder="pcs, bottle, box"
                  value={newMedUnit}
                  onChange={(e) => setNewMedUnit(e.target.value)}
                  required
                />
              </div>
              <div>
                <label style={fieldLabel}>Critical reorder threshold</label>
                <input
                  style={inputStyle}
                  type="number"
                  min="1"
                  value={newMedReorder}
                  onChange={(e) => setNewMedReorder(e.target.value)}
                  required
                />
              </div>
            </div>
            <button type="submit" style={{ ...btnPrimary, padding: 13, marginTop: 6 }}>
              ➕ Save to formulary master
            </button>
          </form>
        </div>
      )}
    </section>
  );
}