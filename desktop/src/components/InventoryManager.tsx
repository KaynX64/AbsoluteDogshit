// desktop/src/components/InventoryManager.tsx
import React, { useState, useEffect } from 'react';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
}

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState<'deduct' | 'receive' | 'adjust'>('deduct');

  // Shared Catalog State
  const [batches, setBatches] = useState<any[]>([]);
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState('');
  const [statusMessage, setStatusMessage] = useState<{ text: string; isError: boolean } | null>(null);

  // 1. Deduction State
  const [deductQty, setDeductQty] = useState('1');
  const [deductReason, setDeductReason] = useState('Prescription issuance');

  // 2. Receive Shipment State
  const [receiveMedId, setReceiveMedId] = useState<number>(1);
  const [receiveBatchNo, setReceiveBatchNo] = useState('');
  const [receiveMfgDate, setReceiveMfgDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [receiveExpDate, setReceiveExpDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().split('T')[0];
  });
  const [receiveSupplier, setReceiveSupplier] = useState('Unilab Philippines');
  const [receiveQty, setReceiveQty] = useState('100');

  // 3. Stock Adjustment / Disposal State
  const [adjustQty, setAdjustQty] = useState('5');
  const [adjustType, setAdjustType] = useState<'dispose' | 'adjust' | 'recall' | 'return'>('dispose');
  const [adjustReason, setAdjustReason] = useState('Expired / damaged packaging');

  const fetchBatches = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBatches(await res.json());
      }
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
        if (data.length > 0) setReceiveMedId(data[0].medicine_id);
      }
    } catch (err) {
      console.error('Failed to fetch medicines catalog:', err);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchMedicines();
  }, []);

  // Helper to color-code FEFO status
  const getExpiryStatus = (expiryDate: string) => {
    const daysUntil = (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    if (daysUntil < 0) return { label: 'EXPIRED', color: '#dc2626' };
    if (daysUntil <= 90) return { label: 'EXPIRING SOON', color: '#b45309' };
    return { label: 'GOOD', color: '#16a34a' };
  };

  // --- HANDLER 1: DEDUCT STOCK ---
  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/deduct', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          batch_id: Number(selectedBatchId),
          quantity_deducted: Number(deductQty),
          reason: deductReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ text: `✅ ${data.message}`, isError: false });
        fetchBatches();
        setSelectedBatchId('');
        setDeductQty('1');
      } else {
        setStatusMessage({ text: `❌ ${data.error || 'Failed to deduct stock'}`, isError: true });
      }
    } catch (err: any) {
      setStatusMessage({ text: `❌ Network error: ${err.message}`, isError: true });
    }
  };

  // --- HANDLER 2: RECEIVE SHIPMENT / STOCK-IN ---
  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          medicine_id: Number(receiveMedId),
          batch_no: receiveBatchNo.trim(),
          manufacture_date: receiveMfgDate,
          expiry_date: receiveExpDate,
          supplier: receiveSupplier.trim(),
          quantity_received: Number(receiveQty),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ text: `✅ ${data.message}`, isError: false });
        fetchBatches();
        setReceiveBatchNo('');
        setReceiveQty('100');
      } else {
        setStatusMessage({ text: `❌ ${data.error || 'Failed to process shipment'}`, isError: true });
      }
    } catch (err: any) {
      setStatusMessage({ text: `❌ Network error: ${err.message}`, isError: true });
    }
  };

  // --- HANDLER 3: DISPOSE / ADJUST STOCK ---
  const handleAdjustStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch('https://localhost:5000/api/inventory/adjust', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          batch_id: Number(selectedBatchId),
          quantity_removed: Number(adjustQty),
          transaction_type: adjustType,
          reason: adjustReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setStatusMessage({ text: `✅ ${data.message}`, isError: false });
        fetchBatches();
        setSelectedBatchId('');
        setAdjustQty('5');
      } else {
        setStatusMessage({ text: `❌ ${data.error || 'Adjustment failed'}`, isError: true });
      }
    } catch (err: any) {
      setStatusMessage({ text: `❌ Network error: ${err.message}`, isError: true });
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '7px 10px',
    marginTop: 3,
    marginBottom: 10,
    border: '1px solid #cbd5e1',
    borderRadius: 5,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  };

  return (
    <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff', marginTop: 20 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>3. Pharmacy Inventory & FEFO Batch Control (Feature 9)</h3>
          <small style={{ color: '#64748b' }}>
            First-Expired, First-Out (FEFO) tracking, automated stock deduction, intake, and audit logging
          </small>
        </div>
        <button
          type="button"
          onClick={fetchBatches}
          style={{ padding: '6px 12px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
        >
          🔄 Refresh Batches
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 20 }}>
        {/* LEFT COLUMN: LIVE BATCH CATALOG */}
        <div style={{ borderRight: '1px solid #e2e8f0', paddingRight: 16 }}>
          <p style={{ fontSize: 12, color: '#64748b', marginTop: 0, marginBottom: 8 }}>
            💡 Click any row to automatically select that batch for <b>Deduction</b> or <b>Disposal</b>.
          </p>

          <div style={{ maxHeight: 360, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 6 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, textAlign: 'left' }}>
              <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', zIndex: 1 }}>
                <tr style={{ borderBottom: '2px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '8px' }}>Batch</th>
                  <th style={{ padding: '8px' }}>Medicine</th>
                  <th style={{ padding: '8px' }}>Stock</th>
                  <th style={{ padding: '8px' }}>Expiry</th>
                  <th style={{ padding: '8px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const status = getExpiryStatus(b.expiry_date);
                  const isLow = b.quantity_on_hand < 25;
                  const isSelected = selectedBatchId === b.batch_id.toString();

                  return (
                    <tr
                      key={b.batch_id}
                      onClick={() => setSelectedBatchId(b.batch_id.toString())}
                      style={{
                        cursor: 'pointer',
                        borderBottom: '1px solid #f1f5f9',
                        background: isSelected ? '#ccfbf1' : 'transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      <td style={{ padding: '8px', fontWeight: 600, color: '#0f766e' }}>
                        #{b.batch_id}<br />
                        <small style={{ color: '#64748b' }}>{b.batch_no}</small>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <b>{b.name}</b>
                        <div style={{ fontSize: 11, color: '#64748b' }}>{b.generic_name} ({b.strength})</div>
                      </td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: isLow ? '#dc2626' : '#0f172a' }}>
                        {b.quantity_on_hand}
                      </td>
                      <td style={{ padding: '8px', color: '#475569', fontSize: 11 }}>
                        {b.expiry_date}<br />
                        <span style={{ fontSize: 10, color: '#64748b' }}>({b.days_until_expiry}d left)</span>
                      </td>
                      <td style={{ padding: '8px' }}>
                        <span style={{ color: status.color, fontWeight: 'bold', fontSize: 11 }}>
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

        {/* RIGHT COLUMN: ACTION TABS & FORMS */}
        <div>
          {/* Action Tabs Header */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
            <button
              type="button"
              onClick={() => { setActiveTab('deduct'); setStatusMessage(null); }}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: 4,
                border: '1px solid ' + (activeTab === 'deduct' ? '#0f766e' : '#cbd5e1'),
                background: activeTab === 'deduct' ? '#0f766e' : '#f8fafc',
                color: activeTab === 'deduct' ? '#ffffff' : '#334155',
              }}
            >
              ➖ Dispense
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('receive'); setStatusMessage(null); }}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: 4,
                border: '1px solid ' + (activeTab === 'receive' ? '#0284c7' : '#cbd5e1'),
                background: activeTab === 'receive' ? '#0284c7' : '#f8fafc',
                color: activeTab === 'receive' ? '#ffffff' : '#334155',
              }}
            >
              ➕ Restock
            </button>
            <button
              type="button"
              onClick={() => { setActiveTab('adjust'); setStatusMessage(null); }}
              style={{
                flex: 1,
                padding: '6px 8px',
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                borderRadius: 4,
                border: '1px solid ' + (activeTab === 'adjust' ? '#b45309' : '#cbd5e1'),
                background: activeTab === 'adjust' ? '#b45309' : '#f8fafc',
                color: activeTab === 'adjust' ? '#ffffff' : '#334155',
              }}
            >
              ⚠️ Dispose / Adjust
            </button>
          </div>

          {/* TAB 1: DEDUCT / DISPENSE FORM */}
          {activeTab === 'deduct' && (
            <form onSubmit={handleDeductStock}>
              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Selected Batch ID:</label>
              <input
                style={{ ...inputStyle, background: '#f1f5f9' }}
                value={selectedBatchId ? `Batch #${selectedBatchId}` : ''}
                readOnly
                placeholder="Click a row from the catalog..."
              />

              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Quantity to Dispense:</label>
              <input
                type="number"
                min="1"
                style={inputStyle}
                value={deductQty}
                onChange={(e) => setDeductQty(e.target.value)}
                required
              />

              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Reason / Remarks:</label>
              <input
                style={inputStyle}
                value={deductReason}
                onChange={(e) => setDeductReason(e.target.value)}
                required
              />

              <button
                type="submit"
                disabled={!selectedBatchId}
                style={{
                  width: '100%',
                  padding: 10,
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: selectedBatchId ? 'pointer' : 'not-allowed',
                  background: selectedBatchId ? '#0f766e' : '#cbd5e1',
                  color: '#ffffff',
                  marginTop: 6,
                }}
              >
                {selectedBatchId ? '➖ Deduct & Dispense Stock' : 'Select a Batch from Catalog'}
              </button>
            </form>
          )}

          {/* TAB 2: RECEIVE SHIPMENT / STOCK-IN FORM */}
          {activeTab === 'receive' && (
            <form onSubmit={handleReceiveStock}>
              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Select Medicine:</label>
              <select
                style={inputStyle}
                value={receiveMedId}
                onChange={(e) => setReceiveMedId(Number(e.target.value))}
              >
                {medicines.map((m) => (
                  <option key={m.medicine_id} value={m.medicine_id}>
                    {m.name} ({m.generic_name}) - {m.strength}
                  </option>
                ))}
              </select>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Batch / Lot No:</label>
                  <input
                    style={inputStyle}
                    value={receiveBatchNo}
                    placeholder="e.g. BATCH-2026-X"
                    onChange={(e) => setReceiveBatchNo(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Quantity Received:</label>
                  <input
                    type="number"
                    min="1"
                    style={inputStyle}
                    value={receiveQty}
                    onChange={(e) => setReceiveQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Mfg Date:</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={receiveMfgDate}
                    onChange={(e) => setReceiveMfgDate(e.target.value)}
                    required
                  />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Expiry Date:</label>
                  <input
                    type="date"
                    style={inputStyle}
                    value={receiveExpDate}
                    onChange={(e) => setReceiveExpDate(e.target.value)}
                    required
                  />
                </div>
              </div>

              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Supplier / Manufacturer:</label>
              <input
                style={inputStyle}
                value={receiveSupplier}
                onChange={(e) => setReceiveSupplier(e.target.value)}
                required
              />

              <button
                type="submit"
                style={{
                  width: '100%',
                  padding: 10,
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: 'pointer',
                  background: '#0284c7',
                  color: '#ffffff',
                  marginTop: 6,
                }}
              >
                📥 Log Inbound Shipment (Stock-In)
              </button>
            </form>
          )}

          {/* TAB 3: DISPOSE / ADJUST FORM */}
          {activeTab === 'adjust' && (
            <form onSubmit={handleAdjustStock}>
              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Selected Batch ID:</label>
              <input
                style={{ ...inputStyle, background: '#f1f5f9' }}
                value={selectedBatchId ? `Batch #${selectedBatchId}` : ''}
                readOnly
                placeholder="Click a row from the catalog..."
              />

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Action Type:</label>
                  <select
                    style={inputStyle}
                    value={adjustType}
                    onChange={(e: any) => setAdjustType(e.target.value)}
                  >
                    <option value="dispose">Dispose (Expired/Spoiled)</option>
                    <option value="recall">Recall (Manufacturer)</option>
                    <option value="return">Return to Supplier</option>
                    <option value="adjust">Stock Count Adjustment</option>
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Qty to Remove:</label>
                  <input
                    type="number"
                    min="1"
                    style={inputStyle}
                    value={adjustQty}
                    onChange={(e) => setAdjustQty(e.target.value)}
                    required
                  />
                </div>
              </div>

              <label style={{ fontSize: 12, fontWeight: 'bold', color: '#334155' }}>Justification / Reason:</label>
              <input
                style={inputStyle}
                value={adjustReason}
                onChange={(e) => setAdjustReason(e.target.value)}
                placeholder="e.g. Broken vial during transit, past shelf-life"
                required
              />

              <button
                type="submit"
                disabled={!selectedBatchId}
                style={{
                  width: '100%',
                  padding: 10,
                  border: 'none',
                  borderRadius: 6,
                  fontWeight: 'bold',
                  fontSize: 13,
                  cursor: selectedBatchId ? 'pointer' : 'not-allowed',
                  background: selectedBatchId ? '#b45309' : '#cbd5e1',
                  color: '#ffffff',
                  marginTop: 6,
                }}
              >
                {selectedBatchId ? '⚠️ Process Disposal / Stock Adjustment' : 'Select a Batch from Catalog'}
              </button>
            </form>
          )}

          {/* Feedback banner */}
          {statusMessage && (
            <div
              style={{
                marginTop: 12,
                padding: '8px 12px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 'bold',
                background: statusMessage.isError ? '#fef2f2' : '#f0fdf4',
                color: statusMessage.isError ? '#dc2626' : '#15803d',
                border: `1px solid ${statusMessage.isError ? '#fecaca' : '#bbf7d0'}`,
              }}
            >
              {statusMessage.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}