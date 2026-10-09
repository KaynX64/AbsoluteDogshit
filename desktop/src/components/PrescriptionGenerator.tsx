// desktop/src/components/PrescriptionGenerator.tsx
import React, { useState, useEffect, useRef } from 'react';
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
  verifiedPatient: {
    first_name: string;
    last_name: string;
    student_no: string;
    course: string;
    allergies: string;
  };
  initialNotes?: string;
  isArchived?: boolean;
  onPrescriptionIssued?: (info: { prescriptionId: number; qrToken: string; emrId: number }) => void;
  onPrescriptionError?: (message: string) => void;
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
            ? `${selected.name} (${selected.generic_name}) · ${selected.strength} [${selected.form}]`
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
  verifiedPatient,
  initialNotes,
  isArchived = false,
  onPrescriptionIssued,
  onPrescriptionError,
}: PrescriptionGeneratorProps) {
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number>(1);
  const [rxMedName, setRxMedName] = useState('Biogesic (Paracetamol)');
  const [rxDosage, setRxDosage] = useState('500mg');
  const [rxFrequency, setRxFrequency] = useState('Every 4-6 hours as needed');
  const [rxDurationDays, setRxDurationDays] = useState('5');
  const [rxQuantity, setRxQuantity] = useState('10');
  const [rxInstructions, setRxInstructions] = useState(
    'Take 1 tablet after meals when fever exceeds 37.8°C.'
  );
  const [doctorNotes, setDoctorNotes] = useState(
    initialNotes || (isArchived ? 'None recorded' : 'Maintain proper hydration and rest.')
  );
  const [isSaving, setIsSaving] = useState(false);

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
    if (initialNotes !== undefined && initialNotes !== null && initialNotes !== '') {
      setDoctorNotes(initialNotes);
    } else if (isArchived) {
      setDoctorNotes('None recorded');
    } else {
      setDoctorNotes('Maintain proper hydration and rest.');
    }
  }, [initialNotes, isArchived]);

  /* ── Formulary fetch with bounded retry (self-heals after a
       server restart / nodemon reload instead of sticking at
       "Loading formulary…" forever). Hoisted so the successful
       prescription handler can refresh live stock levels. ────── */
  const hasInitializedRef = useRef(false);

  const fetchCatalog = async (attempt = 0) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/inventory/medicines`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data: MedicineMaster[] = await res.json();
      setMedicines(data);
      if (data.length > 0 && !hasInitializedRef.current) {
        hasInitializedRef.current = true;
        setSelectedMedicineId(data[0].medicine_id);
        setRxMedName(`${data[0].name} (${data[0].generic_name})`);
        setRxDosage(data[0].strength);
      }
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
      if (!selectedMedicineId) {
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
  }, [selectedMedicineId]);

  const handleSelectMedicine = (medId: number) => {
    setSelectedMedicineId(medId);
    const chosen = medicines.find((m) => m.medicine_id === medId);
    if (chosen) {
      setRxMedName(`${chosen.name} (${chosen.generic_name})`);
      setRxDosage(chosen.strength);
    }
  };

  const handleSaveAndPrintPrescription = async () => {
    if (!patientUserId) {
      if (onPrescriptionError) {
        onPrescriptionError('❌ No patient selected. Please choose a patient from the queue first.');
      }
      return;
    }

    // ── Client-side Stock Safeguard ──────────────────────────────
    if (selectedMed && selectedMed.available_stock !== undefined) {
      if (selectedMed.available_stock <= 0) {
        if (onPrescriptionError) {
          onPrescriptionError(`❌ Cannot issue prescription: "${selectedMed.name}" is OUT OF STOCK in the infirmary.`);
        }
        return;
      }
      if (Number(rxQuantity) > selectedMed.available_stock) {
        if (onPrescriptionError) {
          onPrescriptionError(
            `❌ Insufficient stock: Requested ${rxQuantity} ${selectedMed.unit || 'pcs'}, but only ${selectedMed.available_stock} unexpired units are available.`
          );
        }
        return;
      }
    }

    setIsSaving(true);
    const token = localStorage.getItem('valetudo_token');

    /* ── Pre-flight interaction check (blocks contraindicated combos) ── */
    try {
      const preCheck = await checkDrugInteractions([selectedMedicineId]);
      if (preCheck?.blocking) {
        setInteractionResult(preCheck);
        setIsSaving(false);
        if (onPrescriptionError) {
          onPrescriptionError(
            '🚫 Prescription blocked: a CONTRAINDICATED drug interaction was detected. Review the warning panel.'
          );
        }
        return;
      }
      if (preCheck?.hasInteractions) setInteractionResult(preCheck);
    } catch (_) {
      /* Interaction service unreachable — do not block clinical issuance. */
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/prescriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patient_user_id: patientUserId,
          notes: doctorNotes,
          items: [
            {
              medicine_id: selectedMedicineId,
              dosage: rxDosage,
              frequency: rxFrequency,
              route: 'Oral',
              duration_days: Number(rxDurationDays) || 3,
              quantity_dispensed: Number(rxQuantity) || 10,
              instructions: rxInstructions,
            },
          ],
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'INSUFFICIENT_STOCK') {
          setStockError({
            medicine: data.medicine || rxMedName,
            available: Number(data.available ?? 0),
            requested: Number(data.requested ?? rxQuantity ?? 0),
          });
          return; // `finally` below still clears isSaving
        }
        throw new Error(data.error || 'Failed to issue prescription.');
      }
      const realQrToken = data.qrToken;
      const prescriptionId = data.prescriptionId;
      const emrId = data.emrId;

      // Refresh stock numbers so the dropdown reflects the deduction
      await fetchCatalog();

      if (onPrescriptionIssued) {
        onPrescriptionIssued({ prescriptionId, qrToken: realQrToken, emrId });
      }

      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(realQrToken)}`;
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Prescription #${prescriptionId}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
              .header h1 { margin: 0; color: #0f766e; font-size: 20px; }
              .header p { margin: 4px 0 0 0; font-size: 13px; color: #64748b; }
              .patient-box { margin-top: 20px; padding: 14px; background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 6px; font-size: 13px; line-height: 1.6; }
              .rx-symbol { font-size: 42px; font-weight: 900; color: #0f766e; margin: 16px 0 8px 0; }
              .med-item { margin-bottom: 14px; padding: 12px; background: #f8fafc; border-left: 4px solid #0f766e; border-radius: 4px; }
              .med-name { font-size: 15px; font-weight: bold; color: #0f172a; }
              .med-instructions { font-style: italic; color: #334155; margin-top: 4px; font-size: 13px; }
              .verification-panel { margin-top: 30px; display: flex; align-items: center; gap: 20px; border: 1px dashed #cbd5e1; padding: 16px; border-radius: 6px; }
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
              .sig-line { border-top: 1px solid #000; width: 220px; text-align: center; font-weight: bold; padding-top: 4px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>PANGASINAN STATE UNIVERSITY INFIRMARY</h1>
              <p>Lingayen Campus Medical Services • Republic Act No. 10173 Verified E-Prescription</p>
            </div>
            <div class="patient-box">
              <b>Patient:</b> ${verifiedPatient.first_name} ${verifiedPatient.last_name} &nbsp;|&nbsp;
              <b>Student No:</b> ${verifiedPatient.student_no || 'N/A'}<br/>
              <b>Course:</b> ${verifiedPatient.course || 'N/A'} &nbsp;|&nbsp;
              <b>Allergies:</b> <span style="color:red; font-weight:bold;">${verifiedPatient.allergies || 'None recorded'}</span>
            </div>
            <div class="rx-symbol">℞</div>
            <div class="med-item">
              <div class="med-name">${rxMedName} - ${rxDosage}</div>
              <div class="med-instructions">Sig: ${rxInstructions} • ${rxFrequency}</div>
              <div style="margin-top: 4px; font-size: 12px;">Duration: <b>${rxDurationDays} days</b> &nbsp;|&nbsp; Quantity Dispensed: <b>${rxQuantity} pcs</b></div>
            </div>
            ${doctorNotes ? `<p style="font-size: 13px; color: #475569;"><b>Physician Notes:</b> ${doctorNotes}</p>` : ''}
            <div class="verification-panel">
              <img src="${qrImageUrl}" width="110" height="110" alt="Rx QR Verification" />
              <div>
                <b style="color: #0f766e;">Digital Prescription Verification</b>
                <p style="margin: 4px 0; font-size: 11px; color: #64748b;">
                  Scan using Valetudo mobile scanner or infirmary terminal to confirm valid issuance.
                </p>
                <code style="font-size: 10px; background: #eee; padding: 2px 6px; border-radius: 4px;">${realQrToken}</code>
              </div>
            </div>
            <div class="footer">
              <div>
                <p>Issued: ${new Date().toLocaleString()}</p>
                <p>Prescription #${prescriptionId}</p>
              </div>
              <div class="sig-line">
                Attending Campus Physician<br/>
                <small>PRC License Verified E-Signature</small>
              </div>
            </div>
          </body>
        </html>
      `;
      if (window.electronAPI?.printDocument) {
        await window.electronAPI.printDocument({ htmlContent });
      } else {
        const printWin = window.open('', '_blank');
        if (printWin) {
          printWin.document.write(htmlContent);
          printWin.document.close();
          printWin.focus();
          printWin.print();
        }
      }
    } catch (err: any) {
      if (onPrescriptionError) {
        onPrescriptionError('❌ Error issuing prescription: ' + err.message);
      } else {
        console.error('[Prescription Generator]', err);
      }
    } finally {
      setIsSaving(false);
    }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label
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

  const isOutOfStock =
    selectedMed &&
    selectedMed.available_stock !== undefined &&
    selectedMed.available_stock <= 0;
  const isOverStock =
    selectedMed &&
    selectedMed.available_stock !== undefined &&
    selectedMed.available_stock > 0 &&
    Number(rxQuantity) > selectedMed.available_stock;
  const isBlocked = interactionResult?.blocking ?? false;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <Field label="Medicine (formulary)">
        <FormularySelect
          medicines={medicines}
          value={selectedMedicineId}
          onChange={handleSelectMedicine}
          disabled={isArchived}
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Dosage">
          <input
            style={inputStyle}
            disabled={isArchived}
            value={rxDosage}
            onChange={(e) => setRxDosage(e.target.value)}
          />
        </Field>
        <Field label="Quantity to dispense">
          <input
            type="number"
            min="1"
            style={{
              ...inputStyle,
              borderColor: isOutOfStock || isOverStock ? T.danger : undefined,
            }}
            disabled={isArchived}
            value={rxQuantity}
            onChange={(e) => setRxQuantity(e.target.value)}
          />
          {selectedMed && selectedMed.available_stock !== undefined && (
            <div
              style={{
                fontSize: 10.5,
                fontWeight: 700,
                marginTop: 4,
                color: isOutOfStock ? T.danger : isOverStock ? T.warning : T.textSub,
              }}
            >
              {isOutOfStock
                ? '⚠️ Currently OUT OF STOCK'
                : isOverStock
                ? `⚠️ Exceeds unexpired stock (${selectedMed.available_stock} available)`
                : `Stock on hand: ${selectedMed.available_stock} ${selectedMed.unit || 'pcs'} (FEFO)`}
            </div>
          )}
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Frequency">
          <input
            style={inputStyle}
            disabled={isArchived}
            value={rxFrequency}
            onChange={(e) => setRxFrequency(e.target.value)}
          />
        </Field>
        <Field label="Duration (days)">
          <input
            type="number"
            min="1"
            style={inputStyle}
            disabled={isArchived}
            value={rxDurationDays}
            onChange={(e) => setRxDurationDays(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Instructions (sig)">
        <textarea
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
          disabled={isArchived}
          value={rxInstructions}
          onChange={(e) => setRxInstructions(e.target.value)}
        />
      </Field>

      <Field label="Physician dietary / clinical notes">
        <input
          style={inputStyle}
          disabled={isArchived}
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
        />
      </Field>

      {/* ── Drug-interaction feedback ─────────────────────────── */}
      {checkingInteractions && (
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
          🔍 Checking for drug interactions…
        </div>
      )}
      {interactionResult?.hasInteractions && (
        <InteractionWarning
          interactions={interactionResult.interactions}
          blocking={interactionResult.blocking}
          onDismiss={() => setInteractionResult(null)}
        />
      )}

      {/* Submit */}
      <button
        type="button"
        onClick={handleSaveAndPrintPrescription}
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
            isSaving || isArchived || isBlocked || isOutOfStock || isOverStock
              ? 0.5
              : 1,
          cursor:
            isSaving || isArchived || isBlocked || isOutOfStock || isOverStock
              ? 'not-allowed'
              : 'pointer',
        }}
      >
        {isArchived
          ? '🔒 Prescription issued & archived'
          : isOutOfStock
          ? '❌ Cannot issue: Formulary Out of Stock'
          : isOverStock
          ? '⚠️ Cannot issue: Quantity exceeds available stock'
          : isBlocked
          ? '🚫 Blocked by interaction safety check'
          : isSaving
          ? 'Signing & deducting inventory…'
          : '🖨️ Issue, deduct inventory & print prescription'}
      </button>

      {/* ── Elegant stock-shortfall modal ─────────────────────────── */}
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
            {/* Accent header */}
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
                💊
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

            {/* Available / Requested / Shortfall stat trio */}
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
              stock on hand are counted. Restock via <b>Nurse Console → Inventory</b>, or
              reduce the quantity below.
            </p>

            {/* Actions */}
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
                  style={{ ...btnPrimary, background: T.danger }}
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
    </div>
  );
}