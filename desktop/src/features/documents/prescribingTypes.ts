export type MedicationDraft = {
  item_key: string; fulfillment: 'clinic' | 'external'; catalog_medicine_id: number | null;
  generic_name: string; brand_name: string; strength: string; form: string; generic_confirmed: boolean;
  dose_amount: string; dose_unit: string; route: string;
  schedule: { kind: 'fixed' | 'prn' | 'custom'; frequency: string; prn_reason: string; prn_limits: string };
  duration_days: string | number | null; review_on: string; quantity: string | number; quantity_unit: string;
  pack_size: string; directions: string;
};
export type PrescriptionDraft = { contract_version: 2; patient_user_id: number; appointment_id?: number;
  expires_at: string; notes: string; items: MedicationDraft[] };
export type PrescribingReview = {
  draft: PrescriptionDraft; review_token: string;
  safety: { coverage: string; known_item_count: number; unverified_item_keys: string[];
    duplicate_groups: string[][]; scope: string;
    findings: { id: string; severity: string; medicine_a: string; medicine_b: string; description: string; recommendation?: string }[] };
};
export type ReviewAcknowledgements = { patient_reviewed: boolean; coverage_reviewed: boolean;
  duplicates_reviewed: boolean; severe_reasons: Record<string, string> };
export const emptyAcknowledgements = (): ReviewAcknowledgements => ({ patient_reviewed: false,
  coverage_reviewed: false, duplicates_reviewed: false, severe_reasons: {} });
export const supplyUnits = ['tablet', 'capsule', 'pcs', 'mL', 'g', 'mg', 'drop', 'puff', 'application',
  'bottle', 'tube', 'inhaler', 'pack', 'vial', 'ampoule', 'sachet', 'patch', 'suppository', 'unit'];
export const containerUnits = ['bottle', 'tube', 'inhaler', 'pack', 'vial', 'ampoule'];
export const doseUnits = [...supplyUnits, 'mcg', 'L', 'IU', 'mg/kg', 'mg/kg/dose', 'mEq', 'mmol'];
export function draftError(draft: PrescriptionDraft): { message: string; item?: number } | null {
  if (!draft.expires_at) return { message: 'Enter the prescription validity date.' };
  for (const [index, item] of draft.items.entries()) {
    const missing = (!item.catalog_medicine_id && (![item.generic_name, item.strength, item.form].every(value => value.trim()) || !item.generic_confirmed)) ||
      (item.fulfillment === 'clinic' && !item.catalog_medicine_id);
    const dose = item.dose_amount.trim();
    const validDose = /^\d*\.?\d+(?:\s*\/\s*\d*\.?\d+)?$/.test(dose) && dose.split('/').every(part => Number(part) > 0);
    const quantity = Number(item.quantity);
    const course = item.duration_days !== '' && item.duration_days != null;
    if (missing || !validDose || !doseUnits.includes(item.dose_unit.trim()) || !item.route.trim() || !item.directions.trim() ||
      !Number.isFinite(quantity) || quantity <= 0 || quantity > 999999999.999 || Math.abs(quantity * 1000 - Math.round(quantity * 1000)) > 0.0001 || (item.fulfillment === 'clinic' && !Number.isInteger(quantity)) ||
      !item.quantity_unit || (item.fulfillment === 'external' && !supplyUnits.includes(item.quantity_unit)) ||
      (item.fulfillment === 'external' && containerUnits.includes(item.quantity_unit) && !item.pack_size.trim()) ||
      (course && (!Number.isInteger(Number(item.duration_days)) || Number(item.duration_days) <= 0)) ||
      (item.schedule.kind === 'fixed' ? !item.schedule.frequency.trim() || !course : !course && !item.review_on) ||
      (item.schedule.kind === 'prn' && (!item.schedule.prn_reason.trim() || !item.schedule.prn_limits.trim()))) {
      return { item: index, message: `Complete medicine ${index + 1}: confirmed identity, positive dose and supply with units, route, schedule, course or review date, and patient directions. PRN requires a reason and explicit limits.` };
    }
  }
  return null;
}
export const newMedication = (): MedicationDraft => ({ item_key: crypto.randomUUID(), fulfillment: 'clinic',
  catalog_medicine_id: null, generic_name: '', brand_name: '', strength: '', form: '', generic_confirmed: false,
  dose_amount: '', dose_unit: '', route: '', schedule: { kind: 'fixed', frequency: '', prn_reason: '', prn_limits: '' },
  duration_days: '', review_on: '', quantity: '', quantity_unit: 'pcs', pack_size: '', directions: '' });

export interface PrescriptionGeneratorProps {
  active?: boolean; patientUserId: number; appointmentId?: number;
  verifiedPatient: { first_name: string; last_name: string; student_no: string; course: string; allergies: string;
    date_of_birth?: string | null; age?: number | null; sex?: 'MALE' | 'FEMALE' | null };
  initialNotes?: string; isArchived?: boolean; signatureEnrolled?: boolean | null;
  onPrescriptionIssued?: (info: { prescriptionId: number; qrToken: string; emrId: number; pdfAvailable: boolean }) => void;
  onPrescriptionError?: (message: string) => void; onSignatureRequired?: () => void;
}
