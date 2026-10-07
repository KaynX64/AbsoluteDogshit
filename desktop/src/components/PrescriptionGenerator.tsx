// desktop/src/components/PrescriptionGenerator.tsx
import React, { useState, useEffect, useRef } from 'react';
import { T, btnPrimary, inputStyle } from '../theme';
import { API_BASE_URL } from '../config/api';

interface MedicineMaster {
  medicine_id: number;
  name: string;
  generic_name: string;
  form: string;
  strength: string;
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
  onPrescriptionIssued?: () => void;
}

/* ── Custom themed dropdown (replaces native <select>) ─────────── */
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
            flexShrink: 0,
            marginLeft: 8,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
            transition: 'transform 140ms ease',
          }}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
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
            <div
              style={{
                padding: '10px 12px',
                fontSize: 12.5,
                color: T.textMuted,
                fontStyle: 'italic',
              }}
            >
              Loading formulary…
            </div>
          ) : (
            medicines.map((m) => {
              const isSelected = m.medicine_id === value;
              return (
                <button
                  key={m.medicine_id}
                  type="button"
                  onClick={() => {
                    onChange(m.medicine_id);
                    setOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: T.radius.sm,
                    border: 'none',
                    background: isSelected ? T.primaryTint : 'transparent',
                    color: isSelected ? T.primary : T.text,
                    fontSize: 13,
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
                  {m.name} ({m.generic_name}) · {m.strength} [{m.form}]
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
}: PrescriptionGeneratorProps) {
  const [medicines, setMedicines] = useState<MedicineMaster[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState<number>(1);
  const [rxMedName, setRxMedName] = useState('Biogesic (Paracetamol)');
  const [rxDosage, setRxDosage] = useState('500mg');
  const [rxFrequency, setRxFrequency] = useState('Every 4-6 hours as needed');
  const [rxDurationDays, setRxDurationDays] = useState('5');
  const [rxQuantity, setRxQuantity] = useState('10');
  const [rxInstructions, setRxInstructions] = useState('Take 1 tablet after meals when fever exceeds 37.8°C.');

  const [doctorNotes, setDoctorNotes] = useState(
    initialNotes || (isArchived ? 'None recorded' : 'Maintain proper hydration and rest.')
  );

  const [isSaving, setIsSaving] = useState(false);
  const [issuedStatus, setIssuedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (initialNotes !== undefined && initialNotes !== null && initialNotes !== '') {
      setDoctorNotes(initialNotes);
    } else if (isArchived) {
      setDoctorNotes('None recorded');
    } else {
      setDoctorNotes('Maintain proper hydration and rest.');
    }
  }, [initialNotes, isArchived]);

  useEffect(() => {
    const fetchCatalog = async () => {
      const token = localStorage.getItem('valetudo_token');
      try {
        const res = await fetch(`${API_BASE_URL}/api/inventory/medicines`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data: MedicineMaster[] = await res.json();
          setMedicines(data);
          if (data.length > 0) {
            setSelectedMedicineId(data[0].medicine_id);
            setRxMedName(`${data[0].name} (${data[0].generic_name})`);
            setRxDosage(data[0].strength);
          }
        }
      } catch (err) {
        console.error('Could not fetch medicines catalog:', err);
      }
    };
    fetchCatalog();
  }, []);

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
      alert('Error: No patient selected. Please choose a patient from the queue first.');
      return;
    }
    setIsSaving(true);
    setIssuedStatus(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/prescriptions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patient_user_id: patientUserId,
          notes: doctorNotes,
          items: [{
            medicine_id: selectedMedicineId,
            dosage: rxDosage,
            frequency: rxFrequency,
            route: 'Oral',
            duration_days: Number(rxDurationDays) || 3,
            quantity_dispensed: Number(rxQuantity) || 10,
            instructions: rxInstructions,
          }],
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue prescription.');

      const realQrToken = data.qrToken;
      const prescriptionId = data.prescriptionId;

      setIssuedStatus(`✅ Prescription #${prescriptionId} recorded and signed! Verification Token: ${realQrToken}`);
      if (onPrescriptionIssued) onPrescriptionIssued();

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
      alert('Error issuing prescription: ' + err.message);
    } finally {
      setIsSaving(false);
    }
  };

  /* ── Field wrapper ────────────────────────────────────────── */
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div>
      <label style={{
        display: 'block', fontSize: 11.5, fontWeight: 700,
        color: T.textSub, marginBottom: 6,
      }}>
        {label}
      </label>
      {children}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Formulary picker (custom themed dropdown) */}
      <Field label="Medicine (formulary)">
        <FormularySelect
          medicines={medicines}
          value={selectedMedicineId}
          onChange={handleSelectMedicine}
          disabled={isArchived}
        />
      </Field>

      {/* Dosage & quantity */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="Dosage">
          <input
            style={inputStyle}
            disabled={isArchived}
            value={rxDosage}
            onChange={(e) => setRxDosage(e.target.value)}
          />
        </Field>
        <Field label="Quantity (pcs/bottles)">
          <input
            type="number"
            min="1"
            style={inputStyle}
            disabled={isArchived}
            value={rxQuantity}
            onChange={(e) => setRxQuantity(e.target.value)}
          />
        </Field>
      </div>

      {/* Frequency & duration */}
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

      {/* Instructions */}
      <Field label="Instructions (sig)">
        <textarea
          rows={2}
          style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
          disabled={isArchived}
          value={rxInstructions}
          onChange={(e) => setRxInstructions(e.target.value)}
        />
      </Field>

      {/* Physician dietary / clinical notes */}
      <Field label="Physician dietary / clinical notes">
        <input
          style={inputStyle}
          disabled={isArchived}
          value={doctorNotes}
          onChange={(e) => setDoctorNotes(e.target.value)}
        />
      </Field>

      {/* Submit */}
      <button
        type="button"
        onClick={handleSaveAndPrintPrescription}
        disabled={isSaving || isArchived}
        style={{
          ...btnPrimary,
          width: '100%',
          padding: 13,
          opacity: (isSaving || isArchived) ? 0.5 : 1,
          cursor: (isSaving || isArchived) ? 'not-allowed' : 'pointer',
        }}
      >
        {isArchived
          ? '🔒 Prescription issued & archived'
          : isSaving
          ? 'Signing & printing…'
          : '🖨️ Issue, sign & print prescription'}
      </button>

      {issuedStatus && (
        <p style={{
          fontSize: 11.5, color: T.success, fontWeight: 700,
          margin: 0, wordBreak: 'break-all', textAlign: 'center',
        }}>
          {issuedStatus}
        </p>
      )}
    </div>
  );
}