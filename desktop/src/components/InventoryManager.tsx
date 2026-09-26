// desktop/src/components/InventoryManager.tsx
import React, { useState, useEffect, useRef } from 'react';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit?: string;
  reorder_level?: number;
}

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState<'catalog' | 'stockin' | 'adjust' | 'alerts' | 'logs' | 'addmed'>('catalog');

  // Catalog & Deduction State
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Prescription issuance');
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);

  // Barcode / Quick-Scan State
  const [barcodeQuery, setBarcodeQuery] = useState('');
  const barcodeInputRef = useRef<HTMLInputElement | null>(null);

  // Logs Filter State
  const [logTypeFilter, setLogTypeFilter] = useState<'all' | 'dispense' | 'receive' | 'dispose'>('all');
  const [logSearchQuery, setLogSearchQuery] = useState('');

  // Stock-In State
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

  // Disposal / Adjust State
  const [adjustBatchId, setAdjustBatchId] = useState<number | ''>('');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustType, setAdjustType] = useState<'dispose' | 'adjust' | 'recall' | 'return'>('dispose');
  const [adjustReason, setAdjustReason] = useState('Expired batch quarantine');

  // Alerts & Reorder State
  const [reorderSuggestions, setReorderSuggestions] = useState<any[]>([]);
  const [expiringLots, setExpiringLots] = useState<any[]>([]);

  // Logs State
  const [inventoryLogs, setInventoryLogs] = useState<any[]>([]);
  const [loadingLogs, setLoadingLogs] = useState(false);

  // New Medicine Master State
  const [newMedName, setNewMedName] = useState('');
  const [newMedGeneric, setNewMedGeneric] = useState('');
  const [newMedForm, setNewMedForm] = useState('Tablet');
  const [newMedStrength, setNewMedStrength] = useState('500mg');
  const [newMedUnit, setNewMedUnit] = useState('pcs');
  const [newMedReorder, setNewMedReorder] = useState('30');

  const fetchBatches = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setBatches(await res.json());
    } catch (err) {
      console.error('Failed to fetch batches:', err);
    }
  };

  const fetchMedicines = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/medicines', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data: MedicineMaster[] = await res.json();
        setMedicines(data);
        if (data.length > 0 && stockInMedId === '') {
          setStockInMedId(data[0].medicine_id);
        }
      }
    } catch (_) {}
  };

  const fetchReorderAndAlerts = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const [resSug, resExp] = await Promise.all([
        fetch('https://localhost:5000/api/inventory/reorder-suggestions', { headers: { Authorization: `Bearer ${token}` } }),
        fetch('https://localhost:5000/api/inventory/expiring-soon', { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      if (resSug.ok) setReorderSuggestions(await resSug.json());
      if (resExp.ok) setExpiringLots(await resExp.json());
    } catch (_) {}
  };

  const fetchLogs = async () => {
    setLoadingLogs(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/logs', {
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

  // Filtered logs computation
  const filteredLogs = inventoryLogs.filter((l) => {
    const matchesType =
      logTypeFilter === 'all'
        ? true
        : logTypeFilter === 'dispose'
        ? ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)
        : l.transaction_type === logTypeFilter;

    const query = logSearchQuery.trim().toLowerCase();
    const matchesSearch =
      !query ||
      (l.medicine_name && l.medicine_name.toLowerCase().includes(query)) ||
      (l.batch_no && l.batch_no.toLowerCase().includes(query)) ||
      (l.performed_by_name && l.performed_by_name.toLowerCase().includes(query)) ||
      (l.reason && l.reason.toLowerCase().includes(query));

    return matchesType && matchesSearch;
  });

  // Barcode scanner burst handler
  const handleBarcodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!barcodeQuery.trim()) return;
    const match = batches.find(
      (b) =>
        b.batch_no.toLowerCase() === barcodeQuery.trim().toLowerCase() ||
        b.batch_id.toString() === barcodeQuery.trim()
    );

    if (match) {
      setBatchId(match.batch_id.toString());
      setAdjustBatchId(match.batch_id);
      setStatusMessage(`🎯 Barcode Scanned: Selected ${match.name} (Batch ${match.batch_no})`);
      setBarcodeQuery('');
    } else {
      setStatusMessage(`⚠️ Barcode "${barcodeQuery}" not found in active inventory.`);
    }
  };

  // 1. Stock Deduction
  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('');
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/deduct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          batch_id: Number(batchId),
          quantity_deducted: Number(quantity),
          reason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage('✅ Success: ' + data.message);
        fetchBatches();
        fetchReorderAndAlerts();
        setBatchId('');
        setQuantity('1');
      } else {
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to deduct stock'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network error: ' + err.message);
    }
  };

  // 2. Inbound Stock-In (Receive Deliveries)
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Logging shipment receipt...');
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to record shipment intake'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network Error: ' + err.message);
    }
  };

  // 3. Stock Adjustment & Disposal
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustBatchId) {
      alert('Please select a batch to adjust.');
      return;
    }
    setStatusMessage('Processing inventory adjustment...');
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to adjust inventory'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network Error: ' + err.message);
    }
  };

  // 4. Create New Medicine Master
  const handleCreateMedicine = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Registering new formulary medicine...');
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/medicines', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
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
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to add medicine'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network Error: ' + err.message);
    }
  };

  const getExpiryStatus = (expiryDate: string) => {
    const daysUntil = (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    if (daysUntil < 0) return { label: 'EXPIRED', color: '#dc2626' };
    if (daysUntil <= 90) return { label: 'EXPIRING SOON', color: '#b45309' };
    return { label: 'GOOD', color: '#16a34a' };
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '8px 10px',
    boxSizing: 'border-box',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
    marginTop: 4,
  };

  return (
    <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff', marginTop: 20 }}>
      {/* HEADER & SUB-TABS */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f766e', fontSize: 17 }}>📦 Medicine & First-Aid Inventory (FEFO)</h3>
          <small style={{ color: '#64748b' }}>Lot traceability, expiration safeguards & stock monitoring</small>
        </div>

        {/* Tab Switcher */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            { id: 'catalog', label: '📦 Catalog & Dispense' },
            { id: 'stockin', label: '📥 Stock-In (Receive)' },
            { id: 'alerts', label: '⚠️ Alerts & Reorder' },
            { id: 'adjust', label: '🗑️ Adjust & Dispose' },
            { id: 'logs', label: '📜 Consumption Logs' },
            { id: 'addmed', label: '➕ New Formulary' },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id as any);
                setStatusMessage('');
                if (tab.id === 'logs') fetchLogs();
                if (tab.id === 'alerts') fetchReorderAndAlerts();
              }}
              style={{
                padding: '6px 12px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                border: '1px solid ' + (activeTab === tab.id ? '#0f766e' : '#cbd5e1'),
                background: activeTab === tab.id ? '#0f766e' : '#f8fafc',
                color: activeTab === tab.id ? '#ffffff' : '#334155',
              }}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {statusMessage && (
        <div
          style={{
            padding: '8px 12px',
            margin: '12px 0',
            borderRadius: 6,
            fontSize: 13,
            background: statusMessage.includes('✅') ? '#f0fdf4' : '#fef2f2',
            color: statusMessage.includes('✅') ? '#15803d' : '#b91c1c',
            border: `1px solid ${statusMessage.includes('✅') ? '#bbf7d0' : '#fecaca'}`,
          }}
        >
          {statusMessage}
        </div>
      )}

      {/* TAB 1: CATALOG & DISPENSE */}
      {activeTab === 'catalog' && (
        <div>
          {/* USB Barcode Scanner Bar */}
          <form
            onSubmit={handleBarcodeSubmit}
            style={{
              display: 'flex',
              gap: 10,
              marginTop: 14,
              marginBottom: 14,
              background: '#f8fafc',
              padding: 10,
              borderRadius: 6,
              border: '1px solid #e2e8f0',
              alignItems: 'center',
            }}
          >
            <span style={{ fontSize: 16 }}>📟</span>
            <input
              ref={barcodeInputRef}
              type="text"
              placeholder="Scan Barcode / Batch No with USB Scanner (or type & press Enter)..."
              value={barcodeQuery}
              onChange={(e) => setBarcodeQuery(e.target.value)}
              style={{ flex: 1, padding: '6px 10px', fontSize: 13, border: '1px solid #cbd5e1', borderRadius: 4, background: '#ffffff', color: '#0f172a' }}
            />
            <button
              type="submit"
              style={{ padding: '6px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, fontWeight: 'bold', cursor: 'pointer', fontSize: 12 }}
            >
              Scan / Find Lot
            </button>
          </form>

          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
            {/* Catalog Table */}
            <div style={{ flex: 2, minWidth: 340 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 'bold', color: '#334155' }}>First-Expiry-First-Out (FEFO) Batches:</span>
                <small style={{ color: '#64748b' }}>Click a row to select for deduction</small>
              </div>

              <div style={{ maxHeight: '340px', overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                      <th style={{ padding: '8px 10px', width: '30px' }}>#</th>
                      <th style={{ padding: 8 }}>Batch ID</th>
                      <th style={{ padding: 8 }}>Medicine / Dosage</th>
                      <th style={{ padding: 8 }}>Lot / Batch No</th>
                      <th style={{ padding: 8 }}>Stock</th>
                      <th style={{ padding: 8 }}>Expires</th>
                      <th style={{ padding: 8 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b, idx) => {
                      const status = getExpiryStatus(b.expiry_date);
                      const isLowStock = b.quantity_on_hand < 20;
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
                            borderBottom: '1px solid #f1f5f9',
                            background: isSelected ? '#ccfbf1' : 'transparent',
                            transition: 'background 0.15s',
                          }}
                        >
                          <td style={{ padding: '8px 10px', color: '#64748b', fontWeight: 600 }}>{idx + 1}</td>
                          <td style={{ padding: 8 }}>
                            <span
                              style={{
                                background: '#f1f5f9',
                                color: '#334155',
                                padding: '2px 6px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontFamily: 'monospace',
                                fontWeight: 'bold',
                                border: '1px solid #e2e8f0',
                              }}
                            >
                              ID: {b.batch_id}
                            </span>
                          </td>
                          <td style={{ padding: 8 }}>
                            <span style={{ fontWeight: 600, color: '#0f172a' }}>{b.name}</span>
                            <div style={{ fontSize: 11, color: '#64748b' }}>{b.generic_name} • {b.strength}</div>
                          </td>
                          <td style={{ padding: 8, fontFamily: 'monospace', fontSize: 12 }}>{b.batch_no}</td>
                          <td style={{ padding: 8, color: isLowStock ? '#dc2626' : '#0f766e', fontWeight: 'bold' }}>
                            {b.quantity_on_hand} {b.unit || 'pcs'}
                          </td>
                          <td style={{ padding: 8, fontSize: 12 }}>{new Date(b.expiry_date).toISOString().split('T')[0]}</td>
                          <td style={{ padding: 8, color: status.color, fontWeight: 'bold', fontSize: 11 }}>
                            {status.label}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Deduction Form */}
            <div style={{ flex: 1, minWidth: 260, background: '#f8fafc', padding: 14, borderRadius: 6, border: '1px solid #e2e8f0', height: 'fit-content' }}>
              <h4 style={{ margin: '0 0 10px 0', color: '#0f766e' }}>➖ Dispense / Deduct Stock</h4>
              <form onSubmit={handleDeductStock}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#475569' }}>Selected Batch ID:</label>
                  <input style={{ ...inputStyle, background: '#f1f5f9' }} value={batchId ? `Batch #${batchId}` : ''} readOnly placeholder="Select from catalog above..." />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#475569' }}>Quantity to Dispense:</label>
                  <input style={inputStyle} type="number" min="1" value={quantity} onChange={(e) => setQuantity(e.target.value)} required />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#475569' }}>Reason / Remarks:</label>
                  <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} required />
                </div>
                <button
                  type="submit"
                  disabled={!batchId}
                  style={{
                    width: '100%',
                    padding: 10,
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 'bold',
                    background: batchId ? '#0f766e' : '#cbd5e1',
                    color: '#ffffff',
                    cursor: batchId ? 'pointer' : 'not-allowed',
                  }}
                >
                  Confirm Dispensation
                </button>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: INBOUND STOCK-IN (RECEIVE SHIPMENT) */}
      {activeTab === 'stockin' && (
        <div style={{ marginTop: 14, maxWidth: 640 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#0f766e' }}>📥 Log Incoming Medication Shipment</h4>
          <form onSubmit={handleReceiveStock} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Medicine Master:</label>
              <select style={inputStyle} value={stockInMedId} onChange={(e) => setStockInMedId(Number(e.target.value))} required>
                {medicines.map((m) => (
                  <option key={m.medicine_id} value={m.medicine_id}>
                    {m.name} ({m.generic_name}) - {m.strength} [{m.form}]
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Lot / Batch Number:</label>
              <input style={inputStyle} placeholder="e.g. BATCH-BIO-2026C" value={stockInBatchNo} onChange={(e) => setStockInBatchNo(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Quantity Received:</label>
              <input style={inputStyle} type="number" min="1" value={stockInQty} onChange={(e) => setStockInQty(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Manufacture Date:</label>
              <input style={inputStyle} type="date" value={stockInMfgDate} onChange={(e) => setStockInMfgDate(e.target.value)} required />
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Expiry Date:</label>
              <input style={inputStyle} type="date" value={stockInExpDate} onChange={(e) => setStockInExpDate(e.target.value)} required />
            </div>

            <div style={{ gridColumn: 'span 2' }}>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Supplier / Distributor:</label>
              <input style={inputStyle} value={stockInSupplier} onChange={(e) => setStockInSupplier(e.target.value)} required />
            </div>

            <div style={{ gridColumn: 'span 2', marginTop: 8 }}>
              <button type="submit" style={{ width: '100%', padding: 10, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
                📥 Record Stock Intake to Central Ledger
              </button>
            </div>
          </form>
        </div>
      )}

      {/* TAB 3: ALERTS & REORDER SUGGESTIONS */}
      {activeTab === 'alerts' && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#b45309' }}>📉 Automated Reorder Suggestions</h4>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: 6 }}>Medicine</th>
                      <th style={{ padding: 6 }}>Current Stock</th>
                      <th style={{ padding: 6 }}>Buffer Level</th>
                      <th style={{ padding: 6 }}>Suggested Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reorderSuggestions.map((s) => (
                      <tr key={s.medicine_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: 6, fontWeight: 'bold' }}>{s.name}</td>
                        <td style={{ padding: 6, color: s.total_stock_on_hand <= s.reorder_level ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                          {s.total_stock_on_hand} {s.unit}
                        </td>
                        <td style={{ padding: 6 }}>{s.reorder_level} {s.unit}</td>
                        <td style={{ padding: 6, color: s.suggested_reorder_qty > 0 ? '#b45309' : '#64748b', fontWeight: 'bold' }}>
                          {s.suggested_reorder_qty > 0 ? `+${s.suggested_reorder_qty} ${s.unit}` : 'Adequate'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div>
              <h4 style={{ margin: '0 0 10px 0', color: '#dc2626' }}>⏳ Near-Expiry & Critical Lots (&lt; 90 Days)</h4>
              <div style={{ maxHeight: 300, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
                <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                      <th style={{ padding: 6 }}>Lot</th>
                      <th style={{ padding: 6 }}>Medicine</th>
                      <th style={{ padding: 6 }}>Remaining</th>
                      <th style={{ padding: 6 }}>Expiry</th>
                      <th style={{ padding: 6 }}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {expiringLots.length === 0 ? (
                      <tr><td colSpan={5} style={{ padding: 12, textAlign: 'center', color: '#16a34a' }}>No batches expiring within 90 days.</td></tr>
                    ) : (
                      expiringLots.map((e) => (
                        <tr key={e.batch_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                          <td style={{ padding: 6, fontFamily: 'monospace' }}>{e.batch_no}</td>
                          <td style={{ padding: 6, fontWeight: 'bold' }}>{e.name}</td>
                          <td style={{ padding: 6 }}>{e.quantity_on_hand}</td>
                          <td style={{ padding: 6 }}>{e.expiry_date}</td>
                          <td style={{ padding: 6, color: e.alert_level === 'EXPIRED' ? '#dc2626' : '#b45309', fontWeight: 'bold' }}>{e.alert_level}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: DISPOSAL & ADJUSTMENTS */}
      {activeTab === 'adjust' && (
        <div style={{ marginTop: 14, maxWidth: 540 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#dc2626' }}>🗑️ Discard Expired / Damaged Medicines</h4>
          <form onSubmit={handleAdjustStock} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Select Batch Lot:</label>
              <select style={inputStyle} value={adjustBatchId} onChange={(e) => setAdjustBatchId(Number(e.target.value))} required>
                <option value="">Choose batch lot...</option>
                {batches.map((b) => (
                  <option key={b.batch_id} value={b.batch_id}>
                    #{b.batch_id} - {b.name} ({b.batch_no}) [Stock: {b.quantity_on_hand}] - Exp: {new Date(b.expiry_date).toISOString().split('T')[0]}
                  </option>
                ))}
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Quantity to Remove:</label>
                <input style={inputStyle} type="number" min="1" value={adjustQty} onChange={(e) => setAdjustQty(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Adjustment Type:</label>
                <select style={inputStyle} value={adjustType} onChange={(e: any) => setAdjustType(e.target.value)}>
                  <option value="dispose">Disposal (Expired/Spoiled)</option>
                  <option value="recall">Manufacturer Recall</option>
                  <option value="return">Supplier Return</option>
                  <option value="adjust">Audit Discrepancy</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Official Reason / Protocol:</label>
              <input style={inputStyle} value={adjustReason} onChange={(e) => setAdjustReason(e.target.value)} required />
            </div>

            <button type="submit" style={{ marginTop: 6, padding: 10, background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
              Confirm & Remove From Available Stock
            </button>
          </form>
        </div>
      )}

      {/* TAB 5: TRANSACTION & CONSUMPTION LOGS */}
      {activeTab === 'logs' && (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
            <div>
              <h4 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>📜 Central Inventory Consumption & Activity Log</h4>
              <small style={{ color: '#64748b' }}>
                Showing <b>{filteredLogs.length}</b> of <b>{inventoryLogs.length}</b> recorded transactions
              </small>
            </div>

            <button
              onClick={fetchLogs}
              style={{ padding: '6px 12px', fontSize: 12, border: '1px solid #cbd5e1', background: '#f8fafc', borderRadius: 4, cursor: 'pointer', fontWeight: 600 }}
            >
              🔄 Refresh
            </button>
          </div>

          {/* Filter Toolbar: Action Pills + Search Box */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, marginBottom: 12, flexWrap: 'wrap', background: '#f8fafc', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => setLogTypeFilter('all')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid ' + (logTypeFilter === 'all' ? '#0f766e' : '#cbd5e1'),
                  background: logTypeFilter === 'all' ? '#0f766e' : '#ffffff',
                  color: logTypeFilter === 'all' ? '#ffffff' : '#475569',
                }}
              >
                All Actions ({inventoryLogs.length})
              </button>

              <button
                type="button"
                onClick={() => setLogTypeFilter('dispense')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid ' + (logTypeFilter === 'dispense' ? '#0284c7' : '#cbd5e1'),
                  background: logTypeFilter === 'dispense' ? '#0284c7' : '#ffffff',
                  color: logTypeFilter === 'dispense' ? '#ffffff' : '#0369a1',
                }}
              >
                📤 Dispensed Only ({inventoryLogs.filter((l) => l.transaction_type === 'dispense').length})
              </button>

              <button
                type="button"
                onClick={() => setLogTypeFilter('receive')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid ' + (logTypeFilter === 'receive' ? '#16a34a' : '#cbd5e1'),
                  background: logTypeFilter === 'receive' ? '#16a34a' : '#ffffff',
                  color: logTypeFilter === 'receive' ? '#ffffff' : '#15803d',
                }}
              >
                📥 Received ({inventoryLogs.filter((l) => l.transaction_type === 'receive').length})
              </button>

              <button
                type="button"
                onClick={() => setLogTypeFilter('dispose')}
                style={{
                  padding: '5px 12px',
                  borderRadius: 20,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid ' + (logTypeFilter === 'dispose' ? '#dc2626' : '#cbd5e1'),
                  background: logTypeFilter === 'dispose' ? '#dc2626' : '#ffffff',
                  color: logTypeFilter === 'dispose' ? '#ffffff' : '#b91c1c',
                }}
              >
                🗑️ Disposals ({inventoryLogs.filter((l) => ['dispose', 'adjust', 'recall', 'return'].includes(l.transaction_type)).length})
              </button>
            </div>

            <div style={{ minWidth: 220 }}>
              <input
                type="text"
                placeholder="Search drug, lot, staff..."
                value={logSearchQuery}
                onChange={(e) => setLogSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  padding: '6px 10px',
                  fontSize: 12,
                  border: '1px solid #cbd5e1',
                  borderRadius: 6,
                  outline: 'none',
                  backgroundColor: '#ffffff',
                }}
              />
            </div>
          </div>

          {loadingLogs ? (
            <p style={{ color: '#64748b', fontSize: 13 }}>Loading activity logs...</p>
          ) : filteredLogs.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', background: '#f8fafc', border: '1px dashed #cbd5e1', borderRadius: 6, color: '#64748b' }}>
              No transaction records found matching the selected filter.
            </div>
          ) : (
            <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
              <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                  <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                    <th style={{ padding: '8px 10px' }}>Log ID</th>
                    <th style={{ padding: '8px 10px' }}>Date & Time</th>
                    <th style={{ padding: '8px 10px' }}>Action</th>
                    <th style={{ padding: '8px 10px' }}>Medicine & Lot</th>
                    <th style={{ padding: '8px 10px' }}>Stock Delta</th>
                    <th style={{ padding: '8px 10px' }}>Performed By</th>
                    <th style={{ padding: '8px 10px' }}>Reason / Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredLogs.map((l) => (
                    <tr key={l.log_id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                      <td style={{ padding: '8px 10px', fontWeight: 'bold' }}>#{l.log_id}</td>
                      <td style={{ padding: '8px 10px', color: '#64748b' }}>{new Date(l.created_at).toLocaleString()}</td>
                      <td style={{ padding: '8px 10px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontWeight: 'bold',
                            fontSize: 10,
                            background:
                              l.transaction_type === 'receive'
                                ? '#dcfce7'
                                : l.transaction_type === 'dispense'
                                ? '#e0f2fe'
                                : '#fee2e2',
                            color:
                              l.transaction_type === 'receive'
                                ? '#15803d'
                                : l.transaction_type === 'dispense'
                                ? '#0369a1'
                                : '#b91c1c',
                          }}
                        >
                          {l.transaction_type.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <b>{l.medicine_name}</b> <small style={{ color: '#64748b' }}>({l.batch_no})</small>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{l.generic_name} • {l.strength}</div>
                      </td>
                      <td
                        style={{
                          padding: '8px 10px',
                          fontWeight: 'bold',
                          color: l.quantity_change > 0 ? '#16a34a' : '#dc2626',
                        }}
                      >
                        {l.quantity_change > 0 ? `+${l.quantity_change}` : l.quantity_change}
                      </td>
                      <td style={{ padding: '8px 10px' }}>
                        <div style={{ fontWeight: 600 }}>{l.performed_by_name}</div>
                        <div style={{ fontSize: 10, color: '#64748b' }}>{l.performed_by_email}</div>
                      </td>
                      <td style={{ padding: '8px 10px', color: '#475569' }}>{l.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 6: NEW MEDICINE REGISTRATION */}
      {activeTab === 'addmed' && (
        <div style={{ marginTop: 14, maxWidth: 540 }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#0f766e' }}>➕ Add New Drug Definition to Hospital Formulary</h4>
          <form onSubmit={handleCreateMedicine} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Brand / Trade Name:</label>
              <input style={inputStyle} placeholder="e.g. Alaxan FR" value={newMedName} onChange={(e) => setNewMedName(e.target.value)} required />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 'bold' }}>Generic Active Ingredient:</label>
              <input style={inputStyle} placeholder="e.g. Ibuprofen + Paracetamol" value={newMedGeneric} onChange={(e) => setNewMedGeneric(e.target.value)} required />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Dosage Form:</label>
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
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Strength:</label>
                <input style={inputStyle} placeholder="e.g. 200mg/325mg" value={newMedStrength} onChange={(e) => setNewMedStrength(e.target.value)} required />
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Unit of Measure:</label>
                <input style={inputStyle} placeholder="pcs, bottle, box" value={newMedUnit} onChange={(e) => setNewMedUnit(e.target.value)} required />
              </div>
              <div>
                <label style={{ fontSize: 12, fontWeight: 'bold' }}>Critical Reorder Threshold:</label>
                <input style={inputStyle} type="number" min="1" value={newMedReorder} onChange={(e) => setNewMedReorder(e.target.value)} required />
              </div>
            </div>
            <button type="submit" style={{ marginTop: 6, padding: 10, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer' }}>
              ➕ Save to Formulary Master
            </button>
          </form>
        </div>
      )}
    </section>
  );
}