import React, { useState, useEffect } from 'react';

export default function InventoryManager() {
  const [batchId, setBatchId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('Prescription issuance');
  const [statusMessage, setStatusMessage] = useState('');
  const [batches, setBatches] = useState<any[]>([]);

  // Fetch live catalog data on load and after deductions
  const fetchBatches = async () => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/inventory/batches', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setBatches(await res.json());
      }
    } catch (err) {
      console.error("Failed to fetch catalog:", err);
    }
  };

  useEffect(() => {
    fetchBatches();
  }, []);

  const handleDeductStock = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMessage('Processing deduction...');

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/inventory/deduct', {
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
        fetchBatches(); // Refresh stock immediately after deduction
        setBatchId(''); // Clear selection
        setQuantity('1');
      } else {
        setStatusMessage('❌ Error: ' + (data.error || 'Failed to deduct stock'));
      }
    } catch (err: any) {
      setStatusMessage('❌ Network Error: ' + err.message);
    }
  };

  // Helper to dynamically color-code FEFO status
  const getExpiryStatus = (expiryDate: string) => {
    const daysUntil = (new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 3600 * 24);
    if (daysUntil < 0) return { label: 'EXPIRED', color: 'red' };
    if (daysUntil <= 90) return { label: 'EXPIRING SOON', color: '#b45309' }; // dark orange
    return { label: 'GOOD', color: 'green' };
  };

  return (
    <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8, marginTop: 24, display: 'flex', gap: '20px' }}>
      
      {/* LEFT COLUMN: LIVE CATALOG VIEWER */}
      <div style={{ flex: 2, borderRight: '1px solid #eee', paddingRight: '20px' }}>
        <h3 style={{ marginTop: 0, color: '#0f766e' }}>📦 Live Pharmacy Catalog (FEFO)</h3>
        <p style={{ fontSize: 13, color: '#666', marginTop: '-10px', marginBottom: '10px' }}>
          Click a row to select it for deduction.
        </p>
        
        <div style={{ maxHeight: '250px', overflowY: 'auto' }}>
          <table style={{ width: '100%', textAlign: 'left', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #ddd' }}>
                <th style={{ padding: 8 }}>ID</th>
                <th style={{ padding: 8 }}>Medicine / Batch</th>
                <th style={{ padding: 8 }}>Stock</th>
                <th style={{ padding: 8 }}>Status</th>
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
                    onClick={() => setBatchId(b.batch_id.toString())}
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
                      <small style={{ color: '#666' }}>{b.batch_no}</small>
                    </td>
                    <td style={{ 
                      padding: 8, 
                      color: isLowStock ? 'red' : 'inherit', 
                      fontWeight: isLowStock ? 'bold' : 'normal' 
                    }}>
                      {b.quantity_on_hand}
                    </td>
                    <td style={{ padding: 8, color: status.color, fontWeight: 'bold' }}>
                      {status.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* RIGHT COLUMN: DEDUCTION FORM */}
      <div style={{ flex: 1 }}>
        <h3 style={{ marginTop: 0, color: '#0f766e' }}>Stock Deduction</h3>
        <form onSubmit={handleDeductStock}>
          <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 13 }}>Selected Batch ID:</label>
              <input 
               style={{ width: '100%', padding: 6, marginTop: 2, background: '#f1f5f9', color: '#000' }} 
               value={batchId} 
                readOnly
              placeholder="Select from catalog..."
               />
          </div>
          <div style={{ marginBottom: 10 }}>
            <label style={{ fontSize: 13 }}>Quantity to Dispense:</label>
            <input 
              style={{ width: '100%', padding: 6, marginTop: 2 }} 
              type="number" 
              min="1"
              value={quantity} 
              onChange={(e) => setQuantity(e.target.value)} 
            />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 13 }}>Reason / Remarks:</label>
            <input 
              style={{ width: '100%', padding: 6, marginTop: 2 }} 
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

    </section>
  );
}