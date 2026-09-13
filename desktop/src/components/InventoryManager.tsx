import React, { useState } from 'react';

export default function InventoryManager() {
  const [batchId, setBatchId] = useState('1'); // Default to Biogesic batch
  const [quantity, setQuantity] = useState('2');
  const [reason, setReason] = useState('Prescription issuance');
  const [statusMessage, setStatusMessage] = useState('');

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
        setStatusMessage('Success: ' + data.message);
      } else {
        setStatusMessage('Error: ' + (data.error || 'Failed to deduct stock'));
      }
    } catch (err: any) {
      setStatusMessage('Network Error: ' + err.message);
    }
  };

  return (
    <section style={{ padding: 16, border: '1px solid #ccc', borderRadius: 8, marginTop: 24 }}>
      <h3 style={{ marginTop: 0, color: '#0f766e' }}>3. Medicine Inventory & Stock Deduction (Feature 9)</h3>
      <form onSubmit={handleDeductStock}>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13 }}>Batch ID (1: Biogesic, 2: Neozep, 3: Ventolin):</label>
          <input 
            style={{ width: '100%', padding: 6, marginTop: 2 }} 
            value={batchId} 
            onChange={(e) => setBatchId(e.target.value)} 
          />
        </div>
        <div style={{ marginBottom: 10 }}>
          <label style={{ fontSize: 13 }}>Quantity to Deduct:</label>
          <input 
            style={{ width: '100%', padding: 6, marginTop: 2 }} 
            type="number" 
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
          style={{ width: '100%', padding: 10, background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
        >
          📦 Deduct Batch Stock
        </button>
      </form>
      {statusMessage && <p style={{ fontSize: 13, marginTop: 10 }}><b>Status:</b> {statusMessage}</p>}
    </section>
  );
}