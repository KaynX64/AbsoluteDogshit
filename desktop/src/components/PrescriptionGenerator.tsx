// desktop/src/components/PrescriptionGenerator.tsx
import React, { useState, useEffect, useRef } from 'react';
import Icon from './Icon';
import ClinicalReview, { type ReviewField } from './ClinicalReview';
import { T, btnPrimary, btnGhost, inputStyle } from '../theme';
import { API_BASE_URL } from '../config/api';
import InteractionWarning from './InteractionWarning';
import {
  checkDrugInteractions,
  type InteractionCheckResult,
} from '../services/interactionService';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
  unit?: string;
  available_stock?: number;
}

interface PrescriptionGeneratorProps {
  patientUserId: number;
  appointmentId?: number;
  verifiedPatient: {
    first_name: string;
    last_name: string;
    student_no: string;
    course: string;
    allergies: string;
    date_of_birth?: string | null;
    age?: number | null;
    sex?: 'MALE' | 'FEMALE' | null;
  };
  initialNotes?: string;
  isArchived?: boolean;
  signatureEnrolled?: boolean | null;
  onPrescriptionIssued?: (info: { prescriptionId: number; qrToken: string; emrId: number; pdfAvailable: boolean }) => void;
  onPrescriptionError?: (message: string) => void;
  onSignatureRequired?: () => void;
}

/* ── Hoisted Form Field Wrapper (Must stay outside to preserve focus) ── */
function Field({ label, inputId, children }: { label: string; inputId?: string; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={inputId}
        style={{
          display: 'block',
          fontSize: 11.5,
          fontWeight: 700,
          color: T.textSub,
          marginBottom: 6,
        }}
      >
        {label}
      </label>
      {children}
    </div>
  );
}

/* ── Hoisted Segmented Control Pill ────────────────────────────────── */
function ModePill({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      style={{
        flex: '1 1 145px', minWidth: 0,
        padding: '9px 12px',
        border: `1px solid ${active ? T.primary : 'transparent'}`,
        borderRadius: T.radius.pill,
        background: active ? T.surface : 'transparent',
        color: active ? T.primary : T.textSub,
        fontWeight: active ? 800 : 600,
        fontSize: 12,
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontFamily: T.font,
        boxShadow: active ? T.shadow.xs : 'none',
        transition: 'all 120ms ease',
        whiteSpace: 'normal', overflowWrap: 'anywhere',
      }}
    >
      {children}
    </button>
  );
}

