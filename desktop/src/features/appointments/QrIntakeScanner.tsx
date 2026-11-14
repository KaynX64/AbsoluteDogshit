import TriageVitalsFields from './TriageVitalsFields';
// desktop/src/features/appointments/QrIntakeScanner.tsx
import React, { useState, useId, useRef } from 'react';
import { useQrCapture } from './useQrCapture';
import { API_BASE_URL } from '../../config/api';
import { T } from '../../theme';
import Icon from '../../shared/ui/Icon';
import { triageDraftError, validateTriageVitals } from '../../../../server/src/appointments/vitals.js';
import type { TriageVitalField } from '../../../../server/src/appointments/vitals.js';

interface QrIntakeScannerProps {
  onPatientVerified: (patient: any, token: string) => void;
}

interface ActiveTicket {
  queue_id: number;
  queue_number: number;
  status: string;
  appointment_id: number | null;
  ticket_no: string;
  arrival_time: string;
  visit_type: string;
  doctor_name: string;
}

export default function QrIntakeScanner({ onPatientVerified }: QrIntakeScannerProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'search' | 'manual'>('camera');
  const [searchQuery, setSearchQuery] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState('');

  const [pendingAppointment, setPendingAppointment] = useState<any>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);

  /* ── Active ticket (duplicate prevention) ────────────────── */
  const [activeTicket, setActiveTicket] = useState<ActiveTicket | null>(null);
  const [loadingActiveTicket, setLoadingActiveTicket] = useState(false);

  /* ── Walk-in state ───────────────────────────────────────── */
  const [walkInSuccess, setWalkInSuccess] = useState<string | null>(null);
  const [isRegisteringWalkIn, setIsRegisteringWalkIn] = useState(false);

  const [bp, setBp] = useState('');
  const [temp, setTemp] = useState('');
  const [pulse, setPulse] = useState('');
  const [spo2, setSpo2] = useState('');
  const [respRate, setRespRate] = useState('');
  const [sex, setSex] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string>('');
  const vitalId = useId();
  const [touchedVitals, setTouchedVitals] = useState<Partial<Record<TriageVitalField, boolean>>>({});
  const [rejectedVitals, setRejectedVitals] = useState<Partial<Record<TriageVitalField, string>>>({});
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const submittingIntake = useRef(false);
  const vitalFields = {
    blood_pressure: { label: 'Blood pressure (mmHg)', value: bp, set: setBp },
    temperature: { label: 'Temp (°C)', value: temp, set: setTemp },
    pulse: { label: 'Pulse (bpm)', value: pulse, set: setPulse },
    spo2: { label: 'SpO₂ (%)', value: spo2, set: setSpo2 },
    resp_rate: { label: 'Resp (breaths/min)', value: respRate, set: setRespRate },
    height: { label: 'Height (cm)', value: height, set: setHeight },
    weight: { label: 'Weight (kg)', value: weight, set: setWeight },
  };
  const triageVitals = validateTriageVitals({ blood_pressure: bp, temperature: temp, pulse, spo2, resp_rate: respRate, height, weight });
  const vitalErrors = { ...triageVitals.errors, ...rejectedVitals };
  const invalidFields = Object.keys(vitalErrors) as TriageVitalField[];
  const intakeBlocked = invalidFields.length > 0;
  const { systolic_bp, diastolic_bp, ...measurements } = triageVitals.values;
  const bloodPressure = systolic_bp === undefined || diastolic_bp === undefined ? undefined : `${systolic_bp}/${diastolic_bp}`;
  const heightMeters = (measurements.height ?? 0) / 100;
  const weightKg = measurements.weight;
  const invalidBodyMetrics = Boolean(vitalErrors.height || vitalErrors.weight);
  const bmi = !invalidBodyMetrics && heightMeters && weightKg ? weightKg / (heightMeters * heightMeters) : null;
  const bmiPrompt = invalidBodyMetrics ? 'Correct height or weight to calculate BMI'
    : !height.trim() && !weight.trim() ? 'Enter height and weight'
    : !height.trim() ? 'Enter height' : 'Enter weight';
  const bmiCategory =
    bmi === null
      ? null
      : bmi < 18.5
        ? 'Underweight'
        : bmi < 25
          ? 'Normal'
          : bmi < 30
            ? 'Overweight'
            : 'Obese';

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  /* ── Resolve the current palette at render time so intake follows theme changes. ── */
  const C = {
    primary: T.primary,
    primaryDark: T.primaryDark,
    primaryTint: T.primaryTint,
    surface: T.surface,
    sage50: T.sage50,
    sage100: T.sage100,
    sage200: T.sage200,
    sage300: T.sage300,
    sage400: T.sage400,
    border: T.border,
    borderSoft: T.borderSoft,
    text: T.text,
    textSub: T.textSub,
    textMuted: T.textMuted,
    danger: T.danger,
    dangerSoft: T.dangerSoft,
    dangerBorder: T.dangerBorder,
    warning: T.warning,
    warningSoft: T.warningSoft,
    warningBorder: T.warningBorder,
    success: T.success,
    successSoft: T.successSoft,
    successBorder: T.successBorder,
    textOnPrimary: T.textOnPrimary,
    textOnDanger: T.textOnDanger,
  };

  /* ── Active-ticket pre-check ─────────────────────────────── */
  const checkActiveTicket = async (userId: number) => {
    setLoadingActiveTicket(true);
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/patient/${userId}/active-ticket`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      if (res.ok) {
        const data = await res.json();
        setActiveTicket(data.hasActiveTicket ? data.ticket : null);
      } else {
        setActiveTicket(null);
      }
    } catch (_) {
      setActiveTicket(null);
    } finally {
      setLoadingActiveTicket(false);
    }
  };

  const resetIntake = () => {
    setVerifiedPatient(null);
    setPendingAppointment(null);
    setCheckInSuccess(null);
    setWalkInSuccess(null);
    setActiveTicket(null);
    setBp('');
    setTemp('');
    setPulse('');
    setSpo2('');
    setRespRate('');
    setSex('');
    setHeight('');
    setWeight('');
    setLastVerifiedAt('');
    setTouchedVitals({});
    setRejectedVitals({});
  };

  /* ── Verify QR token ─────────────────────────────────────── */
  const verifyToken = async (tokenToVerify: string) => {
    if (submittingIntake.current || !tokenToVerify?.trim()) return;
    resetIntake();
    setScanStatus('Verifying cryptographic QR pass signature...');
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/health-pass/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({ qrToken: tokenToVerify.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.verified) {
        setVerifiedPatient(data.patient);
        setSex(data.patient?.sex || '');
        onPatientVerified(data.patient, tokenToVerify.trim());
        setScanStatus('Patient identity verified.');
        setLastVerifiedAt(data.patient?.health_profile_updated_at || '');
        stopCamera();
        // Fetch active ticket + pending appointment in parallel
        await Promise.all([
          checkActiveTicket(data.patient.user_id),
          checkPatientAppointments(data.patient.user_id),
        ]);
      } else {
        setScanStatus('Verification failed: ' + (data.error || 'Invalid or expired QR pass'));
      }
    } catch (err: any) {
      setScanStatus('Connection error: ' + err.message);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingIntake.current || !searchQuery.trim()) return;
    resetIntake();
    setScanStatus('Searching student records...');

    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/lookup?query=${encodeURIComponent(searchQuery.trim())}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        const app = data[0];
        setVerifiedPatient({
          user_id: app.user_id,
          first_name: app.first_name,
          last_name: app.last_name,
          student_no: app.student_no,
          course: app.course,
          blood_type: app.blood_type,
          allergies: app.allergies,
          chronic_conditions: app.chronic_conditions,
          height: app.height,
          weight: app.weight,
          sex: app.sex,
        });
        setPendingAppointment(app);
        setScanStatus(`Patient record located: ${app.first_name} ${app.last_name}`);
        setSex(app.sex || '');
        setLastVerifiedAt(app.health_profile_updated_at || '');
        await checkActiveTicket(app.user_id);
      } else {
        setScanStatus('No scheduled appointments found matching that query.');
      }
    } catch (err: any) {
      // Feature 6: Offline SQLite Fallback for Intake Station
      if (window.electronAPI?.offlineSearchPatients) {
        try {
          const offlineMatches = await window.electronAPI.offlineSearchPatients(searchQuery.trim());
          if (offlineMatches.length > 0) {
            const p = offlineMatches[0];
            setVerifiedPatient({
              user_id: p.user_id,
              first_name: p.first_name,
              last_name: p.last_name,
              student_no: p.student_no,
              course: p.course,
              blood_type: p.blood_type,
              allergies: p.allergies,
              chronic_conditions: p.chronic_conditions,
              height: null,
              weight: null,
              sex: null,
            });
            setPendingAppointment(null); // Offline walk-in mode
            setScanStatus(`[Offline Cache] Patient located: ${p.first_name} ${p.last_name} (${p.student_no})`);
            return;
          }
        } catch (sqliteErr) {
          console.error('[SQLite Intake Search Error]:', sqliteErr);
        }
      }
      setScanStatus('Search error: ' + err.message);
    }
  };

  const checkPatientAppointments = async (userId: number) => {
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/lookup?userId=${userId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setPendingAppointment(data[0]);
        if (data[0]?.health_profile_updated_at) setLastVerifiedAt(data[0].health_profile_updated_at);
        if (data[0]?.sex) setSex(data[0].sex);
      } else {
        setPendingAppointment(null);
      }
    } catch (_) {}
  };

  const checkVitalInputs = () => {
    if (!intakeBlocked) return true;
    setTouchedVitals(Object.fromEntries(invalidFields.map((field) => [field, true])));
    document.getElementById(`${vitalId}-${invalidFields[0]}`)?.focus();
    return false;
  };

  const handleConfirmArrival = async () => {
    if (!pendingAppointment || submittingIntake.current || !checkVitalInputs()) return;
    submittingIntake.current = true;
    setIsCheckingIn(true);
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${pendingAppointment.appointment_id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          ...measurements,
          blood_pressure: bloodPressure,
          sex: sex || null,
        }),
      });

      const data = await res.json();

      // Race-condition path: server rejected because patient is already in queue
      if (res.status === 409) {
        setScanStatus('' + data.error);
        if (verifiedPatient) await checkActiveTicket(verifiedPatient.user_id);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to check in patient.');

      setCheckInSuccess(`Arrival confirmed! Ticket ${data.queueTicket} assigned at ${data.arrivalTime}.`);
      setPendingAppointment({ ...pendingAppointment, status: 'checked_in' });
      if (verifiedPatient) await checkActiveTicket(verifiedPatient.user_id);
    } catch (err: any) {
      setScanStatus('' + err.message);
    } finally {
      submittingIntake.current = false;
      setIsCheckingIn(false);
    }
  };

  /* ── Register as walk-in ─────────────────────────────────── */
  const handleRegisterWalkIn = async () => {
    if (!verifiedPatient || submittingIntake.current || !checkVitalInputs()) return;
    submittingIntake.current = true;
    setIsRegisteringWalkIn(true);
    setWalkInSuccess(null);
    const jwt = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/walk-in`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          patient_user_id: verifiedPatient.user_id,
          visit_type: 'Walk-in Consultation',
          sex: sex || null,
          vitals: triageVitals.values,
        }),
      });
      const data = await res.json();

      // Race-condition path: server rejected because patient is already in queue
      if (res.status === 409) {
        setScanStatus('' + data.error);
        await checkActiveTicket(verifiedPatient.user_id);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to register walk-in patient.');

      setWalkInSuccess(`Walk-in registered! Ticket ${data.queueTicket} at ${data.arrivalTime}.`);
      await checkActiveTicket(verifiedPatient.user_id);
    } catch (err: any) {
      setScanStatus('' + err.message);
    } finally {
      submittingIntake.current = false;
      setIsRegisteringWalkIn(false);
    }
  };

  const { startCamera, stopCamera, readFile } = useQrCapture(videoRef, canvasRef, {
    onCode: verifyToken,
    onActive: setIsCameraActive,
    onError: setCameraError,
    onStatus: setScanStatus,
  });
  const handleQrFileUpload = (file: File) => { void readFile(file); };

  const formatLastVerified = (raw: string): string => {
    if (!raw) return '';
    try {
      const dt = new Date(raw);
      const diff = Date.now() - dt.getTime();
      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const dateStr = dt.toLocaleDateString();
      if (days < 1) return `Today (${dateStr})`;
      if (days < 7) return `${days}d ago (${dateStr})`;
      if (days < 365) return `${Math.floor(days / 30)}mo ago (${dateStr})`;
      return `${(days / 365).toFixed(1)}y ago (${dateStr})`;
    } catch {
      return raw;
    }
  };

  /* ── Derived status ──────────────────────────────────────── */
  const statusIsOk = scanStatus.includes('');
  const statusIsErr = scanStatus.includes('');
  const statusIsWarn = scanStatus.includes('');

  const updateVital = (field: TriageVitalField, draft: string) => {
    const error = triageDraftError(field, draft);
    setRejectedVitals((previous) => {
      const next = { ...previous };
      if (error) next[field] = error;
      else delete next[field];
      return next;
    });
    if (!error) vitalFields[field].set(draft);
  };

  const intakeError = intakeBlocked && (
    <p id={`${vitalId}-intake-error`} role="status" style={{ color: C.danger, fontSize: 12 }}>
      Correct or clear the following readings before continuing: {invalidFields.map((field) => vitalFields[field].label).join(', ')}.
    </p>
  );

  const triageFields = (
    <TriageVitalsFields
      C={C}
      verifiedPatient={verifiedPatient}
      sex={sex}
      setSex={setSex}
      vitalFields={vitalFields}
      vitalId={vitalId}
      rejectedVitals={rejectedVitals}
      touchedVitals={touchedVitals}
      vitalErrors={vitalErrors}
      isCheckingIn={isCheckingIn}
      isRegisteringWalkIn={isRegisteringWalkIn}
      updateVital={updateVital}
      setTouchedVitals={setTouchedVitals}
      bmi={bmi}
      bmiPrompt={bmiPrompt}
      bmiCategory={bmiCategory}
    />
  );

  /* ── Render ──────────────────────────────────────────────── */
  return (
    <section
      style={{
        background: C.surface,
        borderRadius: 22,
        padding: 22,
        display: 'flex',
        flexDirection: 'column',
        gap: 18,
        boxShadow: '0 1px 2px rgba(15,30,23,0.03), 0 4px 16px rgba(15,30,23,0.04)',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <div
            style={{
              width: 42,
              height: 42,
              borderRadius: 14,
              background: C.primaryTint,
              display: 'grid',
              placeItems: 'center',
              flexShrink: 0,
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke={C.primary}
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 20, height: 20 }}
            >
              <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
              <circle cx="12" cy="13" r="4" />
            </svg>
          </div>
          <div>
            <h3
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 800,
                color: C.text,
                letterSpacing: '-0.2px',
              }}
            >
              Patient intake & check-in
            </h3>
            <p style={{ margin: '2px 0 0', fontSize: 12.5, color: C.textSub }}>
              Scan the student's dynamic pass on arrival.
            </p>
          </div>
        </div>

        {/* Mode pill switcher */}
        <div
          style={{
            display: 'flex',
            gap: 4,
            padding: 3,
            background: C.sage100,
            borderRadius: 999,
          }}
        >
          {[
            { id: 'camera' as const, label: 'Scan' },
            { id: 'search' as const, label: 'Search ID' },
          ].map((tab) => {
            const isActive = scanMode === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  setScanMode(tab.id);
                  stopCamera();
                  setScanStatus('');
                }}
                style={{
                  padding: '6px 14px',
                  borderRadius: 999,
                  border: 'none',
                  background: isActive ? C.surface : 'transparent',
                  color: isActive ? C.primary : C.textSub,
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  fontFamily: 'inherit',
                  boxShadow: isActive ? '0 1px 2px rgba(15,30,23,0.06)' : 'none',
                  transition: 'all 120ms ease',
                }}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Camera viewport */}
      {scanMode === 'camera' && (
        <div>
          <div
            style={{
              position: 'relative',
              width: '100%',
              aspectRatio: '16 / 9',
              maxHeight: 320,
              background: C.primaryDark,
              borderRadius: 22,
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
            }}
          >
            <video
              ref={videoRef}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                display: isCameraActive ? 'block' : 'none',
              }}
            />
            <canvas ref={canvasRef} style={{ display: 'none' }} />

            {!isCameraActive && (
              <div style={{ textAlign: 'center', color: 'rgba(255,255,255,0.72)' }}>
                <div
                  style={{
                    width: 56,
                    height: 56,
                    margin: '0 auto 12px',
                    border: '2px dashed rgba(255,255,255,0.35)',
                    borderRadius: 14,
                    display: 'grid',
                    placeItems: 'center',
                    color: 'rgba(255,255,255,0.7)',
                  }}
                >
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 24, height: 24 }}
                  >
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <div style={{ fontSize: 14, fontWeight: 600 }}>Camera is off</div>
                <div style={{ fontSize: 12, opacity: 0.7, marginTop: 4 }}>
                  Turn on the webcam to scan the QR pass
                </div>
              </div>
            )}

            {isCameraActive && (
              <div
                style={{
                  position: 'absolute',
                  inset: 30,
                  border: '2px solid rgba(255,255,255,0.55)',
                  borderRadius: 22,
                  pointerEvents: 'none',
                }}
              />
            )}
          </div>

          {cameraError && (
            <div
              style={{
                marginTop: 12,
                padding: '10px 14px',
                background: C.dangerSoft,
                color: C.danger,
                borderRadius: 12,
                fontSize: 12.5,
                border: `1px solid ${C.dangerBorder}`,
              }}
            >
              {cameraError}
            </div>
          )}
        </div>
      )}

      {/* Search mode */}
      {scanMode === 'search' && (
        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: 10 }}>
          <input
            style={{
              flex: 1,
              boxSizing: 'border-box',
              padding: '10px 16px',
              fontSize: 13.5,
              color: C.text,
              background: C.surface,
              border: `1px solid ${C.border}`,
              borderRadius: 999,
              outline: 'none',
              fontFamily: 'inherit',
            }}
            placeholder="Enter student ID (e.g. 22-LN-0123) or last name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '10px 20px',
              borderRadius: 999,
              background: C.primary,
              color: C.textOnPrimary,
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Search
          </button>
        </form>
      )}

      {/* Action buttons row */}
{scanMode === 'camera' && (
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 16,
          flexWrap: 'wrap',
          marginTop: 4,
        }}
      >
        {!isCameraActive ? (
          <button
            type="button"
            onClick={startCamera}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 22px',
              borderRadius: 999,
              background: C.primary,
              color: C.textOnPrimary,
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
              boxShadow: '0 6px 16px rgba(31,74,52,0.18)',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <path d="M5 3l14 9-14 9V3z" />
            </svg>
            Turn on camera
          </button>
        ) : (
          <button
            type="button"
            onClick={stopCamera}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              padding: '11px 22px',
              borderRadius: 999,
              background: C.danger,
              color: C.textOnDanger,
              border: 'none',
              fontSize: 13,
              fontWeight: 700,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ width: 14, height: 14 }}
            >
              <rect x="5" y="5" width="14" height="14" rx="2" />
            </svg>
            Stop camera
          </button>
        )}

        <label
          style={{
            fontSize: 12.5,
            color: C.textSub,
            cursor: 'pointer',
            fontWeight: 600,
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ width: 14, height: 14 }}
          >
            <rect x="3" y="3" width="6" height="6" rx="1" />
            <rect x="15" y="3" width="6" height="6" rx="1" />
            <rect x="3" y="15" width="6" height="6" rx="1" />
            <path d="M15 15h2v2h-2zM19 19h2v2h-2zM19 15h2M15 19v2" />
          </svg>
          Scan QR from file
          <input
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleQrFileUpload(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
)}

      {/* Status line */}
      {scanStatus && (
        <div
          style={{
            marginTop: 4,
            padding: '10px 14px',
            borderRadius: 12,
            fontSize: 12.5,
            fontWeight: 700,
            background: statusIsOk
              ? C.successSoft
              : statusIsErr
              ? C.dangerSoft
              : statusIsWarn
              ? C.warningSoft
              : C.sage100,
            color: statusIsOk
              ? C.success
              : statusIsErr
              ? C.danger
              : statusIsWarn
              ? C.warning
              : C.textSub,
            border: `1px solid ${
              statusIsOk
                ? C.successBorder
                : statusIsErr
                ? C.dangerBorder
                : statusIsWarn
                ? C.warningBorder
                : 'transparent'
            }`,
          }}
        >
          {scanStatus}
        </div>
      )}

      {/* Verified patient card */}
      {verifiedPatient && (
        <div
          style={{
            marginTop: 4,
            padding: 18,
            background: C.sage50,
            border: `1px solid ${C.border}`,
            borderRadius: 18,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 14,
            }}
          >
            <div>
              <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: C.text }}>
                {verifiedPatient.first_name} {verifiedPatient.last_name}
              </h4>
              <div style={{ fontSize: 12, color: C.textSub, marginTop: 3 }}>
                {verifiedPatient.student_no || 'Staff'} · {verifiedPatient.course}
              </div>
            </div>
            {lastVerifiedAt && (
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 999,
                  background: C.sage200,
                  color: C.primary,
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                Last verified: {formatLastVerified(lastVerifiedAt)}
              </span>
            )}
          </div>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(4, 1fr)',
              gap: 12,
              marginBottom: 16,
            }}
          >
            {[
              {
                label: 'Blood type',
                value: verifiedPatient.blood_type || 'Not recorded',
                color: C.text,
              },
              {
                label: 'Allergies',
                value: verifiedPatient.allergies || 'None reported',
                color:
                  verifiedPatient.allergies && verifiedPatient.allergies !== 'None'
                    ? C.danger
                    : C.success,
              },
              {
                label: 'Height',
                value: verifiedPatient.height ? `${verifiedPatient.height} cm` : '—',
                color: C.text,
              },
              {
                label: 'Weight',
                value: verifiedPatient.weight ? `${verifiedPatient.weight} kg` : '—',
                color: C.text,
              },
              {
                label: 'Sex',
                value: sex || 'Not recorded',
                color: C.text,
              },
              {
                label: 'BMI',
                value: bmi === null ? '—' : `${bmi.toFixed(1)} · ${bmiCategory}`,
                color: C.text,
              },
            ].map((item) => (
              <div key={item.label}>
                <div
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    color: C.textMuted,
                    letterSpacing: 1.2,
                    textTransform: 'uppercase',
                  }}
                >
                  {item.label}
                </div>
                <div
                  style={{
                    fontSize: 14,
                    fontWeight: 800,
                    color: item.color,
                    marginTop: 3,
                  }}
                >
                  {item.value}
                </div>
              </div>
            ))}
          </div>

          {/* ── Pre-check: active ticket already exists ────────── */}
          {loadingActiveTicket ? (
            <div
              style={{
                padding: '14px 16px',
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
                fontSize: 12.5,
                color: C.textSub,
                display: 'flex',
                alignItems: 'center',
                gap: 10,
              }}
            >
              <div
                style={{
                  width: 16,
                  height: 16,
                  border: `2px solid ${C.primaryTint}`,
                  borderTopColor: C.primary,
                  borderRadius: '50%',
                  animation: 'spin 0.8s linear infinite',
                  flexShrink: 0,
                }}
              />
              Checking patient's queue status…
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : activeTicket ? (
            /* ── STATE: Already in queue ─────────────────────── */
            <div
              style={{
                padding: 16,
                background: C.warningSoft,
                border: `1px solid ${C.warningBorder}`,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <b style={{ fontSize: 13, color: C.warning, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 16 }}><Icon name="warning" size={14} /></span>
                  Patient already in today's queue
                </b>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: C.warning,
                    color: C.textOnPrimary,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {activeTicket.status.replace('-', ' ')}
                </span>
              </div>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1,
                      color: C.warning,
                      textTransform: 'uppercase',
                      marginBottom: 2,
                    }}
                  >
                    Queue ticket
                  </div>
                  <div
                    style={{
                      fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace',
                      fontSize: 22,
                      fontWeight: 800,
                      color: C.warning,
                    }}
                  >
                    {activeTicket.ticket_no}
                  </div>
                </div>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1,
                      color: C.warning,
                      textTransform: 'uppercase',
                      marginBottom: 2,
                    }}
                  >
                    Arrived
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: C.text }}>
                    {activeTicket.arrival_time}
                  </div>
                </div>
                <div style={{ gridColumn: 'span 2' }}>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 800,
                      letterSpacing: 1,
                      color: C.warning,
                      textTransform: 'uppercase',
                      marginBottom: 2,
                    }}
                  >
                    Visit & attending
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                    {activeTicket.visit_type} · {activeTicket.doctor_name}
                  </div>
                </div>
              </div>

              <p style={{ margin: 0, fontSize: 12, color: C.textSub, lineHeight: 1.5 }}>
                No new ticket was created. The patient is already being tracked in the live
                triage queue — no further action needed here.
              </p>
            </div>
          ) : pendingAppointment ? (
            /* ── STATE: Pending scheduled appointment ────────── */
            <div
              style={{
                padding: 16,
                background: C.surface,
                border: `1px solid ${C.border}`,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 10,
                }}
              >
                <b style={{ fontSize: 13, color: C.primary }}>Scheduled booking detected</b>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background:
                      pendingAppointment.status === 'checked_in' ? C.successSoft : C.warningSoft,
                    color:
                      pendingAppointment.status === 'checked_in' ? C.success : C.warning,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  {pendingAppointment.status}
                </span>
              </div>

              <p style={{ margin: '4px 0', fontSize: 13, color: C.text }}>
                <b>Time:</b> {pendingAppointment.formatted_schedule || pendingAppointment.date_time}
              </p>
              <p style={{ margin: '4px 0 14px', fontSize: 13, color: C.text }}>
                <b>Purpose:</b> {pendingAppointment.appointment_type} · Dr.{' '}
                {pendingAppointment.doc_last_name || 'Mata'}
              </p>

              {pendingAppointment.status !== 'checked_in' && (
                <>
                  {triageFields}
                </>
              )}

              {pendingAppointment.status === 'checked_in' ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: C.success,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: '12px 16px',
                    background: C.successSoft,
                    borderRadius: 14,
                    border: `1px solid ${C.successBorder}`,
                  }}
                >
                  {checkInSuccess || 'Patient is checked in and waiting in queue.'}
                </div>
              ) : (
                <form id={`${vitalId}-intake`} onSubmit={(event) => { event.preventDefault(); void handleConfirmArrival(); }}>
                {intakeError}
                <button
                  type="submit"
                  disabled={intakeBlocked || isCheckingIn}
                  aria-describedby={intakeBlocked ? `${vitalId}-intake-error` : undefined}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 999,
                    background: intakeBlocked || isCheckingIn ? C.sage400 : C.primary,
                    color: C.textOnPrimary,
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: intakeBlocked || isCheckingIn ? 'not-allowed' : 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  {isCheckingIn ? 'Confirming arrival…' : 'Confirm arrival & check-in patient'}
                </button>
                </form>
              )}
            </div>
          ) : (
            /* ── STATE: Walk-in (no active ticket, no booking) ─ */
            <div
              style={{
                padding: 16,
                background: C.surface,
                border: `1px solid ${C.primaryTint}`,
                borderRadius: 14,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                }}
              >
                <b style={{ fontSize: 13, color: C.primary }}>No scheduled appointment today</b>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: C.primaryTint,
                    color: C.primary,
                    fontWeight: 800,
                    textTransform: 'uppercase',
                    letterSpacing: 0.3,
                  }}
                >
                  Walk-in
                </span>
              </div>

              <p style={{ margin: '0 0 14px', fontSize: 12.5, color: C.textSub, lineHeight: 1.5 }}>
                The student has no booking on file. Capture triage vitals and register them as a
                walk-in — they'll be added to today's live queue.
              </p>

              {walkInSuccess ? (
                <div
                  style={{
                    textAlign: 'center',
                    color: C.success,
                    fontWeight: 700,
                    fontSize: 13,
                    padding: '14px 16px',
                    background: C.successSoft,
                    borderRadius: 14,
                    border: `1px solid ${C.successBorder}`,
                  }}
                >
                  {walkInSuccess}
                </div>
              ) : (
                <form id={`${vitalId}-intake`} onSubmit={(event) => { event.preventDefault(); void handleRegisterWalkIn(); }}>
                  {triageFields}
                  {intakeError}

                  <button
                    type="submit"
                    disabled={intakeBlocked || isRegisteringWalkIn}
                    aria-describedby={intakeBlocked ? `${vitalId}-intake-error` : undefined}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 999,
                      background: intakeBlocked || isRegisteringWalkIn ? C.sage400 : C.primary,
                      color: C.textOnPrimary,
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: intakeBlocked || isRegisteringWalkIn ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {isRegisteringWalkIn
                      ? 'Registering walk-in…'
                      : 'Register as walk-in patient'}
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
