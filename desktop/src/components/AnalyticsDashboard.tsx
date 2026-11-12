// desktop/src/components/AnalyticsDashboard.tsx
import { useEffect, useState } from 'react';
import { T, btnGhost, btnPrimary } from '../theme';
import { API_BASE_URL } from '../config/api';
import Icon from './Icon';

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

interface PharmacyMedicine {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit: string;
  quantity_prescribed: number;
  quantity_dispensed: number;
  quantity_returned: number;
  net_dispensed: number;
  total_stock_on_hand: number;
  reorder_level: number;
  suggested_reorder_qty: number;
  stock_status: 'OUT_OF_STOCK' | 'CRITICAL_BUFFER' | 'ADEQUATE';
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
  pharmacy?: {
    windowDays: number;
    dispensing: PharmacyMedicine[];
    reorderPriorities: PharmacyMedicine[];
  };
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
  themeColor = T.primaryMid,
  themeColorLight = T.primarySoft,
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
          background: T.surface2,
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
              stroke={T.borderSoft}
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
              fill={T.textMuted}
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
                fill={T.surface}
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
              fill={T.surface}
              stroke={T.sage300}
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
              fill={T.text}
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
            fill={T.textMuted}
          >
            {i % 2 === 0 ? p.label : ''}
          </text>
        </g>
      ))}
    </svg>
  );
}

/* ================================================================= */
/* VERTICAL BAR CHART — Material You · adapts to any bar count        */
/* ================================================================= */

/** Smallest "nice" tick step (1/2/5 ladder) that keeps ≤5 gridline
 *  divisions above the data maximum — the axis always ends on a round
 *  number with no wasted headroom, like a proper charting library. */
