import React, { useState, useEffect } from 'react';

export default function InventoryManager() {
  const [activeTab, setActiveTab] = useState<'deduct' | 'receive'>('deduct');

  // Deduction state
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Prescription issuance');
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<any[]>([]);

  // Receive stock state
  const [medicines, setMedicines] = useState<any[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [newBatchNo, setNewBatchNo] = useState('');
  const [mfgDate, setMfgDate] = useState('');
  const [expDate, setExpDate] = useState('');
  const [supplier, setSupplier] = useState('Unilab Philippines');
  const [qtyReceived, setQtyReceived] = useState('100');
  const [receiveReason, setReceiveReason] = useState('New shipment delivery');
  const [receiveStatus, setReceiveStatus] = useState('');

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
      console.error("Failed to fetch catalog:", err);
    }
  };

  const fetchMedicines = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/medicines', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setMedicines(data);
        if (data.length > 0) setSelectedMedicineId(data[0].medicine_id.toString());
      }
    } catch (err) {
      console.error("Failed to fetch medicines:", err);
    }
  };

  useEffect(() => {
    fetchBatches();
    fetchMedicines();
  }, []);

  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Processing deduction...');

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
        setBatchId('');
        setQuantity('1');
      } else {
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to deduct stock'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network Error: ' + err.message);
    }
  };

  const handleReceiveStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setReceiveStatus('Processing stock receipt...');

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('https://localhost:5000/api/inventory/receive', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          medicine_id: Number(selectedMedicineId),
          batch_no: newBatchNo,
          manufacture_date: mfgDate,
          expiry_date: expDate,
          supplier,
          quantity_received: Number(qtyReceived),
          reason: receiveReason,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setReceiveStatus('✅ Success: ' + data.message);
        fetchBatches();
        setNewBatchNo('');
        setMfgDate('');
        setExpDate('');
      } else {
        setReceiveStatus('❌ Error: ' + (data.error || 'Failed to receive stock'));
      }
    } catch (err: any) {
      setReceiveStatus('❌ Network Error: ' + err.message);
    }
  };

  const getExpiryStatus = (expiryDateStr: string) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const [year, month, day] = expiryDateStr.split('-').map(Number);
    const expiryDate = new Date(year, month - 1, day);
    const daysUntil = (expiryDate.getTime() - today.getTime()) / (1000 * 3600 * 24);
    
    if (daysUntil < 0) return { label: 'EXPIRED', color: 'red' };
    if (daysUntil <= 90) return { label: 'EXPIRING SOON', color: '#b45309' };
    return { label: 'GOOD', color: 'green' };
  };

  return (
    <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8, marginTop: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, color: '#0f766e' }}>📦 Live Pharmacy Catalog & Inventory (FEFO)</h3>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setActiveTab('deduct')}
            style={{
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
              background: activeTab === 'deduct' ? '#0f766e' : '#f1f5f9',
              color: activeTab === 'deduct' ? '#fff' : '#334155',
              border: '1px solid #0f766e'
            }}
          >
            ➖ Stock Deduction
          </button>
          <button
            onClick={() => setActiveTab('receive')}
            style={{
              padding: '6px 12px', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold',
              background: activeTab === 'receive' ? '#0f766e' : '#f1f5f9',
              color: activeTab === 'receive' ? '#fff' : '#334155',
              border: '1px solid #0f766e'
            }}
          >
            ➕ Receive New Batch
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '20px' }}>
        {/* LEFT COLUMN: LIVE CATALOG VIEWER */}
        <div style={{ flex: 2, borderRight: '1px solid #eee', paddingRight: '20px' }}>
          <p style={{ fontSize: 13, color: '#666', marginTop: '-5px', marginBottom: '10px' }}>
            Click a row to select it for stock deduction.
          </p>
          
          <div style={{ maxHeight: '280px', overflowY: 'auto' }}>
            <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #ddd' }}>
                  <th style={{ padding: 8 }}>ID</th>
                  <th style={{ padding: 8 }}>Medicine / Batch</th>
                  <th style={{ padding: 8 }}>Stock</th>
                  <th style={{ padding: 8 }}>Expiry Status</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((b) => {
                  const status = getExpiryStatus(b.expiry_date);
                  const isLowStock = b.quantity_on_hand < 20; 
                  const isSelected = batchId === b.batch_id.toString();

                  return (
                    <tr 
                      key={b.batch_id} 
                      onClick={() => { setActiveTab('deduct'); setBatchId(b.batch_id.toString()); }}
                      style={{ 
                        cursor: 'pointer', 
                        borderBottom: '1px solid #eee',
                        background: isSelected ? '#ccfbf1' : 'transparent',
                        transition: 'background 0.2s'
                      }}
                    >
                      <td style={{ padding: 8 }}><b>{b.batch_id}</b></td>
                      <td style={{ padding: 8 }}>
                        <span style={{ fontWeight: 600 }}>{b.name}</span><br/>
                        <small style={{ color: '#666' }}>Batch: {b.batch_no}</small>
                      </td>
                      <td style={{ 
                        padding: 8, 
                        color: isLowStock ? 'red' : 'inherit', 
                        fontWeight: isLowStock ? 'bold' : 'normal' 
                      }}>
                        {b.quantity_on_hand}
                      </td>
                      <td style={{ padding: 8, color: status.color, fontWeight: 'bold' }}>
                        {status.label} <small style={{ fontWeight: 'normal', color: '#555' }}>({b.expiry_date})</small>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* RIGHT COLUMN: ACTION FORMS */}
        <div style={{ flex: 1 }}>
          {activeTab === 'deduct' ? (
            <div>
              <h4 style={{ marginTop: 0, color: '#0f766e' }}>Stock Deduction</h4>
              <form onSubmit={handleDeductStock}>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 13 }}>Selected Batch ID:</label>
                  <input 
                    style={{ width: '100%', padding: 6, marginTop: 2, background: '#f1f5f9', color: '#000', boxSizing: 'border-box' }} 
                    value={batchId} 
                    readOnly
                    placeholder="Click a row from catalog..."
                  />
                </div>
                <div style={{ marginBottom: 10 }}>
                  <label style={{ fontSize: 13 }}>Quantity to Dispense:</label>
                  <input 
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }} 
                    type="number" 
                    min="1"
                    value={quantity} 
                    onChange={(e) => setQuantity(e.target.value)} 
                  />
                </div>
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 13 }}>Reason / Remarks:</label>
                  <input 
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }} 
                    value={reason} 
                    onChange={(e) => setReason(e.target.value)} 
                  />
                </div>
                <button
                  type="submit"
                  disabled={!batchId}
                  style={{ 
                    width: '100%', padding: 10, border: 'none', borderRadius: 4, fontWeight: 'bold',
                    background: batchId ? '#0f766e' : '#ccc', 
                    color: '#fff', 
                    cursor: batchId ? 'pointer' : 'not-allowed' 
                  }}
                >
                  ➖ Deduct Stock
                </button>
              </form>
              {statusMessage && <p style={{ fontSize: 13, marginTop: 10 }}>{statusMessage}</p>}
            </div>
          ) : (
            <div>
              <h4 style={{ marginTop: 0, color: '#0f766e' }}>Receive New Stock Batch</h4>
              <form onSubmit={handleReceiveStock}>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Select Medicine:</label>
                  <select 
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box', background: '#fff' }}
                    value={selectedMedicineId}
                    onChange={(e) => setSelectedMedicineId(e.target.value)}
                  >
                    {medicines.map((m) => (
                      <option key={m.medicine_id} value={m.medicine_id}>
                        {m.name} ({m.strength} - {m.form})
                      </option>
                    ))}
                  </select>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Batch Number:</label>
                  <input 
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }}
                    placeholder="e.g. BATCH-PAR-2026C"
                    value={newBatchNo}
                    onChange={(e) => setNewBatchNo(e.target.value)}
                    required
                  />
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12 }}>Mfg Date:</label>
                    <input 
                      type="date"
                      style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }}
                      value={mfgDate}
                      onChange={(e) => setMfgDate(e.target.value)}
                      required
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ fontSize: 12 }}>Expiry Date:</label>
                    <input 
                      type="date"
                      style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }}
                      value={expDate}
                      onChange={(e) => setExpDate(e.target.value)}
                      required
                    />
                  </div>
                </div>
                <div style={{ marginBottom: 8 }}>
                  <label style={{ fontSize: 12 }}>Quantity Received:</label>
                  <input 
                    type="number"
                    min="1"
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }}
                    value={qtyReceived}
                    onChange={(e) => setQtyReceived(e.target.value)}
                    required
                  />
                </div>
                <div style={{ marginBottom: 12 }}>
                  <label style={{ fontSize: 12 }}>Supplier:</label>
                  <input 
                    style={{ width: '100%', padding: 6, marginTop: 2, boxSizing: 'border-box' }}
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                  />
                </div>
                <button
                  type="submit"
                  style={{ 
                    width: '100%', padding: 10, border: 'none', borderRadius: '4px', fontWeight: 'bold',
                    background: '#0f766e', color: '#fff', cursor: 'pointer' 
                  }}
                >
                  ➕ Record Stock Receipt
                </button>
              </form>
              {receiveStatus && <p style={{ fontSize: 13, marginTop: 10 }}>{receiveStatus}</p>}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}