/* ── Custom themed dropdown showing live stock levels ─────────── */
function FormularySelect({
  medicines,
  value,
  onChange,
  disabled,
}: {
  medicines: MedicineMaster[];
  value: number;
  onChange: (id: number) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const selected = medicines.find((m) => m.medicine_id === value);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <button
        id="rx-formulary"
        type="button"
        disabled={disabled}
        onClick={() => !disabled && setOpen((v) => !v)}
        style={{
          ...inputStyle,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          textAlign: 'left',
          opacity: disabled ? 0.6 : 1,
        }}
      >
        <span
          style={{
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            color: selected ? T.text : T.textMuted,
          }}
        >
          {selected
            ? selected.name
            : 'Select medicine…'}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {selected && selected.available_stock !== undefined && (
            <span
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                padding: '2px 8px',
                borderRadius: T.radius.pill,
                background: selected.available_stock <= 0 ? T.dangerSoft : T.successSoft,
                color: selected.available_stock <= 0 ? T.danger : T.success,
              }}
            >
              {selected.available_stock <= 0
                ? 'Out of stock'
                : `${selected.available_stock} ${selected.unit || 'pcs'}`}
            </span>
          )}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke={T.textSub}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              width: 14,
              height: 14,
              transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
              transition: 'transform 140ms ease',
            }}
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </div>
      </button>
      {open && !disabled && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 6px)',
            left: 0,
            right: 0,
            zIndex: 50,
            maxHeight: 260,
            overflowY: 'auto',
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.md,
            boxShadow: T.shadow.lg,
            padding: 4,
          }}
        >
          {medicines.length === 0 ? (
            <div style={{ padding: '10px 12px', fontSize: 12.5, color: T.textMuted, fontStyle: 'italic' }}>
              Loading formulary…
            </div>
          ) : (
            medicines.map((m) => {
              const isSelected = m.medicine_id === value;
              const isOutOfStock = m.available_stock !== undefined && m.available_stock <= 0;
              return (
                <button
                  key={m.medicine_id}
                  type="button"
                  onClick={() => {
                    onChange(m.medicine_id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    width: '100%',
                    textAlign: 'left',
                    padding: '9px 12px',
                    borderRadius: T.radius.sm,
                    border: 'none',
                    background: isSelected ? T.primaryTint : 'transparent',
                    color: isOutOfStock ? T.textMuted : isSelected ? T.primary : T.text,
                    fontSize: 12.5,
                    fontWeight: isSelected ? 700 : 500,
                    cursor: 'pointer',
                    fontFamily: T.font,
                    transition: 'background 100ms ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.background = T.sage100;
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {m.name} ({m.generic_name}) · {m.strength} [{m.form}]
                  </span>
                  <span
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      padding: '2px 8px',
                      borderRadius: T.radius.pill,
                      background: isOutOfStock ? T.dangerSoft : T.successSoft,
                      color: isOutOfStock ? T.danger : T.success,
                      flexShrink: 0,
                      marginLeft: 8,
                    }}
                  >
                    {isOutOfStock ? '0 in stock' : `${m.available_stock ?? '—'} ${m.unit || 'pcs'}`}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

export default function PrescriptionGenerator({
  patientUserId,
  appointmentId,
  verifiedPatient,
  initialNotes,
  isArchived = false,
  signatureEnrolled,
  onPrescriptionIssued,
  onPrescriptionError,
  onSignatureRequired,
}: PrescriptionGeneratorProps) {
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number>(0);
  const [outsideDosage, setOutsideDosage] = useState('');
  const [rxFrequency, setRxFrequency] = useState('');
  const [rxRoute, setRxRoute] = useState('');
  const [rxDurationDays, setRxDurationDays] = useState('');
  const [rxValidityDays, setRxValidityDays] = useState('');
  const [rxQuantity, setRxQuantity] = useState('');
  const [rxInstructions, setRxInstructions] = useState('');
  const [doctorNotes, setDoctorNotes] = useState(initialNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [showIssueConfirmation, setShowIssueConfirmation] = useState(false);

  /* ── Outside-drug mode state ──────────────────────────────────── */
  const [rxMode, setRxMode] = useState<'formulary' | 'outside'>('formulary');
  const [outsideName, setOutsideName] = useState('');

  const [stockError, setStockError] = useState<{
    medicine: string;
    available: number;
    requested: number;
  } | null>(null);

  /* ── Drug-interaction state ─────────────────────────────────── */
  const [interactionResult, setInteractionResult] =
    useState<InteractionCheckResult | null>(null);
  const [checkingInteractions, setCheckingInteractions] = useState(false);

  useEffect(() => {
    setDoctorNotes(initialNotes || '');
  }, [initialNotes, isArchived]);


  const fetchCatalog = async (attempt = 0) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/medicines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MedicineMaster[] = await res.json();
      setMedicines(data);
    } catch (err) {
      if (attempt < 2) {
        window.setTimeout(() => fetchCatalog(attempt + 1), 1500 * (attempt + 1));
      } else {
        console.error('Could not fetch medicines catalog:', err);
      }
    }
  };

  useEffect(() => {
    fetchCatalog();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const selectedMed = medicines.find((m) => m.medicine_id === selectedMedicineId);

  /* ── Live interaction check whenever the selected medicine changes ── */
  useEffect(() => {
    let cancelled = false;
    const runCheck = async () => {
      if (!selectedMedicineId || rxMode !== 'formulary') {
        if (!cancelled) setInteractionResult(null);
        return;
      }
      setCheckingInteractions(true);
      const result = await checkDrugInteractions([selectedMedicineId]);
      if (cancelled) return;
      setInteractionResult(result);
      setCheckingInteractions(false);
    };
    runCheck();
    return () => {
      cancelled = true;
    };
  }, [selectedMedicineId, rxMode]);

  const handleSwitchMode = (mode: 'formulary' | 'outside') => {
    if (isArchived || mode === rxMode) return;
    setRxMode(mode);
    setInteractionResult(null);
    setStockError(null);
    setOutsideDosage('');
  };

  const wholeNumber = (value: string, max: number) =>
    /^\d+$/.test(value.trim()) && Number(value) >= 1 && Number(value) <= max;
  const quantity = Number(rxQuantity);
  const duration = Number(rxDurationDays);
  const validity = Number(rxValidityDays);
  const validExpiry = wholeNumber(rxValidityDays, 180);
  const expiresAt = validExpiry ? new Date(Date.now() + validity * 86400000).toISOString().slice(0, 10) : '';
  const outside = rxMode === 'outside';
  const strength = selectedMed?.strength?.trim() || '';
  const dosageType = selectedMed?.form?.trim() || '';
  const genericIngredient = selectedMed?.generic_name?.trim() || '';
  const medicineName = outside ? outsideName.trim() : selectedMed?.name || '';
  const prescriptionDraft = {
    patient_user_id: patientUserId,
    appointment_id: appointmentId,
    expires_at: expiresAt,
    notes: doctorNotes.trim(),
    items: [{
      medicine_id: outside ? null : selectedMedicineId,
      outside_drug_name: outside ? outsideName.trim() : undefined,
      dosage: outside ? outsideDosage.trim() : strength,
      frequency: rxFrequency.trim(),
      route: rxRoute.trim(),
      duration_days: duration,
      quantity_prescribed: quantity,
      quantity_dispensed: outside ? 0 : quantity,
      instructions: rxInstructions.trim(),
    }],
  };
  const item = prescriptionDraft.items[0];
  const reviewFields: ReviewField[] = [
    { label: 'Medicine', value: medicineName, input: outside ? 'rx-outside-name' : 'rx-formulary', error: medicineName ? undefined : 'Choose or enter a medicine.' },
    {
      label: outside ? 'Dosage' : 'Dosage (formulary strength)',
      value: item.dosage,
      input: outside ? 'rx-dosage' : undefined,
      error: item.dosage ? undefined : outside ? 'Enter a dosage.' : 'Choose a formulary medicine with a recorded strength.',
    },
    ...(!outside ? [
      { label: 'Dosage Type', value: dosageType },
      { label: 'Generic active ingredient', value: genericIngredient },
    ] : []),
    { label: 'Frequency', value: item.frequency, input: 'rx-frequency', error: item.frequency ? undefined : 'Enter a frequency.' },
    { label: 'Intake Method', value: item.route, input: 'rx-route', error: item.route ? undefined : 'Enter an intake method.' },
    { label: 'Duration (days)', value: rxDurationDays, input: 'rx-duration', error: wholeNumber(rxDurationDays, 2147483647) ? undefined : 'Enter a positive whole number.' },
    { label: 'Quantity', value: rxQuantity, input: 'rx-quantity', error: wholeNumber(rxQuantity, 2147483647) ? undefined : 'Enter a positive whole number.' },
    { label: 'Expiry date', value: expiresAt, input: 'rx-validity', error: validExpiry ? undefined : 'Enter a validity period from 1 to 180 days.' },
    { label: 'Instructions', value: item.instructions, input: 'rx-instructions' },
    { label: 'Physician notes', value: prescriptionDraft.notes, input: 'rx-notes' },
  ];

  const handleSaveAndPrintPrescription = async (confirmed = false) => {
    if (isSaving || isArchived) return;
    if (signatureEnrolled === false) {
      onSignatureRequired?.();
      onPrescriptionError?.('Save your handwritten signature before issuing a prescription.');
      return;
    }
    if (!patientUserId || !appointmentId) {
      onPrescriptionError?.('Select a patient from the consultation queue first.');
      return;
    }
    if (!confirmed) {
      setShowIssueConfirmation(true);
      return;
    }
    if (reviewFields.some(({ error }) => error) || (!outside && (isBlocked || isOutOfStock || isOverStock))) return;
    setShowIssueConfirmation(false);
    setIsSaving(true);
    const token = localStorage.getItem('valetudo_token');

    try {
      if (!outside) {
        const preCheck = await checkDrugInteractions([selectedMedicineId]).catch(() => null);
        if (preCheck?.hasInteractions) setInteractionResult(preCheck);
        if (preCheck?.blocking) {
          onPrescriptionError?.('Prescription blocked by a contraindicated drug interaction.');
          return;
        }
      }
      const res = await fetch(`${API_BASE_URL}/api/documents/prescriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(prescriptionDraft),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'SIGNATURE_NOT_ENROLLED') onSignatureRequired?.();
        if (data.code === 'INSUFFICIENT_STOCK') {
          setStockError({
            medicine: data.medicine || medicineName,
            available: Number(data.available ?? 0),
            requested: Number(data.requested ?? quantity),
          });
          return;
        }
        throw new Error(data.error || 'Failed to issue prescription.');
      }
      onPrescriptionIssued?.({
        prescriptionId: data.prescriptionId,
        qrToken: data.qrToken,
        emrId: data.emrId,
        pdfAvailable: data.pdfAvailable,
      });
      if (!outside) void fetchCatalog();
    } catch (err) {
      onPrescriptionError?.('Error issuing prescription: ' + (err instanceof Error ? err.message : 'Request failed'));
    } finally {
      setIsSaving(false);
    }
  };

  const isOutOfStock =
    rxMode === 'formulary' &&
    selectedMed &&
    selectedMed.available_stock !== undefined &&
    selectedMed.available_stock <= 0;
  const isOverStock =
    rxMode === 'formulary' &&
    selectedMed &&
    selectedMed.available_stock !== undefined &&
    selectedMed.available_stock > 0 &&
    Number(rxQuantity) > selectedMed.available_stock;
  const isBlocked = rxMode === 'formulary' && (interactionResult?.blocking ?? false);
  const isOutsideNameMissing = rxMode === 'outside' && !outsideName.trim();
  return (
    <div className="doctor-prescription-generator" style={{ display: 'flex', flexDirection: 'column' }}>
      {/* ── Verified Patient Demographic / Clinical Safety Bar ── */}
      {verifiedPatient && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: 12,
            padding: '8px 12px',
            background: T.sage100,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.md,
            fontSize: 12,
            color: T.ink,
          }}
        >
          <span>
            <b>Patient:</b> {verifiedPatient.first_name} {verifiedPatient.last_name}
          </span>
          {verifiedPatient.student_no && (
            <span>
              <b style={{ color: T.textSub }}>ID:</b> {verifiedPatient.student_no}
            </span>
          )}
          {(verifiedPatient.date_of_birth || verifiedPatient.age != null) && (
            <span>
              <b style={{ color: T.textSub }}>DOB / Age:</b>{' '}
              {verifiedPatient.date_of_birth || ''}
              {verifiedPatient.age != null ? ` (${verifiedPatient.age} yrs)` : ''}
            </span>
          )}
          {verifiedPatient.sex && (
            <span>
              <b style={{ color: T.textSub }}>Sex:</b> {verifiedPatient.sex}
            </span>
          )}
          {verifiedPatient.allergies?.trim() && !/^(none|none reported)$/i.test(verifiedPatient.allergies.trim()) && (
            <span style={{ color: T.danger, fontWeight: 700 }}>
              ⚠ Allergies: {verifiedPatient.allergies}
            </span>
          )}
        </div>
      )}

      {/* ── Medication source: infirmary formulary vs outside pharmacy ── */}
      <div
        style={{
          display: 'flex', flexWrap: 'wrap',
          gap: 6,
          padding: 4,
          background: T.sage100,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius.lg,
        }}
      >
        <ModePill
          active={rxMode === 'formulary'}
          disabled={isArchived}
          onClick={() => handleSwitchMode('formulary')}
        >
          <Icon name="local_hospital" size={14} /> Infirmary formulary
        </ModePill>
        <ModePill
          active={rxMode === 'outside'}
          disabled={isArchived}
          onClick={() => handleSwitchMode('outside')}
        >
          <Icon name="shopping_cart" size={14} /> Outside pharmacy drug
        </ModePill>
      </div>

      {rxMode === 'formulary' ? (
        <Field label="Medicine (formulary)" inputId="rx-formulary">
          <FormularySelect
            medicines={medicines}
            value={selectedMedicineId}
            onChange={setSelectedMedicineId}
            disabled={isArchived}
          />
        </Field>
      ) : (
        <Field label="Outside drug name (brand or generic)" inputId="rx-outside-name">
          <input
            style={{
              ...inputStyle,
              borderColor: isOutsideNameMissing ? T.danger : undefined,
            }}
            disabled={isArchived}

            id="rx-outside-name" value={outsideName}
            onChange={(e) => setOutsideName(e.target.value)}
            maxLength={200}
          />
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              marginTop: 4,
              color: isOutsideNameMissing ? T.danger : T.textSub,
              lineHeight: 1.5,
            }}
          >
            {isOutsideNameMissing
              ? 'Drug name is required for outside prescriptions.'
              : 'Not stocked by the infirmary — the patient purchases this at an external pharmacy. No inventory is deducted.'}
          </div>
        </Field>
      )}

      <div className={outside ? 'doctor-prescription-fields' : 'doctor-prescription-fields doctor-formulary-fields'}>
        {outside ? (
          <Field label="Dosage" inputId="rx-dosage">
            <input
              style={inputStyle}
              disabled={isArchived}
              id="rx-dosage" maxLength={100} value={outsideDosage}
              onChange={(e) => setOutsideDosage(e.target.value)}
            />
          </Field>
        ) : (
          <dl className="doctor-formulary-details" aria-live="polite">
            <div>
              <dt>Dosage <span>(strength)</span></dt>
              <dd>{strength || (selectedMed ? 'Not recorded' : '—')}</dd>
            </div>
            <div>
              <dt>Dosage Type</dt>
              <dd>{dosageType || (selectedMed ? 'Not recorded' : '—')}</dd>
            </div>
            <div>
              <dt>Generic active ingredient</dt>
              <dd>{genericIngredient || (selectedMed ? 'Not recorded' : '—')}</dd>
            </div>
          </dl>
        )}
        <Field inputId="rx-quantity" label={outside ? 'Quantity to purchase (prescribed)' : 'Quantity prescribed (dispensed)'}>
          <input
            type="number"
            min="1"
            style={{
              ...inputStyle,
              borderColor:
                rxMode === 'formulary' && (isOutOfStock || isOverStock)
                  ? T.danger
                  : undefined,
            }}
            disabled={isArchived}
            id="rx-quantity" value={rxQuantity}
            onChange={(e) => setRxQuantity(e.target.value)}
          />
          {rxMode === 'formulary' && selectedMed && selectedMed.available_stock !== undefined && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                marginTop: 4,
                color: isOutOfStock ? T.danger : isOverStock ? T.warning : T.textSub,
              }}
            >
              {isOutOfStock
                ? 'Currently OUT OF STOCK'
                : isOverStock
                ? `Exceeds unexpired stock (${selectedMed.available_stock} available)`
                : `Stock on hand: ${selectedMed.available_stock} ${selectedMed.unit || 'pcs'} (FEFO)`}
            </div>
          )}
        </Field>
      </div>

      <div className="doctor-prescription-fields">
        <Field label="Frequency" inputId="rx-frequency">
          <input
            style={inputStyle}
            disabled={isArchived}

            id="rx-frequency" maxLength={100} value={rxFrequency}
            onChange={(e) => setRxFrequency(e.target.value)}
          />
        </Field>
        <Field label="Intake Method" inputId="rx-route">
          <input id="rx-route" maxLength={50} style={inputStyle} disabled={isArchived}
            value={rxRoute} onChange={(event) => setRxRoute(event.target.value)} />
        </Field>
        <Field label="Duration (days)" inputId="rx-duration">
          <input
            type="number"
            min="1"
            style={inputStyle}
            disabled={isArchived}
            id="rx-duration" value={rxDurationDays}
            onChange={(e) => setRxDurationDays(e.target.value)}
          />
        </Field>
        <Field label="Prescription validity" inputId="rx-validity">
          <select
            style={{ ...inputStyle, cursor: isArchived ? 'not-allowed' : 'pointer' }}
            disabled={isArchived}
            id="rx-validity" value={rxValidityDays}
            onChange={(e) => setRxValidityDays(e.target.value)}
          >
            <option value="7">7 days (1 week)</option>
            <option value="14">14 days (2 weeks)</option>
            <option value="30">30 days (1 month)</option>
            <option value="60">60 days (2 months)</option>
            <option value="90">90 days (3 months)</option>
            <option value="180">180 days (6 months)</option>
          </select>
        </Field>
      </div>

      <Field label="Instructions (sig)">
        <textarea
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
          disabled={isArchived}

          id="rx-instructions" value={rxInstructions}
          onChange={(e) => setRxInstructions(e.target.value)}
        />
      </Field>

      <Field label="Physician dietary / clinical notes" inputId="rx-notes">
        <input
          style={inputStyle}
          disabled={isArchived}

          id="rx-notes" value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
        />
      </Field>

      {/* ── Drug-interaction feedback (formulary mode only) ─────────── */}
      {rxMode === 'formulary' && checkingInteractions && (
        <div
          style={{
            padding: '10px 14px',
            background: T.sage100,
            borderRadius: T.radius.md,
            fontSize: 12,
            color: T.textSub,
            textAlign: 'center',
          }}
        >
          <Icon name="search" size={14} /> Checking for drug interactions…
        </div>
      )}
      {rxMode === 'formulary' && interactionResult?.hasInteractions && (
        <InteractionWarning
          interactions={interactionResult.interactions}
          blocking={interactionResult.blocking}
          onDismiss={() => setInteractionResult(null)}
        />
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={() => void handleSaveAndPrintPrescription()}
        disabled={
          isSaving ||
          isArchived ||
          isBlocked ||
          Boolean(isOutOfStock) ||
          Boolean(isOverStock)
        }
        style={{
          ...btnPrimary,
          width: '100%',
          padding: 13,
          opacity:
            isSaving || isArchived || isBlocked || isOutOfStock || isOverStock || isOutsideNameMissing
              ? 0.5
              : 1,
          cursor:
            isSaving || isArchived || isBlocked || isOutOfStock || isOverStock || isOutsideNameMissing
              ? 'not-allowed'
              : 'pointer',
        }}
      >
        {isArchived
          ? 'Prescription issued & archived'
          : rxMode === 'outside'
          ? isOutsideNameMissing
            ? 'Enter the outside drug name to issue'
            : isSaving
            ? 'Signing outside prescription…'
            : 'Issue outside prescription & print'
          : isOutOfStock
          ? 'Cannot issue: Formulary Out of Stock'
          : isOverStock
          ? 'Cannot issue: Quantity exceeds available stock'
          : isBlocked
          ? 'Blocked by interaction safety check'
          : isSaving
          ? 'Signing & deducting inventory…'
          : '️ Issue, deduct inventory & print prescription'}
      </button>

      {/* ── Stock-shortfall modal ─────────────────────────── */}
      {stockError && (
        <div className="modal-backdrop" onClick={() => setStockError(null)}>
          <style>{`@keyframes rxStockIn { from { opacity: 0; transform: translateY(14px) scale(0.96); } to { opacity: 1; transform: translateY(0) scale(1); } }`}</style>
          <div
            className="modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 440,
              padding: 0,
              overflow: 'hidden',
              borderRadius: T.radius.xl,
              animation: 'rxStockIn 220ms cubic-bezier(0.34, 1.3, 0.64, 1)',
            }}
          >
            <div
              style={{
                padding: '26px 28px 20px',
                background: `linear-gradient(135deg, ${T.dangerSoft} 0%, #FFF7F5 100%)`,
                borderBottom: `1px solid ${T.dangerBorder}`,
                textAlign: 'center',
              }}
            >
              <div
                style={{
                  width: 56,
                  height: 56,
                  margin: '0 auto 14px',
                  borderRadius: '50%',
                  background: T.surface,
                  border: `1.5px solid ${T.dangerBorder}`,
                  boxShadow: T.shadow.md,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 26,
                }}
              >
                <Icon name="medication" size={14} />
              </div>
              <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: T.danger, letterSpacing: -0.3 }}>
                Pharmacy stock shortfall
              </h3>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: T.textSub, lineHeight: 1.55 }}>
                The infirmary cannot dispense{' '}
                <b style={{ color: T.text }}>{stockError.medicine}</b> — unexpired stock on
                hand is lower than the requested quantity.
              </p>
            </div>

            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr 1fr',
                gap: 10,
                padding: '18px 28px 6px',
              }}
            >
              {[
                { label: 'Available', value: stockError.available, color: T.success, bg: T.successSoft, border: T.successBorder },
                { label: 'Requested', value: stockError.requested, color: T.info, bg: T.infoSoft, border: T.infoBorder },
                { label: 'Shortfall', value: Math.max(stockError.requested - stockError.available, 0), color: T.danger, bg: T.dangerSoft, border: T.dangerBorder },
              ].map((s) => (
                <div
                  key={s.label}
                  style={{
                    background: s.bg,
                    border: `1px solid ${s.border}`,
                    borderRadius: T.radius.md,
                    padding: '12px 8px',
                    textAlign: 'center',
                  }}
                >
                  <div style={{ fontSize: 22, fontWeight: 800, color: s.color, letterSpacing: -0.6, lineHeight: 1 }}>
                    {s.value}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      color: s.color,
                      opacity: 0.8,
                      marginTop: 6,
                    }}
                  >
                    {s.label}
                  </div>
                </div>
              ))}
            </div>

            <p style={{ padding: '12px 28px 0', margin: 0, fontSize: 11.5, color: T.textMuted, lineHeight: 1.55 }}>
              Dispensing follows FEFO (first-expiry-first-out): only unexpired batches with
              stock on hand are counted. Restock via <b>Nurse Console <Icon name="arrow_forward" size={14} /> Inventory</b>, or
              reduce the quantity below.
            </p>

            <div
              style={{
                display: 'flex',
                gap: 10,
                padding: '18px 28px 24px',
                justifyContent: 'flex-end',
                flexWrap: 'wrap',
              }}
            >
              <button type="button" onClick={() => setStockError(null)} style={btnGhost}>
                Dismiss
              </button>
              {stockError.available > 0 ? (
                <button
                  type="button"
                  onClick={() => {
                    setRxQuantity(String(stockError.available));
                    setStockError(null);
                  }}
                  style={{ ...btnPrimary, background: T.danger, color: T.textOnDanger }}
                >
                  Set quantity to {stockError.available}
                </button>
              ) : (
                <button type="button" onClick={() => setStockError(null)} style={btnPrimary}>
                  Understood
                </button>
              )}

            </div>
          </div>
        </div>
      )}

      {showIssueConfirmation && (
        <ClinicalReview title="Review prescription" fields={reviewFields}
          patient={[verifiedPatient?.first_name, verifiedPatient?.last_name].filter(Boolean).join(' ')}
          action="Sign and issue prescription" onClose={() => setShowIssueConfirmation(false)}
          onConfirm={() => void handleSaveAndPrintPrescription(true)} />
      )}
    </div>
  );
}
