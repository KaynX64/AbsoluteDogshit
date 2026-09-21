import React, { useEffect, useState } from 'react';

interface AnalyticsData {
  topDiagnoses: { diagnosis: string; count: number }[];
  deptBreakdown: { department: string; consultations_count: number }[];
  fluStats: { cases_past_7_days: number; cases_prev_7_days: number };
  highRiskGroups: {
    hypertension_count: number;
    asthma_count: number;
    diabetes_count: number;
    severe_allergies_count: number;
    total_students_monitored: number;
  };
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
}

export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
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

  const handleDownloadExcelCSV = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch('http://localhost:5000/api/analytics/export/csv', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_Report_${Date.now()}.csv`;
      a.click();
    } catch (err) {
      alert('Report export failed.');
    }
  };

  const handlePrintPDFReport = () => {
    window.print();
  };

  if (loading) return <div style={{ padding: 24, color: '#0f766e', fontWeight: 600 }}>Loading campus health analytics...</div>;
  if (!data) return <div style={{ padding: 24, color: '#dc2626' }}>Failed to load analytics data.</div>;

  const maxDiag = Math.max(...(data.topDiagnoses || []).map(d => d.count), 1);
  const maxDept = Math.max(...(data.deptBreakdown || []).map(d => d.consultations_count), 1);
  const isFluSpike = (data.fluStats?.cases_past_7_days || 0) > (data.fluStats?.cases_prev_7_days || 0);

  return (
    <div style={{ background: '#ffffff', padding: 24, borderRadius: 10, border: '1px solid #cbd5e1', marginTop: 16 }}>
      {/* Header with Export Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f766e', fontSize: 20 }}>📊 Health Analytics & Epidemic Reporting</h3>
          <small style={{ color: '#64748b' }}>Campus-wide illness tracking, seasonal spike surveillance & high-risk group indicators</small>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={fetchAnalytics}
            style={{ padding: '8px 14px', background: '#f8fafc', color: '#334155', border: '1px solid #cbd5e1', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            🔄 Refresh
          </button>
          <button
            onClick={handleDownloadExcelCSV}
            style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            📊 Export for Excel
          </button>
          <button
            onClick={handlePrintPDFReport}
            style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            🖨️ Export to PDF
          </button>
        </div>
      </div>

      {/* Epidemic / Flu Spike Alert Banner */}
      <div style={{
        padding: '12px 16px',
        marginBottom: 20,
        borderRadius: 8,
        background: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#fef2f2' : '#f0fdf4',
        border: `1px solid ${isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#fecaca' : '#bbf7d0'}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div>
          <strong style={{ color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#b91c1c' : '#15803d' }}>
            {isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '⚠️ Seasonal Flu / URTI Spike Detected' : '✅ Seasonal Illness Trends Stable'}
          </strong>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#475569' }}>
            Active acute respiratory & flu-like cases logged this week: <strong>{data.fluStats?.cases_past_7_days || 0}</strong> (Previous 7 days: {data.fluStats?.cases_prev_7_days || 0}).
          </p>
        </div>
        <span style={{ fontSize: 12, padding: '4px 8px', borderRadius: 4, background: '#fff', fontWeight: 600, color: '#475569' }}>
          Epidemic Surveillance
        </span>
      </div>

      {/* 4-Grid Breakdown for Features */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* 1. Common Illnesses (Top Diagnoses) */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>📈 Top 5 Common Diagnoses</h4>
          {(!data.topDiagnoses || data.topDiagnoses.length === 0) ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>No clinic consultations logged yet.</p>
          ) : (
            data.topDiagnoses.map((d, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span>{d.diagnosis}</span>
                  <span>{d.count} cases</span>
                </div>
                <div style={{ width: '100%', background: '#e2e8f0', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(d.count / maxDiag) * 100}%`, background: '#0f766e', height: '100%' }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 2. Consultation Volume per Department */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>🏫 Consultation Volume per Department</h4>
          {(!data.deptBreakdown || data.deptBreakdown.length === 0) ? (
            <p style={{ fontSize: 13, color: '#64748b' }}>No department patient records logged yet.</p>
          ) : (
            data.deptBreakdown.map((dept, idx) => (
              <div key={idx} style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>
                  <span>{dept.department}</span>
                  <span>{dept.consultations_count} visits</span>
                </div>
                <div style={{ width: '100%', background: '#e2e8f0', height: 10, borderRadius: 5, overflow: 'hidden' }}>
                  <div style={{ width: `${(dept.consultations_count / maxDept) * 100}%`, background: '#0284c7', height: '100%' }} />
                </div>
              </div>
            ))
          )}
        </div>

        {/* 3. High-Risk Student Groups Monitoring */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>🛡️ High-Risk Student Groups Watchlist</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Asthma / Respiratory</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#0369a1' }}>{data.highRiskGroups?.asthma_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Hypertension / Cardiac</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#b91c1c' }}>{data.highRiskGroups?.hypertension_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Severe Allergies</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#d97706' }}>{data.highRiskGroups?.severe_allergies_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 12, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 12, color: '#64748b' }}>Diabetes / Endocrine</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#7c3aed' }}>{data.highRiskGroups?.diabetes_count || 0}</div>
            </div>
          </div>
        </div>

        {/* 4. Critical Inventory & Supply Allocation */}
        <div style={{ padding: 16, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1e293b' }}>💊 Supply Allocation & Low Stock Alert</h4>
          {(!data.lowStockMeds || data.lowStockMeds.length === 0) ? (
            <p style={{ fontSize: 13, color: '#16a34a' }}>All clinic supplies have sufficient buffer stock.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ paddingBottom: 6 }}>Medicine</th>
                  <th style={{ paddingBottom: 6 }}>Batch</th>
                  <th style={{ paddingBottom: 6 }}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockMeds.slice(0, 4).map((med, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{med.name}</td>
                    <td style={{ color: '#64748b' }}>{med.batch_no || 'Standard'}</td>
                    <td style={{ color: '#dc2626', fontWeight: 600 }}>{med.quantity_on_hand} left</td>
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