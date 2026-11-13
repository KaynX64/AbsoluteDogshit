export type Count = number | string;
export type Day = { date: string; label: string; count: Count; partial?: boolean };
export type Diagnosis = { diagnosis: string; count: Count };
export type Medicine = {
  medicine_id: number; name: string; generic_name: string; form: string; strength: string; unit: string;
  quantity_prescribed: Count; quantity_dispensed: Count; quantity_returned: Count; net_dispensed: Count;
  total_stock_on_hand: Count; reorder_level: Count; suggested_reorder_qty: Count;
  stock_status: 'OUT_OF_STOCK' | 'CRITICAL_BUFFER' | 'ADEQUATE';
};

export interface AnalyticsData {
  totalConsultations: Count;
  totalStudents: Count;
  emergencyMetrics: { active: Count; avgResponseSeconds: Count; timedClosures?: Count };
  roleDistribution: { role_code: string; role_name: string; count: Count }[];
  timeSeries: Day[];
  emergencyTimeSeries: Day[];
  topDiagnoses: Diagnosis[];
  deptBreakdown: { department: string; consultations_count: Count }[];
  fluStats: { cases_past_7_days: Count; cases_prev_7_days: Count };
  highRiskGroups: {
    hypertension_count: Count; asthma_count: Count; diabetes_count: Count;
    severe_allergies_count: Count; total_students_monitored: Count;
  };
  lowStockMeds: {
    batch_id: number; name: string; batch_no: string; quantity_on_hand: Count;
    expiry_date: string; days_until_expiry: Count;
  }[];
  pharmacy?: { windowDays: number; dispensing: Medicine[]; reorderPriorities: Medicine[] };
}

export const count = (value: Count) => new Intl.NumberFormat().format(Number(value));
export const dayLabel = (day: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(day.slice(0, 10) + 'T00:00:00Z'));

export function formatClosure(metrics: AnalyticsData['emergencyMetrics']) {
  const seconds = Math.round(Number(metrics.avgResponseSeconds));
  if (metrics.timedClosures === undefined ? seconds === 0 : Number(metrics.timedClosures) === 0) return '—';
  if (seconds < 60) return `${count(seconds)} s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return hours ? `${count(hours)} h ${minutes} min` : `${minutes} min ${seconds % 60} s`;
}
