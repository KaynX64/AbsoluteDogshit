// desktop/src/components/AnalyticsDashboard.tsx
import React, { useEffect, useState } from 'react';

interface TimePoint {
  date: string;
  label: string;
  count: number;
}

interface DiagnosisItem {
  diagnosis: string;
  count: number;
}

interface DeptItem {
  department: string;
  consultations_count: number;
}

interface AnalyticsData {
  totalConsultations: number;
  emergencyMetrics: { active: number; avgResponseSeconds: number };
  timeSeries: TimePoint[];
  topDiagnoses: DiagnosisItem[];
  deptBreakdown: DeptItem[];
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

// =========================================================
// 1. FULL-WIDTH SVG LINE CHART (Consultation Trajectory)
// =========================================================
function SvgLineChart({ data }: { data: TimePoint[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 180, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No timeline data recorded yet.
      </div>
    );
  }

  const width = 900;
  const height = 220;
  const paddingX = 50;
  const paddingTop = 36;
  const paddingBottom = 32;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxVal = Math.ceil(maxCount * 1.35); // 35% headroom so highest point never touches top edge
  const chartW = width - paddingX * 2;
  const chartH = height - paddingTop - paddingBottom;

  const points = data.map((d, idx) => {
    const x = paddingX + (idx / (data.length - 1)) * chartW;
    const y = paddingTop + (1 - d.count / maxVal) * chartH;
    return { x, y, ...d };
  });

  const pathD = points.reduce((acc, p, idx) => `${acc} ${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`, '');
  const areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingBottom} L ${points[0].x} ${height - paddingBottom} Z`;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', maxHeight: 240, overflow: 'visible' }}>
      <defs>
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#0f766e" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#0f766e" stopOpacity="0.0" />
        </linearGradient>
      </defs>

      {/* Subtle Horizontal Guidelines */}
      {[0, 0.5, 1].map((ratio, i) => {
        const y = paddingTop + (1 - ratio) * chartH;
        const val = Math.round(ratio * maxVal);
        return (
          <g key={i}>
            <line x1={paddingX} y1={y} x2={width - paddingX} y2={y} stroke="#e2e8f0" strokeDasharray="4 4" />
            <text x={paddingX - 12} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
              {val}
            </text>
          </g>
        );
      })}

      {/* Shaded Area & Trajectory Line */}
      <path d={areaD} fill="url(#lineGrad)" />
      <path d={pathD} fill="none" stroke="#0f766e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />

      {/* Nodes and Labels */}
      {points.map((p, i) => (
        <g key={i}>
          <circle cx={p.x} cy={p.y} r="5" fill="#ffffff" stroke="#0f766e" strokeWidth="2.5" />
          {p.count > 0 && (
            <text x={p.x} y={p.y - 9} textAnchor="middle" fontSize="11" fontWeight="bold" fill="#0f766e">
              {p.count}
            </text>
          )}
          <text x={p.x} y={height - 8} textAnchor="middle" fontSize="10" fill="#64748b">
            {i % 2 === 0 ? p.label : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

// =========================================================
// 2. FULL-WIDTH VERTICAL BAR CHART (Top Diagnoses)
// =========================================================
function SvgVerticalBarChart({ data }: { data: DiagnosisItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No diagnoses recorded yet.
      </div>
    );
  }

  const width = 900;
  const height = 250;
  // Left padding is wide (90px) so rotated text for bar #1 is never clipped by the edge
  const padLeft = 95;
  const padRight = 45;
  const padTop = 35;
  const padBottom = 75; // Plenty of headroom for rotated labels

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxVal = Math.ceil(maxCount * 1.3);
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const colSlot = chartW / data.length;
  const barWidth = Math.min(colSlot * 0.45, 60);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minHeight: 220, overflow: 'visible' }}>
      {/* Grid Lines */}
      {[0, 0.5, 1].map((ratio, i) => {
        const y = padTop + chartH * (1 - ratio);
        const val = Math.round(ratio * maxVal);
        return (
          <g key={i}>
            <line x1={padLeft} y1={y} x2={width - padRight} y2={y} stroke="#e2e8f0" strokeDasharray="3 3" />
            <text x={padLeft - 10} y={y + 4} textAnchor="end" fontSize="11" fill="#94a3b8">
              {val}
            </text>
          </g>
        );
      })}

      {/* Base axis */}
      <line x1={padLeft} y1={height - padBottom} x2={width - padRight} y2={height - padBottom} stroke="#cbd5e1" strokeWidth="1.5" />

      {data.map((item, idx) => {
        const x = padLeft + idx * colSlot + (colSlot - barWidth) / 2;
        const bHeight = Math.max((item.count / maxVal) * chartH, 14);
        const y = height - padBottom - bHeight;

        return (
          <g key={idx}>
            {/* Blue Rounded Bar */}
            <rect x={x} y={y} width={barWidth} height={bHeight} rx="6" fill="#0284c7" />

            {/* Value on Top */}
            <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fontSize="12" fontWeight="bold" fill="#0369a1">
              {item.count}
            </text>

            {/* Rotated Diagnosis Label - Now has plenty of left margin */}
            <text
              x={x + barWidth / 2}
              y={height - padBottom + 16}
              transform={`rotate(-20, ${x + barWidth / 2}, ${height - padBottom + 16})`}
              textAnchor="end"
              fontSize="11.5"
              fontWeight="600"
              fill="#334155"
            >
              {item.diagnosis.length > 25 ? `${item.diagnosis.substring(0, 23)}…` : item.diagnosis}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =========================================================
// 3. FULL-WIDTH HORIZONTAL BAR CHART (Visits by Department)
// =========================================================
function SvgHorizontalBarChart({ data }: { data: DeptItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div style={{ height: 120, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8' }}>
        No department consultation data recorded yet.
      </div>
    );
  }

  // Adaptive Height: Scales cleanly with number of rows so 1 item looks neat, not empty
  const rowHeight = 44;
  const padY = 20;
  const height = Math.max(data.length * rowHeight + padY * 2, 110);
  const width = 900;
  const padLeft = 240; // Room for full "BS Information Technology" with zero clipping
  const padRight = 60;
  const maxCount = Math.max(...data.map((d) => d.consultations_count), 1);
  const maxVal = Math.ceil(maxCount * 1.2);
  const chartW = width - padLeft - padRight;
  const barThickness = 22;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minHeight: 110 }}>
      {data.map((d, idx) => {
        const y =
          padY +
          idx * ((height - padY * 2) / data.length) +
          ((height - padY * 2) / data.length - barThickness) / 2;
        const bWidth = Math.max((d.consultations_count / maxVal) * chartW, 20);

        return (
          <g key={idx}>
            {/* Full Department / Course Name */}
            <text x={padLeft - 14} y={y + 15} textAnchor="end" fontSize="12" fontWeight="600" fill="#334155">
              {d.department}
            </text>
            {/* Background Track */}
            <rect x={padLeft} y={y} width={chartW} height={barThickness} rx="5" fill="#f1f5f9" />
            {/* Progress Bar Fill */}
            <rect x={padLeft} y={y} width={bWidth} height={barThickness} rx="5" fill="#0f766e" />
            {/* Count Tag */}
            <text x={padLeft + bWidth + 10} y={y + 16} fontSize="12" fontWeight="bold" fill="#0f766e">
              {d.consultations_count} visits
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// =========================================================
// 4. MAIN ANALYTICS DASHBOARD
// =========================================================
export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch('https://localhost:5000/api/analytics/summary', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load analytics:', err);
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
      const res = await fetch('https://localhost:5000/api/analytics/export/csv', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_Report_${Date.now()}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert('Report export failed: ' + err.message);
    }
  };

  const handlePrintPDFReport = () => {
    window.print();
  };

  if (loading) {
    return <div style={{ padding: 30, color: '#0f766e', fontWeight: 'bold' }}>Loading campus epidemiological analytics...</div>;
  }

  if (!data) {
    return <div style={{ padding: 30, color: '#dc2626' }}>Failed to load analytics data. Ensure server is running.</div>;
  }

  const isFluSpike = (data.fluStats?.cases_past_7_days || 0) > (data.fluStats?.cases_prev_7_days || 0);

  return (
    <div
      id="analytics-report-area"
      style={{
        width: '100%',
        boxSizing: 'border-box',
        background: '#ffffff',
        padding: 'clamp(14px, 2vw, 24px)',
        borderRadius: 10,
        border: '1px solid #cbd5e1',
        marginTop: 16,
      }}
    >
      {/* Printable Report Styles */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #analytics-report-area, #analytics-report-area * {
            visibility: visible;
          }
          #analytics-report-area {
            position: absolute;
            left: 0;
            top: 0;
            width: 100% !important;
            padding: 0 !important;
            border: none !important;
          }
          .no-print {
            display: none !important;
          }
          .print-header {
            display: block !important;
          }
        }
      `}</style>

      {/* Official PSU Print Header (Only visible on PDF Export) */}
      <div className="print-header" style={{ display: 'none', borderBottom: '2px solid #0f766e', paddingBottom: 10, marginBottom: 20, textAlign: 'center' }}>
        <h2 style={{ margin: 0, color: '#0f766e', fontSize: 18 }}>PANGASINAN STATE UNIVERSITY - LINGAYEN CAMPUS</h2>
        <p style={{ margin: '2px 0 0', fontSize: 12, color: '#475569' }}>Campus Health Services & Infirmary Epidemiological Report • R.A. 10173 Compliant</p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>Generated On: {new Date().toLocaleString()}</p>
      </div>

      {/* Screen Toolbar */}
      <div className="no-print" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h3 style={{ margin: 0, color: '#0f766e', fontSize: 20 }}>📊 Health Analytics & Epidemic Reporting</h3>
          <small style={{ color: '#64748b' }}>Campus illness monitoring, 14-day consultation trajectories & departmental surveillance</small>
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
            📊 Export for Excel (.CSV)
          </button>
          <button
            onClick={handlePrintPDFReport}
            style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 600 }}
          >
            🖨️ Export to PDF
          </button>
        </div>
      </div>

      {/* Epidemic Surveillance Banner */}
      <div
        style={{
          padding: '12px 16px',
          marginBottom: 20,
          borderRadius: 8,
          background: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#fef2f2' : '#f0fdf4',
          border: `1px solid ${isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#fecaca' : '#bbf7d0'}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div>
          <strong style={{ color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '#b91c1c' : '#15803d' }}>
            {isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0 ? '⚠️ Seasonal Illness / Flu Spike Alert' : '✅ Seasonal Illness Trends Stable'}
          </strong>
          <p style={{ margin: '4px 0 0 0', fontSize: 12, color: '#475569' }}>
            Acute respiratory & flu-like visits logged past 7 days: <strong>{data.fluStats?.cases_past_7_days || 0}</strong> (Previous 7 days: {data.fluStats?.cases_prev_7_days || 0}).
          </p>
        </div>
        <span style={{ fontSize: 11, padding: '4px 8px', borderRadius: 4, background: '#fff', fontWeight: 600, color: '#475569', border: '1px solid #e2e8f0' }}>
          Epidemic Surveillance
        </span>
      </div>

      {/* ========================================================= */}
      {/* 1. FULL-WIDTH CARD: 14-DAY TIMELINE (LINE GRAPH)          */}
      {/* ========================================================= */}
      <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
          <div>
            <h4 style={{ margin: 0, color: '#0f766e', fontSize: 15 }}>📈 14-Day Consultation Volume Trajectory (Line Graph)</h4>
            <small style={{ color: '#64748b' }}>Daily patient consultations across all campus infirmaries</small>
          </div>
          <span style={{ fontSize: 12, fontWeight: 'bold', color: '#0f766e', background: '#f0fdfa', padding: '4px 8px', borderRadius: 4 }}>
            Total Consultations: {data.totalConsultations}
          </span>
        </div>
        <SvgLineChart data={data.timeSeries || []} />
      </div>

      {/* ========================================================= */}
      {/* 2. FULL-WIDTH CARD: TOP DIAGNOSES (VERTICAL BAR GRAPH)    */}
      {/* ========================================================= */}
      <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div>
            <h4 style={{ margin: 0, color: '#0284c7', fontSize: 15 }}>📊 Top Clinical Diagnoses (Vertical Bar Graph)</h4>
            <small style={{ color: '#64748b' }}>Primary medical diagnoses logged across student and employee encounters</small>
          </div>
        </div>
        <SvgVerticalBarChart data={data.topDiagnoses || []} />
      </div>

      {/* ========================================================= */}
      {/* 3. FULL-WIDTH CARD: DEPT VISITS (HORIZONTAL BAR GRAPH)    */}
      {/* ========================================================= */}
      <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#ffffff', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div>
            <h4 style={{ margin: 0, color: '#0f766e', fontSize: 15 }}>🏫 Visits by Academic Program & Department (Horizontal Bar Graph)</h4>
            <small style={{ color: '#64748b' }}>Consultation volume aggregated per academic degree program or employee unit</small>
          </div>
        </div>
        <SvgHorizontalBarChart data={data.deptBreakdown || []} />
      </div>

      {/* ========================================================= */}
      {/* 4. 2-COLUMN GRID: WATCHLIST & CRITICAL INVENTORY          */}
      {/* ========================================================= */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 20 }}>
        {/* High Risk Watchlist */}
        <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 12px 0', color: '#1e293b', fontSize: 14 }}>🛡️ High-Risk Student Surveillance Watchlist</h4>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Asthma / Respiratory</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#0369a1' }}>{data.highRiskGroups?.asthma_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Hypertension / Cardiac</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#b91c1c' }}>{data.highRiskGroups?.hypertension_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Severe Allergies</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#d97706' }}>{data.highRiskGroups?.severe_allergies_count || 0}</div>
            </div>
            <div style={{ background: '#fff', padding: 10, borderRadius: 6, border: '1px solid #e2e8f0' }}>
              <div style={{ fontSize: 11, color: '#64748b' }}>Diabetes / Endocrine</div>
              <div style={{ fontSize: 20, fontWeight: 'bold', color: '#7c3aed' }}>{data.highRiskGroups?.diabetes_count || 0}</div>
            </div>
          </div>
        </div>

        {/* Low Stock & Expiry Sweeps */}
        <div style={{ padding: 18, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc' }}>
          <h4 style={{ margin: '0 0 8px 0', color: '#1e293b', fontSize: 14 }}>💊 Critical Pharmacy Inventory & Buffer Stock</h4>
          {!data.lowStockMeds || data.lowStockMeds.length === 0 ? (
            <p style={{ fontSize: 12, color: '#16a34a' }}>All clinic supplies have adequate stock buffers.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #cbd5e1', textAlign: 'left', color: '#64748b' }}>
                  <th style={{ paddingBottom: 6 }}>Medicine</th>
                  <th style={{ paddingBottom: 6 }}>Batch</th>
                  <th style={{ paddingBottom: 6 }}>Stock</th>
                  <th style={{ paddingBottom: 6 }}>Expires</th>
                </tr>
              </thead>
              <tbody>
                {data.lowStockMeds.slice(0, 4).map((med, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #f1f5f9' }}>
                    <td style={{ padding: '6px 0', fontWeight: 600 }}>{med.name}</td>
                    <td style={{ color: '#64748b' }}>{med.batch_no || 'Standard'}</td>
                    <td style={{ color: med.quantity_on_hand < 15 ? '#dc2626' : '#0f766e', fontWeight: 600 }}>
                      {med.quantity_on_hand} left
                    </td>
                    <td style={{ color: med.days_until_expiry < 90 ? '#b91c1c' : '#64748b', fontSize: 11 }}>
                      {med.expiry_date}
                    </td>
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