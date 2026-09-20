import React, { useEffect, useState } from 'react';

interface AnalyticsData {
  consultations: { status: string; count: number }[];
  topDiagnoses: { diagnosis: string; count: number }[];
  emergencies: { status: string; count: number }[];
  lowStockMeds: {
    batch_id: number;
    name: string;
    generic_name: string;
    batch_no: string;
    quantity_on_hand: number;
    reorder_level: number;
    expiry_date: string;
    days_until_expiry: number;
  }[];
  totalEncounters?: number;
  averageResponseTimeSeconds?: number;
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    // FIX: valetudo_token ang tamang key sa localStorage!
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:5000/api/analytics/summary', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load analytics', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const handleDownloadCSV = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:5000/api/analytics/export/csv', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Report_${Date.now()}.csv`;
      a.click();
    } catch (err) {
      alert('CSV export failed.');
    }
  };

  const handlePrintPDFReport = () => {
    window.print();
  };

  if (loading) return <div style={{ padding: 20 }}>Loading campus health analytics...</div>;
  if (!data) return <div style={{ padding: 20, color: '#dc2626' }}>Failed to load analytics data.</div>;

  const maxDiagCount = Math.max(...(data.topDiagnoses || []).map(d => d.count), 1);

  return (
    <div style={{ background: '#ffffff', padding: 20, borderRadius: 8, border: '1px solid #cbd5e1', marginTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f766e' }}>📊 Campus Health Analytics & Epidemic Reporting</h3>
          <small style={{ color: '#64748b' }}>Real-time consultation aggregation & FEFO inventory health metrics</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchAnalytics}
            style={{ padding: '8px 12px', background: '#f1f5f9', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleDownloadCSV}
            style={{ padding: '8px 14px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
          >
            📥 Export CSV
          </button>
          <button
            onClick={handlePrintPDFReport}
            style={{ padding: '8px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', fontWeight: 'bold' }}
          >
            🖨️ Print PDF Summary
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Top Diagnoses Chart */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#334155' }}>📈 Top 5 Diagnosed Conditions</h4>
          {(!data.topDiagnoses || data.topDiagnoses.length === 0) ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>No EMR diagnoses logged yet.</p>
          ) : (
            data.topDiagnoses.map((item, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 'bold', marginBottom: 2 }}>
                  <span>{item.diagnosis}</span>
                  <span>{item.count} cases</span>
                </div>
                <div style={{ width: '100%', background: '#e2e8f0', height: 12, borderRadius: 6, overflow: 'hidden' }}>
                  <div
                    style={{
                      width: `${(item.count / maxDiagCount) * 100}%`,
                      background: '#0f766e',
                      height: '100%'
                    }}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Low Stock Medicine Watchlist */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 6, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#b91c1c' }}>⚠️ Critical Medicine Reorder Watchlist</h4>
          {(!data.lowStockMeds || data.lowStockMeds.length === 0) ? (
            <p style={{ fontSize: 13, color: '#16a34a' }}>All inventory stock levels are optimal.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', color: '#64748b', textAlign: 'left' }}>
                  <th style={{ padding: '6px 0' }}>Item Name</th>
                  <th>Batch</th>
                  <th>Remaining</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockMeds.map((med, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0', fontWeight: 'bold' }}>{med.name}</td>
                    <td style={{ color: '#64748b', fontSize: 12 }}>{med.batch_no || med.generic_name}</td>
                    <td style={{ color: '#dc2626', fontWeight: 'bold' }}>{med.quantity_on_hand} units</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}