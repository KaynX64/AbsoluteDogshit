export type VitalMetric = 'systolic_bp' | 'diastolic_bp' | 'temperature' | 'pulse' | 'spo2' | 'resp_rate' | 'height' | 'weight';
export type TriageVitalField = Exclude<VitalMetric, 'systolic_bp' | 'diastolic_bp'> | 'blood_pressure';
type VitalValues = Partial<Record<VitalMetric, number>>;

export const VITAL_RULES: Record<VitalMetric, {
  label: string;
  unit: string;
  min: number;
  max: number;
  integer: boolean;
}>;
export function validateVitals(input: unknown): { values: VitalValues; errors: Partial<Record<VitalMetric | 'vitals', string>> };
export function validateTriageVitals(input: Partial<Record<TriageVitalField, unknown>>): {
  values: VitalValues;
  errors: Partial<Record<TriageVitalField, string>>;
};
export function formatTriageNote(vitals: VitalValues): string;
export function triageDraftError(field: TriageVitalField, draft: string): string | undefined;
