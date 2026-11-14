import { VITAL_RULES, type TriageVitalField } from '../../../../server/src/appointments/vitals.js';

interface TriageVitalsFieldsProps {
  C: Record<string, string>;
  verifiedPatient: { height?: number | string; weight?: number | string } | null;
  sex: string;
  setSex: React.Dispatch<React.SetStateAction<string>>;
  vitalFields: Record<TriageVitalField, { label: string; value: string }>;
  vitalId: string;
  rejectedVitals: Partial<Record<TriageVitalField, string>>;
  touchedVitals: Partial<Record<TriageVitalField, boolean>>;
  vitalErrors: { temperature?: string; pulse?: string; spo2?: string; resp_rate?: string; height?: string; weight?: string; blood_pressure?: string; };
  isCheckingIn: boolean;
  isRegisteringWalkIn: boolean;
  updateVital: (field: TriageVitalField, draft: string) => void;
  setTouchedVitals: React.Dispatch<React.SetStateAction<Partial<Record<TriageVitalField, boolean>>>>;
  bmi: number | null;
  bmiPrompt: "Correct height or weight to calculate BMI" | "Enter height and weight" | "Enter height" | "Enter weight";
  bmiCategory: "Underweight" | "Normal" | "Overweight" | "Obese";
}

export default function TriageVitalsFields({
  C,
  verifiedPatient,
  sex,
  setSex,
  vitalFields,
  vitalId,
  rejectedVitals,
  touchedVitals,
  vitalErrors,
  isCheckingIn,
  isRegisteringWalkIn,
  updateVital,
  setTouchedVitals,
  bmi,
  bmiPrompt,
  bmiCategory,
}: TriageVitalsFieldsProps) {
  return (
    <>
      <div
        style={{
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: 1.2,
          color: C.textMuted,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        Triage vitals
      </div>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: C.textSub }}>Leave any unmeasured readings blank.</p>
      {(verifiedPatient?.height || verifiedPatient?.weight) && (
        <p style={{ margin: '0 0 10px', fontSize: 12, color: C.textSub }}>
          Saved profile measurements{verifiedPatient.height ? ' · Height ' + verifiedPatient.height + ' cm' : ''}
          {verifiedPatient.weight ? ' · Weight ' + verifiedPatient.weight + ' kg' : ''}
        </p>
      )}
      <label style={{ display: 'block', marginBottom: 10, fontSize: 10.5, color: C.textSub, fontWeight: 600 }}>
        Patient sex
        <select
          value={sex}
          onChange={(e) => setSex(e.target.value)}
          style={{
            display: 'block',
            width: '100%',
            boxSizing: 'border-box',
            marginTop: 4,
            padding: '8px 10px',
            color: C.text,
            background: C.surface,
            border: `1px solid ${C.border}`,
            borderRadius: 8,
            fontFamily: 'inherit',
          }}
        >
          <option value="">Not recorded</option>
          <option value="MALE">MALE</option>
          <option value="FEMALE">FEMALE</option>
        </select>
      </label>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
          gap: 8,
          marginBottom: 14,
        }}
      >
        {(Object.keys(vitalFields) as TriageVitalField[]).map((field) => {
          const { label, value } = vitalFields[field];
          const id = vitalId + '-' + field;
          const error = rejectedVitals[field] || (touchedVitals[field] ? vitalErrors[field] : undefined);
          const rejectedBlank = rejectedVitals[field] && !value.trim();
          return (
            <div key={field} style={{ minWidth: 0 }}>
              <label htmlFor={id} style={{ fontSize: 10.5, color: C.textSub, fontWeight: 600, display: 'block', marginBottom: 4 }}>
                {label}
              </label>
              <input
                id={id}
                form={`${vitalId}-intake`}
                type="text"
                inputMode={field === 'blood_pressure' ? 'text' : VITAL_RULES[field].integer ? 'numeric' : 'decimal'}
                autoComplete="off" disabled={isCheckingIn || isRegisteringWalkIn}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? id + '-error' : undefined}
                style={{
                  width: '100%',
                  boxSizing: 'border-box',
                  padding: '8px 10px',
                  fontSize: 12,
                  color: C.text,
                  background: C.surface,
                  border: '1px solid ' + (error ? C.danger : C.border),
                  borderRadius: 8,
                  fontFamily: 'inherit',
                }}
                value={value}
                onChange={(event) => updateVital(field, event.target.value)}
                onBlur={() => setTouchedVitals((touched) => ({ ...touched, [field]: true }))}
                onKeyDown={(event) => {
                  if (rejectedBlank && (event.key === 'Backspace' || event.key === 'Delete')) {
                    event.preventDefault();
                    updateVital(field, '');
                  }
                }}
              />
              {error && (
                <div id={id + '-error'} role="alert" style={{ marginTop: 4, color: C.danger, fontSize: 11 }}>
                  {error}
                  {rejectedBlank && ' Press Backspace or Delete to leave it blank.'}
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 10, fontSize: 12, color: C.textSub }}>
        Calculated BMI: <strong style={{ color: C.text }}>
          {bmi === null ? bmiPrompt : `${bmi.toFixed(1)} (${bmiCategory})`}
        </strong>
      </div>
    </>
  );
}
