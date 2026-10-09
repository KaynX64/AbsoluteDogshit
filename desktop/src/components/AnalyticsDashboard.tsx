// desktop/src/components/AnalyticsDashboard.tsx
import { useEffect, useState } from 'react';
import { btnGhost, btnPrimary } from '../theme';
import { API_BASE_URL } from '../config/api';

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

interface RoleItem {
  role_code: string;
  role_name: string;
  count: number;
}

interface AnalyticsData {
  totalConsultations: number;
  totalStudents: number;
  emergencyMetrics: { active: number; avgResponseSeconds: number };
  roleDistribution: RoleItem[];
  timeSeries: TimePoint[];
  emergencyTimeSeries: TimePoint[];
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

/* ================================================================= */
/* Material You · smooth cubic-bezier path builder                    */
/* ================================================================= */
function buildSmoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;

  let d = `M ${points[0].x} ${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const dx = (p1.x - p0.x) * 0.4;
    const cx1 = p0.x + dx;
    const cx2 = p1.x - dx;
    d += ` C ${cx1} ${p0.y}, ${cx2} ${p1.y}, ${p1.x} ${p1.y}`;
  }
  return d;
}

/* ================================================================= */
/* SVG LINE CHART — Material You                                      */
/* ================================================================= */
function SvgLineChart({
  data,
  themeColor = '#2E5C43',
  themeColorLight = '#7BAA87',
  gradId = 'lineGrad',
  emptyMessage = 'No data recorded yet.',
}: {
  data: TimePoint[];
  themeColor?: string;
  themeColorLight?: string;
  gradId?: string;
  emptyMessage?: string;
}) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 220,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          background: '#F5F8F3',
          borderRadius: 20,
        }}
      >
        {emptyMessage}
      </div>
    );
  }

  const width = 900;
  const height = 240;
  const padX = 56;
  const padTop = 40;
  const padBottom = 44;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxVal = Math.max(Math.ceil(maxCount * 1.5), 2);
  const chartW = width - padX * 2;
  const chartH = height - padTop - padBottom;

  const points = data.map((d, idx) => ({
    x: padX + (idx / Math.max(data.length - 1, 1)) * chartW,
    y: padTop + (1 - d.count / maxVal) * chartH,
    ...d,
  }));

  const smoothPath = buildSmoothPath(points);
  const areaPath = `${smoothPath} L ${points[points.length - 1].x} ${height - padBottom} L ${points[0].x} ${height - padBottom} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', maxHeight: 260, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={themeColor} stopOpacity="0.24" />
          <stop offset="100%" stopColor={themeColor} stopOpacity="0" />
        </linearGradient>
        <linearGradient id={`${gradId}Stroke`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={themeColorLight} />
          <stop offset="100%" stopColor={themeColor} />
        </linearGradient>
      </defs>

      {/* Soft horizontal guides */}
      {[0, 0.5, 1].map((ratio, i) => {
        const y = padTop + (1 - ratio) * chartH;
        const val = Math.round(ratio * maxVal);
        return (
          <g key={i}>
            <line
              x1={padX}
              y1={y}
              x2={width - padX}
              y2={y}
              stroke="#E8EDE6"
              strokeWidth="1"
              strokeDasharray="2 6"
              strokeLinecap="round"
            />
            <text
              x={padX - 14}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill="#9AA79B"
            >
              {val}
            </text>
          </g>
        );
      })}

      {/* Gradient area fill */}
      <path d={areaPath} fill={`url(#${gradId})`} />

      {/* Smooth gradient stroke */}
      <path
        className="my-line-path"
        d={smoothPath}
        fill="none"
        stroke={`url(#${gradId}Stroke)`}
        strokeWidth="3.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {/* Data points */}
      {points.map((p, i) => (
        <g key={i}>
          {p.count > 0 && (
            <>
              <circle
                cx={p.x}
                cy={p.y}
                r="9"
                fill={themeColor}
                fillOpacity="0.14"
              />
              <circle
                cx={p.x}
                cy={p.y}
                r="5.5"
                fill="#FFFFFF"
                stroke={themeColor}
                strokeWidth="2.5"
              />
            </>
          )}
          {p.count === 0 && (
            <circle
              cx={p.x}
              cy={p.y}
              r="3.5"
              fill="#FFFFFF"
              stroke="#C9D9C7"
              strokeWidth="2"
            />
          )}
          {p.count > 0 && (
            <text
              x={p.x}
              y={p.y - 14}
              textAnchor="middle"
              fontSize="11.5"
              fontWeight="700"
              fill={themeColor}
            >
              {p.count}
            </text>
          )}
          <text
            x={p.x}
            y={height - 14}
            textAnchor="middle"
            fontSize="10.5"
            fontWeight="600"
            fill="#9AA79B"
          >
            {i % 2 === 0 ? p.label : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ================================================================= */
/* VERTICAL BAR CHART — Material You                                  */
/* ================================================================= */
function SvgVerticalBarChart({ data }: { data: DiagnosisItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 220,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          background: '#F5F8F3',
          borderRadius: 20,
        }}
      >
        No diagnoses recorded yet.
      </div>
    );
  }

  const width = 900;
  const height = 300;
  const padLeft = 56;
  const padRight = 40;
  const padTop = 50;
  const padBottom = 90;

  const maxCount = Math.max(...data.map((d) => d.count), 1);
  const maxVal = Math.max(Math.ceil(maxCount * 1.4), 2);
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const colSlot = chartW / data.length;
  const barWidth = Math.min(colSlot * 0.42, 72);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', minHeight: 240, overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="barVertGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4A7A5E" />
          <stop offset="100%" stopColor="#1F4A34" />
        </linearGradient>
      </defs>

      {/* Guides */}
      {[0, 0.5, 1].map((ratio, i) => {
        const y = padTop + chartH * (1 - ratio);
        const val = Math.round(ratio * maxVal);
        return (
          <g key={i}>
            <line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke="#E8EDE6"
              strokeWidth="1"
              strokeDasharray="2 6"
              strokeLinecap="round"
            />
            <text
              x={padLeft - 14}
              y={y + 4}
              textAnchor="end"
              fontSize="11"
              fontWeight="600"
              fill="#9AA79B"
            >
              {val}
            </text>
          </g>
        );
      })}

      {data.map((item, idx) => {
        const x = padLeft + idx * colSlot + (colSlot - barWidth) / 2;
        const bHeight = Math.max((item.count / maxVal) * chartH, 20);
        const y = height - padBottom - bHeight;

        return (
          <g key={idx}>
            <rect
              className="my-bar-rect"
              x={x}
              y={y}
              width={barWidth}
              height={bHeight}
              rx="16"
              fill="url(#barVertGrad)"
              style={{ animationDelay: `${idx * 80}ms` }}
            />
            <g transform={`translate(${x + barWidth / 2}, ${y - 14})`}>
              <rect
                x="-16"
                y="-14"
                width="32"
                height="22"
                rx="11"
                fill="#D7E8D2"
              />
              <text
                x="0"
                y="3"
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill="#264D36"
              >
                {item.count}
              </text>
            </g>
            <text
              x={x + barWidth / 2}
              y={height - padBottom + 22}
              transform={`rotate(-22, ${x + barWidth / 2}, ${height - padBottom + 22})`}
              textAnchor="end"
              fontSize="11.5"
              fontWeight="600"
              fill="#5A635B"
            >
              {item.diagnosis.length > 26
                ? `${item.diagnosis.substring(0, 24)}…`
                : item.diagnosis}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================= */
/* HORIZONTAL BAR CHART — Material You                                */
/* ================================================================= */
function SvgHorizontalBarChart({ data }: { data: DeptItem[] }) {
  if (!data || data.length === 0) {
    return (
      <div
        style={{
          height: 130,
          display: 'grid',
          placeItems: 'center',
          color: 'var(--text-muted)',
          fontSize: 13,
          background: '#F5F8F3',
          borderRadius: 20,
        }}
      >
        No department consultation data recorded yet.
      </div>
    );
  }

  const rowHeight = 56;
  const padY = 20;
  const height = Math.max(data.length * rowHeight + padY * 2, 130);
  const width = 900;
  const padLeft = 240;
  const padRight = 80;
  const maxCount = Math.max(...data.map((d) => d.consultations_count), 1);
  const maxVal = Math.max(Math.ceil(maxCount * 1.15), 2);
  const chartW = width - padLeft - padRight;
  const barThickness = 26;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      style={{ width: '100%', height: 'auto', minHeight: 130 }}
    >
      <defs>
        <linearGradient id="barHorizGrad" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#2E5C43" />
          <stop offset="100%" stopColor="#4A7A5E" />
        </linearGradient>
      </defs>

      {data.map((d, idx) => {
        const rowSlot = (height - padY * 2) / data.length;
        const y = padY + idx * rowSlot + (rowSlot - barThickness) / 2;
        const bWidth = Math.max((d.consultations_count / maxVal) * chartW, 28);

        return (
          <g key={idx}>
            <text
              x={padLeft - 18}
              y={y + 18}
              textAnchor="end"
              fontSize="12.5"
              fontWeight="600"
              fill="#334155"
            >
              {d.department}
            </text>

            {/* Pill track */}
            <rect
              x={padLeft}
              y={y}
              width={chartW}
              height={barThickness}
              rx={barThickness / 2}
              fill="#EEF3EC"
            />

            {/* Pill fill */}
            <rect
              className="my-hbar-rect"
              x={padLeft}
              y={y}
              width={bWidth}
              height={barThickness}
              rx={barThickness / 2}
              fill="url(#barHorizGrad)"
              style={{ animationDelay: `${idx * 100}ms` }}
            />

            {/* Value pill at end */}
            <g transform={`translate(${padLeft + bWidth + 14}, ${y})`}>
              <rect
                x="0"
                y="0"
                width="66"
                height={barThickness}
                rx={barThickness / 2}
                fill="#D7E8D2"
              />
              <text
                x="33"
                y="17.5"
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill="#264D36"
              >
                {d.consultations_count} {d.consultations_count === 1 ? 'visit' : 'visits'}
              </text>
            </g>
          </g>
        );
      })}
    </svg>
  );
}

/* ================================================================= */
/* MAIN DASHBOARD                                                     */
/* ================================================================= */
export default function AnalyticsDashboard() {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchAnalytics = async () => {
    setLoading(true);
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/summary`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAnalytics(); }, []);

  const handleDownloadExcelXLSX = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/export/xlsx`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_Report_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert('Report export failed: ' + err.message);
    }
  };

  const handleDownloadPdfReport = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/export/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_Report_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert('Report export failed: ' + err.message);
    }
  };

  const handleDownloadExcelXlsx = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/export/excel`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Excel export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_${Date.now()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (err: any) {
      alert('Excel export failed: ' + err.message);
    }
  };

  const handleDownloadServerPdf = async () => {
    const token = localStorage.getItem('valetudo_token') || localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/analytics/export/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Server PDF generation failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PSU_Health_Analytics_Report_${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => window.URL.revokeObjectURL(url), 1000); 
    } catch (err: any) {
      alert('PDF generation failed: ' + err.message);
    }
  };

  if (loading) {
    return (
      <div
        style={{
          padding: 80,
          textAlign: 'center',
          color: '#2E5C43',
          fontWeight: 700,
          fontSize: 14,
        }}
      >
        Loading campus epidemiological analytics…
      </div>
    );
  }

  if (!data) {
    return (
      <div
        style={{
          padding: 80,
          textAlign: 'center',
          color: '#7A2E26',
          fontSize: 14,
        }}
      >
        Failed to load analytics data. Ensure the server is running.
      </div>
    );
  }

  const isFluSpike =
    (data.fluStats?.cases_past_7_days || 0) > (data.fluStats?.cases_prev_7_days || 0);

  const getRoleTone = (code: string) => {
    switch (code) {
      case 'STUDENT':             return { bg: '#D6E3F0', fg: '#1F4462', icon: '🎓' };
      case 'FACULTY':             return { bg: '#F0E6D2', fg: '#6E5526', icon: '🏫' };
      case 'DOCTOR':              return { bg: '#D7E8D2', fg: '#264D36', icon: '🩺' };
      case 'DENTIST':             return { bg: '#D3E8E5', fg: '#1F5A55', icon: '🦷' };
      case 'NURSE':               return { bg: '#DFEBE0', fg: '#2A5A38', icon: '👩‍⚕️' };
      case 'EMERGENCY_RESPONDER': return { bg: '#F4DBD6', fg: '#7A2E26', icon: '🚨' };
      case 'ADMIN':               return { bg: '#E4DEF2', fg: '#4A3A80', icon: '⚙️' };
      default:                    return { bg: '#EEF3EC', fg: '#5A635B', icon: '👤' };
    }
  };

  const totalRegistered =
    data.roleDistribution?.reduce((acc, r) => acc + Number(r.count), 0) || 0;

  return (
    <div
      id="analytics-report-area"
      style={{ width: '100%', marginTop: 8 }}
    >
      {/* Print stylesheet */}
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #analytics-report-area, #analytics-report-area * { visibility: visible; }
          #analytics-report-area {
            position: absolute;
            left: 0; top: 0;
            width: 100% !important;
            padding: 0 !important;
            border: none !important;
          }
          .no-print { display: none !important; }
          .print-header { display: block !important; }
        }
      `}</style>

      {/* Print-only header */}
      <div
        className="print-header"
        style={{
          display: 'none',
          borderBottom: '2px solid #2E5C43',
          paddingBottom: 12,
          marginBottom: 22,
          textAlign: 'center',
        }}
      >
        <h2 style={{ margin: 0, color: '#2E5C43', fontSize: 18, fontWeight: 800 }}>
          PANGASINAN STATE UNIVERSITY — LINGAYEN CAMPUS
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: '#5A635B' }}>
          Campus Health Services & Infirmary Epidemiological Report · R.A. 10173 Compliant
        </p>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#9AA79B' }}>
          Generated: {new Date().toLocaleString()}
        </p>
      </div>

      {/* Toolbar */}
      <div
        className="no-print"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 24,
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h1
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: -0.6,
              color: 'var(--text)',
              margin: 0,
            }}
          >
            Epidemiological analytics
          </h1>
          <p style={{ fontSize: 13.5, color: 'var(--text-sub)', margin: '6px 0 0' }}>
            Campus illness trajectories, seasonal spike monitoring & health reports
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={fetchAnalytics} style={btnGhost}>
            🔄 Refresh
          </button>
          <button
            type="button"
 HEAD
            onClick={handleDownloadExcelXLSX}

            onClick={handleDownloadExcelXlsx}
            style={{
              ...btnGhost,
              background: '#D7E8D2',
              color: '#264D36',
              border: 'none',
              fontWeight: 700,
            }}
          >
            📗 Export Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={handleDownloadExcelCSV}
 origin/Stage1
            style={{
              ...btnGhost,
              background: '#D6E3F0',
              color: '#1F4462',
              border: 'none',
            }}
          >
            📊 Export XLSX
          </button>
 HEAD
          <button type="button" onClick={handleDownloadPdfReport} style={btnPrimary}>
            🖨️ Export PDF

          <button
            type="button"
            onClick={handleDownloadServerPdf}
            style={btnPrimary}
          >
            📑 Official PDF Report
          </button>
          <button type="button" onClick={handlePrintPDFReport} style={btnGhost}>
            🖨️ Print View
 origin/Stage1
          </button>
        </div>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: 16,
          marginBottom: 22,
        }}
      >
        {[
          {
            label: 'Enrolled students',
            value: data.totalStudents,
            icon: '🎓',
            bg: '#D7E8D2',
            fg: '#264D36',
            sub: 'Verified student profiles',
          },
          {
            label: 'Total consultations',
            value: data.totalConsultations,
            icon: '🩺',
            bg: '#D7E8D2',
            fg: '#264D36',
            sub: 'All-time encounters logged',
          },
          {
            label: 'Active emergencies',
            value: data.emergencyMetrics?.active || 0,
            icon: '🚨',
            bg: '#F4DBD6',
            fg: '#7A2E26',
            sub: 'Pending / in-dispatch triage',
          },
          {
            label: 'Avg. response time',
            value: `${Math.round(data.emergencyMetrics?.avgResponseSeconds || 0)}s`,
            icon: '⚡',
            bg: '#E4DEF2',
            fg: '#4A3A80',
            sub: 'Trigger to resolution average',
          },
        ].map((card) => (
          <div
            key={card.label}
            style={{
              padding: '20px 22px',
              background: card.bg,
              borderRadius: 24,
              position: 'relative',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                marginBottom: 14,
              }}
            >
              <span
                style={{
                  fontSize: 20,
                  width: 36,
                  height: 36,
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.55)',
                  display: 'grid',
                  placeItems: 'center',
                }}
              >
                {card.icon}
              </span>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 0.6,
                  color: card.fg,
                  textTransform: 'uppercase',
                }}
              >
                {card.label}
              </span>
            </div>
            <div
              style={{
                fontSize: 32,
                fontWeight: 800,
                color: card.fg,
                letterSpacing: -1,
                lineHeight: 1,
              }}
            >
              {card.value}
            </div>
            <div
              style={{
                fontSize: 11.5,
                color: card.fg,
                opacity: 0.75,
                marginTop: 8,
                fontWeight: 600,
              }}
            >
              {card.sub}
            </div>
          </div>
        ))}
      </div>

      {/* Flu surveillance banner */}
      <div
        style={{
          padding: '20px 24px',
          marginBottom: 22,
          borderRadius: 24,
          background: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
            ? '#F4DBD6'
            : '#D7E8D2',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 14,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 15,
              fontWeight: 800,
              color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
                ? '#7A2E26'
                : '#264D36',
            }}
          >
            {isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
              ? '⚠️ Seasonal illness / flu spike alert'
              : '✅ Seasonal illness trends stable'}
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
                ? '#7A2E26'
                : '#264D36',
              opacity: 0.85,
              fontWeight: 500,
            }}
          >
            Acute respiratory & flu-like visits logged past 7 days:{' '}
            <b>{data.fluStats?.cases_past_7_days || 0}</b>{' '}
            (Previous 7 days: {data.fluStats?.cases_prev_7_days || 0}).
          </p>
        </div>
        <span
          className="my-pill"
          style={{
            background: 'rgba(255,255,255,0.6)',
            color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
              ? '#7A2E26'
              : '#264D36',
            fontSize: 10.5,
            letterSpacing: 0.6,
          }}
        >
          EPIDEMIC SURVEILLANCE
        </span>
      </div>

      {/* ── 1. Roles & headcount ──────────────────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 20,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h4 className="my-card-title">Campus population & headcount by role</h4>
            <p className="my-card-sub">
              Distribution of authorized users across all 7 platform RBAC roles
            </p>
          </div>
          <span
            className="my-pill"
            style={{
              background: '#EEF3EC',
              color: '#5A635B',
              fontSize: 11.5,
            }}
          >
            Total registered: {totalRegistered}
          </span>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
            gap: 12,
          }}
        >
          {data.roleDistribution?.map((role) => {
            const tone = getRoleTone(role.role_code);
            return (
              <div
                key={role.role_code}
                style={{
                  padding: '18px 14px',
                  borderRadius: 20,
                  background: tone.bg,
                  textAlign: 'center',
                }}
              >
                <div style={{ fontSize: 22 }}>{tone.icon}</div>
                <div
                  style={{
                    fontSize: 22,
                    fontWeight: 800,
                    color: tone.fg,
                    marginTop: 6,
                    letterSpacing: -0.4,
                  }}
                >
                  {role.count}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    color: tone.fg,
                    opacity: 0.85,
                    marginTop: 3,
                  }}
                >
                  {role.role_name}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 2. Consultation timeline ─────────────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h4 className="my-card-title">14-day consultation volume</h4>
            <p className="my-card-sub">
              Daily patient consultations across all campus infirmaries
            </p>
          </div>
          <span className="my-pill my-tonal-green">Total: {data.totalConsultations}</span>
        </div>
        <SvgLineChart
          data={data.timeSeries || []}
          themeColor="#2E5C43"
          themeColorLight="#7BAA87"
          gradId="consultationGrad"
        />
      </div>

      {/* ── 3. Emergency SOS timeline ─────────────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 18,
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <h4 className="my-card-title">14-day campus emergency incidents</h4>
            <p className="my-card-sub">
              Daily SOS panic triggers transmitted from mobile clients
            </p>
          </div>
          <span className="my-pill my-tonal-rose">Incidents tracked</span>
        </div>
        <SvgLineChart
          data={data.emergencyTimeSeries || []}
          themeColor="#B25C4D"
          themeColorLight="#E0A89A"
          gradId="emergencyGrad"
          emptyMessage="No campus emergency incidents reported in the past 14 days."
        />
      </div>

      {/* ── 4. Top diagnoses ───────────────────────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h4 className="my-card-title">Top clinical diagnoses</h4>
          <p className="my-card-sub">
            Primary medical diagnoses logged across student and employee encounters
          </p>
        </div>
        <SvgVerticalBarChart data={data.topDiagnoses || []} />
      </div>

      {/* ── 5. Department breakdown ───────────────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <div style={{ marginBottom: 14 }}>
          <h4 className="my-card-title">Visits by academic program & department</h4>
          <p className="my-card-sub">
            Consultation volume aggregated per academic degree program or employee unit
          </p>
        </div>
        <SvgHorizontalBarChart data={data.deptBreakdown || []} />
      </div>

      {/* ── 6. Watchlist & critical inventory ────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
          gap: 20,
        }}
      >
        {/* High-risk watchlist */}
        <div className="my-card">
          <h4
            className="my-card-title"
            style={{ marginBottom: 18 }}
          >
            High-risk student surveillance watchlist
          </h4>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            {[
              {
                label: 'Asthma / respiratory',
                value: data.highRiskGroups?.asthma_count || 0,
                bg: '#D6E3F0',
                fg: '#1F4462',
              },
              {
                label: 'Hypertension / cardiac',
                value: data.highRiskGroups?.hypertension_count || 0,
                bg: '#F4DBD6',
                fg: '#7A2E26',
              },
              {
                label: 'Severe allergies',
                value: data.highRiskGroups?.severe_allergies_count || 0,
                bg: '#F0E6D2',
                fg: '#6E5526',
              },
              {
                label: 'Diabetes / endocrine',
                value: data.highRiskGroups?.diabetes_count || 0,
                bg: '#E4DEF2',
                fg: '#4A3A80',
              },
            ].map((item) => (
              <div
                key={item.label}
                style={{
                  padding: '16px 18px',
                  borderRadius: 20,
                  background: item.bg,
                }}
              >
                <div
                  style={{
                    fontSize: 11.5,
                    fontWeight: 700,
                    color: item.fg,
                    opacity: 0.85,
                    lineHeight: 1.4,
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 28,
                    fontWeight: 800,
                    color: item.fg,
                    marginTop: 6,
                    letterSpacing: -0.6,
                    lineHeight: 1,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Low stock & expiry sweeps */}
        <div className="my-card">
          <h4
            className="my-card-title"
            style={{ marginBottom: 16 }}
          >
            Critical pharmacy inventory
          </h4>

          {!data.lowStockMeds || data.lowStockMeds.length === 0 ? (
            <div
              style={{
                padding: '32px 20px',
                textAlign: 'center',
                color: '#264D36',
                fontSize: 13,
                fontWeight: 700,
                background: '#D7E8D2',
                borderRadius: 20,
              }}
            >
              ✅ All clinic supplies have adequate stock buffers.
            </div>
          ) : (
            <div
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                background: '#F5F8F3',
              }}
            >
              {data.lowStockMeds.slice(0, 4).map((med, idx, arr) => {
                const criticalStock = med.quantity_on_hand < 15;
                const criticalExpiry = med.days_until_expiry < 90;
                return (
                  <div
                    key={idx}
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1.4fr 0.9fr 0.7fr 0.9fr',
                      gap: 12,
                      padding: '14px 18px',
                      alignItems: 'center',
                      borderBottom: idx < arr.length - 1
                        ? '1px solid rgba(15,30,23,0.06)'
                        : 'none',
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: 'var(--text)',
                      }}
                    >
                      {med.name}
                    </div>
                    <div
                      style={{
                        fontFamily: 'var(--mono)',
                        fontSize: 10.5,
                        color: 'var(--text-muted)',
                        fontWeight: 600,
                      }}
                    >
                      {med.batch_no || 'Standard'}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 800,
                        color: criticalStock ? '#7A2E26' : '#264D36',
                        textAlign: 'right',
                      }}
                    >
                      {med.quantity_on_hand}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: criticalExpiry ? '#7A2E26' : 'var(--text-sub)',
                        fontWeight: 600,
                        textAlign: 'right',
                      }}
                    >
                      {med.expiry_date}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}