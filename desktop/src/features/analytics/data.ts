export type Count = number | string;
export type Day = { date: string; label: string; count: Count; partial?: boolean };
export type Diagnosis = { diagnosis: string; count: Count };
export type Department = { department: string; consultations_count: Count };
export type AnalyticsScope = 'ANALYTICS_OPERATIONS' | 'ANALYTICS_CLINICAL' | 'ANALYTICS_PHARMACY' | 'ANALYTICS_HEADCOUNT' | 'ANALYTICS_EXPORT' | 'ANALYTICS_SURVEILLANCE' | 'ANALYTICS_DISPENSING';
export type Medicine = {
  medicine_id: number; name: string; generic_name: string; form: string; strength: string; unit: string;
};
type Dispensing = Medicine & {
  quantity_prescribed: Count; quantity_dispensed: Count; quantity_returned: Count; net_dispensed: Count;
  availability: 'IN_STOCK' | 'OUT_OF_STOCK';
};
type ReorderPriority = Medicine & {
  total_stock_on_hand: Count; reorder_level: Count; suggested_reorder_qty: Count;
  stock_status: 'OUT_OF_STOCK' | 'CRITICAL_BUFFER' | 'ADEQUATE';
};

export interface AnalyticsData {
  scopes: AnalyticsScope[];
  operations: {
    totalConsultations: Count;
    totalStudents: Count;
    emergencyMetrics: { active: Count; avgResponseSeconds: Count; timedClosures: Count };
    timeSeries: Day[];
    emergencyTimeSeries: Day[];
    deptBreakdown: Department[];
  } | null;
  clinical: {
    topDiagnoses: Diagnosis[] | null;
    surveillance: {
      fluStats: { cases_past_7_days: Count; cases_prev_7_days: Count };
      highRiskGroups: {
        hypertension_count: Count; asthma_count: Count; diabetes_count: Count;
        severe_allergies_count: Count; total_students_monitored: Count;
      };
    } | null;
  } | null;
  headcount: { roleDistribution: { role_code: string; role_name: string; count: Count }[] } | null;
  pharmacy: {
    windowDays: number; dispensing: Dispensing[] | null;
    inventory: {
      reorderPriorities: ReorderPriority[];
      lowStockMeds: {
        batch_id: number; name: string; batch_no: string; quantity_on_hand: Count;
        expiry_date: string; days_until_expiry: Count;
      }[];
    } | null;
  } | null;
}

export const authHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('valetudo_token') || localStorage.getItem('token')}` });
export const timestamp = (value: Date) => value.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function restrictSnapshot(data: AnalyticsData, scopes: AnalyticsScope[]): AnalyticsData {
  const topDiagnoses = scopes.includes('ANALYTICS_CLINICAL') ? data.clinical?.topDiagnoses ?? null : null;
  const surveillance = scopes.includes('ANALYTICS_SURVEILLANCE') ? data.clinical?.surveillance ?? null : null;
  const dispensing = scopes.includes('ANALYTICS_DISPENSING') ? data.pharmacy?.dispensing ?? null : null;
  const inventory = scopes.includes('ANALYTICS_PHARMACY') ? data.pharmacy?.inventory ?? null : null;
  return {
    scopes,
    operations: scopes.includes('ANALYTICS_OPERATIONS') ? data.operations : null,
    clinical: topDiagnoses || surveillance ? { topDiagnoses, surveillance } : null,
    pharmacy: data.pharmacy && (dispensing || inventory) ? {
      windowDays: data.pharmacy.windowDays,
      dispensing,
      inventory,
    } : null,
    headcount: scopes.includes('ANALYTICS_HEADCOUNT') ? data.headcount : null,
  };
}

export const count = (value: Count) => new Intl.NumberFormat().format(Number(value));
export const dayLabel = (day: string) => new Intl.DateTimeFormat(undefined, {
  month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
}).format(new Date(day.slice(0, 10) + 'T00:00:00Z'));

export function formatClosure(metrics: NonNullable<AnalyticsData['operations']>['emergencyMetrics']) {
  const seconds = Math.round(Number(metrics.avgResponseSeconds));
  if (Number(metrics.timedClosures) === 0) return '—';
  if (seconds < 60) return `${count(seconds)} s`;
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds / 60) % 60;
  return hours ? `${count(hours)} h ${minutes} min` : `${minutes} min ${seconds % 60} s`;
}