function niceAxisStep(rawMax: number): number {
  if (rawMax <= 5) return 1;
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  for (const s of steps) {
    if (rawMax / s <= 5) return s;
  }
  return 5000;
}

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
          background: T.surface2,
          borderRadius: 20,
        }}
      >
        No diagnoses recorded yet.
      </div>
    );
  }

  const n = data.length;

  /* ── Adaptive geometry ──────────────────────────────────────────
     EVERY distinct diagnosis in the database gets its own bar (the
     server no longer slices to a top-5). The slot width per category
     adapts to the category count; when the slots no longer fit the
     card's natural width the canvas widens and the card scrolls
     horizontally instead of crushing the bars into slivers. */
  const CARD_W = 900;
  const height = 300;
  const padLeft = 56;
  const padRight = 24;
  const padTop = 40;
  const padBottom = 100;

  const minSlot = n <= 9 ? 92 : n <= 32 ? 28 : n <= 80 ? 22 : 16;
  const width = Math.max(CARD_W, padLeft + padRight + n * minSlot);
  const chartW = width - padLeft - padRight;
  const chartH = height - padTop - padBottom;
  const slot = chartW / n;
  const barWidth = Math.min(Math.max(slot * 0.62, 3), 72);
  const scrolls = width > CARD_W;

  /* ── Y axis: round ticks, zero baseline ───────────────────────── */
  const rawMax = Math.max(...data.map((d) => d.count), 1);
  const step = niceAxisStep(rawMax);
  const maxVal = Math.max(Math.ceil(rawMax / step) * step, 1);
  const ticks: number[] = [];
  for (let v = 0; v <= maxVal; v += step) ticks.push(v);
  const y0 = padTop + chartH;
  const yOf = (v: number) => padTop + chartH * (1 - v / maxVal);

  /* ── X labels adapt to the available slot width ─────────────────
     wide slots  → horizontal labels under each bar
     mid slots   → 45° labels (classic dense-category layout)
     thin slots  → vertical labels, thinned out every k-th bar when
                   the category count explodes; full text always
                   remains in the hover tooltip. */
  const showValuePill = barWidth >= 24;
  const labelEvery = n > 90 ? Math.ceil(n / 60) : 1;
  let labelAngle = 0;
  let labelAnchor: 'middle' | 'end' = 'middle';
  let labelMaxChars = 12;
  if (slot >= 92) {
    labelMaxChars = Math.max(8, Math.floor((slot - 10) / 6.3));
  } else if (slot >= 26) {
    labelAngle = -45;
    labelAnchor = 'end';
    labelMaxChars = Math.max(6, Math.floor(Math.min(112, slot * 1.3) / 6.0));
  } else {
    labelAngle = -90;
    labelAnchor = 'end';
    labelMaxChars = 12;
  }
  const truncate = (s: string) =>
    s.length > labelMaxChars ? `${s.slice(0, Math.max(1, labelMaxChars - 1))}…` : s;

  return (
    <div>
      <div style={{ overflowX: scrolls ? 'auto' : 'visible', paddingBottom: scrolls ? 6 : 0 }}>
        <svg
          viewBox={`0 0 ${width} ${height}`}
          style={{
            width: scrolls ? width : '100%',
            minWidth: scrolls ? width : 280,
            height: 'auto',
            minHeight: 240,
            display: 'block',
            overflow: 'visible',
          }}
        >
          <defs>
            <linearGradient id="barVertGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={T.primarySoft} />
              <stop offset="100%" stopColor={T.primary} />
            </linearGradient>
          </defs>

          {/* Y-axis gridlines, tick labels and zero baseline */}
          {ticks.map((v) => (
            <g key={v}>
              <line
                x1={padLeft}
                y1={yOf(v)}
                x2={width - padRight}
                y2={yOf(v)}
                stroke={v === 0 ? T.borderStrong : T.borderSoft}
                strokeWidth={v === 0 ? 1.5 : 1}
                strokeDasharray={v === 0 ? undefined : '2 6'}
                strokeLinecap="round"
              />
              <text
                x={padLeft - 14}
                y={yOf(v) + 4}
                textAnchor="end"
                fontSize="11"
                fontWeight="600"
                fill={T.textMuted}
              >
                {v}
              </text>
            </g>
          ))}

          {/* Left axis spine */}
          <line
            x1={padLeft}
            y1={padTop - 6}
            x2={padLeft}
            y2={y0}
            stroke={T.borderStrong}
            strokeWidth="1.5"
            strokeLinecap="round"
          />

          {data.map((item, idx) => {
            const x = padLeft + idx * slot + (slot - barWidth) / 2;
            const bHeight = Math.max((item.count / maxVal) * chartH, item.count > 0 ? 3 : 0);
            const y = y0 - bHeight;
            const cx = x + barWidth / 2;
            const pillW = Math.max(32, String(item.count).length * 9 + 14);

            return (
              <g key={idx}>
                <title>{`${item.diagnosis} — ${item.count} case${item.count === 1 ? '' : 's'}`}</title>
                <rect
                  className="my-bar-rect"
                  x={x}
                  y={y}
                  width={barWidth}
                  height={bHeight}
                  rx={Math.min(14, barWidth / 2)}
                  fill="url(#barVertGrad)"
                  style={{ animationDelay: `${Math.min(idx * 80, 1600)}ms` }}
                />
                {showValuePill && (
                  <g transform={`translate(${cx}, ${y - 14})`}>
                    <rect x={-pillW / 2} y="-14" width={pillW} height="22" rx="11" fill={T.primaryTint} />
                    <text x="0" y="3" textAnchor="middle" fontSize="12" fontWeight="800" fill={T.text}>
                      {item.count}
                    </text>
                  </g>
                )}
                {idx % labelEvery === 0 && (
                  <text
                    x={cx}
                    y={labelAngle === 0 ? y0 + 20 : y0 + 16}
                    transform={labelAngle !== 0 ? `rotate(${labelAngle}, ${cx}, ${y0 + 16})` : undefined}
                    textAnchor={labelAnchor}
                    fontSize={labelAngle === -90 ? 10.5 : 11.5}
                    fontWeight="600"
                    fill={T.textSub}
                  >
                    {truncate(item.diagnosis)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginTop: 8,
          gap: 10,
          flexWrap: 'wrap',
        }}
      >
        <span style={{ fontSize: 11.5, color: T.textMuted, fontWeight: 600 }}>
          {n} distinct diagnosis{n === 1 ? '' : 'es'} · every category in the database
        </span>
        {scrolls && (
          <span style={{ fontSize: 11.5, color: T.textMuted, fontStyle: 'italic' }}>
            scroll sideways to see all bars
          </span>
        )}
      </div>
    </div>
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
          background: T.surface2,
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
          <stop offset="0%" stopColor={T.primary} />
          <stop offset="100%" stopColor={T.primarySoft} />
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
              fill={T.textSub}
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
              fill={T.surface3}
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
                fill={T.primaryTint}
              />
              <text
                x="33"
                y="17.5"
                textAnchor="middle"
                fontSize="12"
                fontWeight="800"
                fill={T.text}
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
          color: T.primary,
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
          color: T.danger,
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
      case 'STUDENT':             return { bg: T.tonalBlueBg, fg: T.tonalBlueFg, icon: 'school' };
      case 'FACULTY':             return { bg: T.tonalCreamBg, fg: T.tonalCreamFg, icon: 'work' };
      case 'DOCTOR':              return { bg: T.tonalGreenBg, fg: T.tonalGreenFg, icon: 'medical_services' };
      case 'DENTIST':             return { bg: T.tonalTealBg, fg: T.tonalTealFg, icon: 'medical_information' };
      case 'NURSE':               return { bg: T.tonalGreenBg, fg: T.tonalGreenFg, icon: 'medical_information' };
      case 'EMERGENCY_RESPONDER': return { bg: T.tonalRoseBg, fg: T.tonalRoseFg, icon: 'emergency' };
      case 'ADMIN':               return { bg: T.tonalLilacBg, fg: T.tonalLilacFg, icon: 'admin_panel_settings' };
      default:                    return { bg: T.surface3, fg: T.textSub, icon: 'person' };
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
        <div className="vd-page-head" style={{ marginBottom: 0 }}>
          <div className="vd-page-head-eyebrow">Analytics</div>
          <h1 className="vd-page-head-title">Epidemiological analytics</h1>
          <p className="vd-page-head-sub">
            Campus illness trajectories, seasonal spike monitoring & health reports
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={fetchAnalytics} style={btnGhost}>
            <Icon name="refresh" size={14} /> Refresh
          </button>
          <button
            type="button"
            onClick={handleDownloadExcelXlsx}
            style={{
              ...btnGhost,
              background: T.primary50,
              color: T.primary,
              borderWidth: 1,
              borderStyle: 'solid',
              borderColor: T.primaryTint,
              fontWeight: 700,
            }}
          >
            <Icon name="menu_book" size={14} /> Export Excel (.xlsx)
          </button>
          <button
            type="button"
            onClick={handleDownloadServerPdf}
            style={btnPrimary}
          >
            <Icon name="library_books" size={14} /> Official PDF Report
          </button>
          <button
            type="button"
            onClick={() => window.print()}
            style={btnGhost}
          >
            <Icon name="print" size={14} />️ Print View
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
            icon: 'school',
            bg: T.tonalGreenBg,
            fg: T.tonalGreenFg,
            sub: 'Verified student profiles',
          },
          {
            label: 'Total consultations',
            value: data.totalConsultations,
            icon: 'medical_services',
            bg: T.tonalGreenBg,
            fg: T.tonalGreenFg,
            sub: 'All-time encounters logged',
          },
          {
            label: 'Active emergencies',
            value: data.emergencyMetrics?.active || 0,
            icon: 'emergency',
            bg: T.tonalRoseBg,
            fg: T.tonalRoseFg,
            sub: 'Pending / in-dispatch triage',
          },
          {
            label: 'Avg. response time',
            value: `${Math.round(data.emergencyMetrics?.avgResponseSeconds || 0)}s`,
            icon: 'schedule',
            bg: T.tonalLilacBg,
            fg: T.tonalLilacFg,
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
                  background: 'var(--glass)',
                  display: 'grid',
                  placeItems: 'center',
                  color: card.fg,
                }}
              >
                <Icon name={card.icon} size={20} />
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
            ? T.tonalRoseBg
            : T.tonalGreenBg,
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
                ? T.danger
                : T.tonalGreenFg,
            }}
          >
            {isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
              ? 'Seasonal illness / flu spike alert'
              : 'Seasonal illness trends stable'}
          </div>
          <p
            style={{
              margin: '6px 0 0',
              fontSize: 13,
              color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
                ? T.danger
                : T.tonalGreenFg,
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
            background: 'var(--glass)',
            color: isFluSpike && (data.fluStats?.cases_past_7_days || 0) > 0
              ? T.danger
              : T.tonalGreenFg,
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
              background: T.surface3,
              color: T.textSub,
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
                <div style={{ fontSize: 22, display: 'grid', placeItems: 'center', color: tone.fg }}>
                  <Icon name={tone.icon} size={22} />
                </div>
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
          themeColor={T.primaryMid}
          themeColorLight={T.primarySoft}
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
          themeColor={T.danger}
          themeColorLight={T.tonalRoseFg}
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

      {/* ── 6. Formulary dispensing and reorder priorities ────────── */}
      <div className="my-card" style={{ marginBottom: 22 }}>
        <h4 className="my-card-title">Pharmacy activity</h4>
        {data.pharmacy ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 390px), 1fr))', gap: 22 }}>
            <section style={{ minWidth: 0 }}>
              <h5 style={{ margin: '0 0 4px', fontSize: 14, color: T.text }}>Formulary dispensing</h5>
              <p className="my-card-sub">Last {data.pharmacy.windowDays} days · Net = dispensed − returned</p>
              {data.pharmacy.dispensing.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textMuted }}>No active formulary medicines.</p>
              ) : (
                <div tabIndex={0} role="region" aria-label="Formulary dispensing" style={{ overflowX: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 12, width: '100%' }}>
                    <thead>
                      <tr>
                        <th scope="col">Medicine</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Prescribed</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Dispensed</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Returned</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Net</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pharmacy.dispensing.map(medicine => (
                        <tr key={medicine.medicine_id}>
                          <th scope="row" style={{ textAlign: 'left' }}>
                            {medicine.name}
                            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}>
                              {medicine.strength} {medicine.form} · {medicine.unit}
                            </div>
                          </th>
                          <td style={{ textAlign: 'right' }}>{medicine.quantity_prescribed}</td>
                          <td style={{ textAlign: 'right' }}>{medicine.quantity_dispensed}</td>
                          <td style={{ textAlign: 'right' }}>{medicine.quantity_returned}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800 }}>{medicine.net_dispensed}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
            <section style={{ minWidth: 0 }}>
              <h5 style={{ margin: '0 0 4px', fontSize: 14, color: T.text }}>Reorder priorities</h5>
              <p className="my-card-sub">Current stock, lowest first</p>
              {data.pharmacy.reorderPriorities.length === 0 ? (
                <p style={{ fontSize: 13, color: T.textMuted }}>
                  {data.pharmacy.dispensing.length === 0 ? 'No active formulary medicines.' : 'All medicines are above their reorder buffers.'}
                </p>
              ) : (
                <div tabIndex={0} role="region" aria-label="Reorder priorities" style={{ overflowX: 'auto' }}>
                  <table className="tbl" style={{ fontSize: 12, width: '100%' }}>
                    <thead>
                      <tr>
                        <th scope="col">Medicine</th>
                        <th scope="col" style={{ textAlign: 'right' }}>On hand</th>
                        <th scope="col" style={{ textAlign: 'right' }}>Suggested order</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.pharmacy.reorderPriorities.map(medicine => (
                        <tr key={medicine.medicine_id}>
                          <th scope="row" style={{ textAlign: 'left' }}>
                            {medicine.name}
                            <div style={{ fontSize: 11, color: T.textMuted, fontWeight: 400 }}>
                              {medicine.strength} {medicine.form} · {medicine.stock_status === 'OUT_OF_STOCK' ? 'Out of stock' : 'At or below buffer'}
                            </div>
                          </th>
                          <td style={{ textAlign: 'right', color: T.danger }}>{medicine.total_stock_on_hand} {medicine.unit}</td>
                          <td style={{ textAlign: 'right' }}>
                            {medicine.suggested_reorder_qty > 0 ? '+' + medicine.suggested_reorder_qty + ' ' + medicine.unit : 'Set a buffer'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </div>
        ) : (
          <p className="my-card-sub">Pharmacy activity requires an updated server.</p>
        )}
      </div>

      {/* ── 7. Watchlist & critical inventory ────────── */}
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
                bg: T.tonalBlueBg,
                fg: T.tonalBlueFg,
              },
              {
                label: 'Hypertension / cardiac',
                value: data.highRiskGroups?.hypertension_count || 0,
                bg: T.tonalRoseBg,
                fg: T.tonalRoseFg,
              },
              {
                label: 'Severe allergies',
                value: data.highRiskGroups?.severe_allergies_count || 0,
                bg: T.tonalCreamBg,
                fg: T.tonalCreamFg,
              },
              {
                label: 'Diabetes / endocrine',
                value: data.highRiskGroups?.diabetes_count || 0,
                bg: T.tonalLilacBg,
                fg: T.tonalLilacFg,
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
                color: T.tonalGreenFg,
                fontSize: 13,
                fontWeight: 700,
                background: T.tonalGreenBg,
                borderRadius: 20,
              }}
            >
              <Icon name="check_circle" size={14} /> All clinic supplies have adequate stock buffers.
            </div>
          ) : (
            <div
              style={{
                borderRadius: 20,
                overflow: 'hidden',
                background: T.surface2,
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
                        ? `1px solid ${T.borderSoft}`
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
                        color: criticalStock ? T.danger : T.tonalGreenFg,
                        textAlign: 'right',
                      }}
                    >
                      {med.quantity_on_hand}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: criticalExpiry ? T.danger : 'var(--text-sub)',
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
