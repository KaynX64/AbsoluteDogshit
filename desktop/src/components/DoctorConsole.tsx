// desktop/src/components/DoctorConsole.tsx
import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import PrescriptionGenerator from './PrescriptionGenerator';
import { io } from 'socket.io-client';
import AnalyticsDashboard from './AnalyticsDashboard';
import EmergencyAlertBanner from './EmergencyAlertBanner';
import { queueOfflineMutation } from '../services/offlineSync';
import { T, btnPrimary, btnGhost, inputStyle } from '../theme';
import { API_BASE_URL, SOCKET_URL } from '../config/api';
import SignatureEnrollment from './SignatureEnrollment';
import Icon from './Icon';

/* ── ODONTOGRAM TYPES (declared before use) ─────────────────── */
export type ToothCondition =
  | 'sound'
  | 'caries'
  | 'filled'
  | 'missing'
  | 'extraction_needed'
  | 'prophylaxis';

export interface ToothRecord {
  number: number;
  condition: ToothCondition;
  notes?: string;
}

export type DoctorViewMode =
  | 'active'
  | 'scheduled'
  | 'history'
  | 'archive'
  | 'analytics';

interface AppointmentItem {
  appointment_id: number;
  time_slot: string;
  date_str: string;
  date_time: string;
  appointment_type: string;
  status: string;
  notes: string;
  cancelled_reason?: string;
  patient_id: number;
  first_name: string;
  last_name: string;
  phone: string;
  student_no: string;
  course: string;
  blood_type: string;
  allergies: string;
  chronic_conditions: string;
  height: number;
  weight: number;
  sex?: 'MALE' | 'FEMALE' | null;
  date_of_birth?: string | null;
  age?: number | null;
  bmi?: number | null;
  bmi_category?: string | null;
  health_profile_updated_at?: string;
  queue_ticket?: string;
  queue_status?: string;
  past_chief_complaint?: string;
  past_diagnosis?: string;
  past_treatment?: string;
  past_dental_chart?: Record<number, ToothRecord> | null;
  past_clinical_notes?: string;
  past_dietary_notes?: string;
}

interface DoctorConsoleProps {
  viewMode?: DoctorViewMode;
  onViewModeChange?: (m: DoctorViewMode) => void;
  currentRole?: string;
}

/* ── Status pill styling ────────────────────────────────────── */
const STATUS_STYLE = (status: string) => {
  switch (status) {
    case 'scheduled':
      return { text: 'AWAITING NURSE', bg: T.warningSoft, color: T.warning };
    case 'serving':
      return { text: 'IN CONSULTATION', bg: T.successSoft, color: T.success };
    case 'checked_in':
      return { text: 'TRIAGED · READY', bg: T.infoSoft, color: T.info };
    case 'completed':
      return { text: 'COMPLETED', bg: T.successSoft, color: T.success };
    case 'cancelled':
      return { text: 'CANCELLED', bg: T.dangerSoft, color: T.danger };
    case 'no_show':
      return { text: 'NO SHOW', bg: T.sage100, color: T.textSub };
    default:
      return { text: status.toUpperCase(), bg: T.sage100, color: T.textSub };
  }
};

/* Quick-add catalogue for the immunization modal */
const COMMON_VACCINES = [
  'COVID-19 Primary Series',
  'COVID-19 Booster',
  'Influenza (Flu) 2026',
  'Hepatitis B',
  'Tetanus Toxoid',
  'Measles-Mumps-Rubella (MMR)',
  'Varicella (Chickenpox)',
  'HPV',
  'Pneumococcal',
  'Rabies (Post-exposure)',
  'Meningococcal',
  'Typhoid',
];

/* Odontogram colour palette — sourced from theme tokens for palette cohesion. */
const CONDITION_COLORS: Record<
  ToothCondition,
  { bg: string; text: string; label: string; border: string }
> = {
  sound: {
    bg: T.sage100,
    text: T.primaryMid,
    border: T.sage300,
    label: 'Sound',
  },
  caries: {
    bg: T.dangerSoft,
    text: T.danger,
    border: T.dangerBorder,
    label: 'Caries (Decay)',
  },
  filled: {
    bg: T.infoSoft,
    text: T.info,
    border: T.infoBorder,
    label: 'Restored / Filled',
  },
  missing: {
    bg: T.surface2,
    text: T.textSub,
    border: T.border,
    label: 'Missing / Extracted',
  },
  extraction_needed: {
    bg: T.warningSoft,
    text: T.warning,
    border: T.warningBorder,
    label: 'Needs Extraction',
  },
  prophylaxis: {
    bg: T.tonalTealBg,
    text: T.tonalTealFg,
    border: '#9FD9CB',
    label: 'Calculus / Prophylaxis',
  },
};

const UPPER_TEETH = Array.from({ length: 16 }, (_, i) => i + 1); // 1-16
const LOWER_TEETH = Array.from({ length: 16 }, (_, i) => 32 - i); // 32-17

const DEFAULT_CHIEF_COMPLAINT =
  'Moderate grade fever (38.4 C), sore throat, rhinorrhea, and non-productive hacking cough x 3 days.';
const DEFAULT_DIAGNOSIS =
  'Acute Viral Upper Respiratory Tract Infection / Pharyngitis (ICD-10 J06.9).';
const DEFAULT_TREATMENT_PLAN = [
  '1. Paracetamol 500mg tab 1 tab q4h PRN for fever > 37.8 C.',
  '2. Cetirizine 10mg tab once daily at bedtime x 5 days.',
  '3. Warm salt water gargles TID; increase oral hydration to 2.5L/day.',
  '4. Advised rest and excuse slip issued for classes.',
].join('\n');

/* Strip any legacy inline odontogram text out of treatment plans */
function stripLegacyOdontogram(text: string): string {
  return (text || '').replace(/\n*\[DENTAL ODONTOGRAM CHART\]:[^\n]*/g, '').trim();
}

function isDefaultDiagnosis(text: string): boolean {
  return text.trim().replace(/[.\s]+$/, '') === DEFAULT_DIAGNOSIS.replace(/[.\s]+$/, '');
}

export default function DoctorConsole({
  viewMode: controlledView,
  currentRole,
}: DoctorConsoleProps = {}) {
  const [internalView] = useState<DoctorViewMode>('active');
  const viewMode = controlledView ?? internalView;
  const [showSignature, setShowSignature] = useState(false);
  const [signatureStatus, setSignatureStatus] = useState<'checking' | 'enrolled' | 'missing' | 'error'>('checking');
  const [signatureStatusError, setSignatureStatusError] = useState<string | null>(null);

  /* Safe dentist detection: prop first, then JWT fallback */
  const isDentist = currentRole
    ? currentRole === 'DENTIST'
    : (() => {
        try {
          const token = localStorage.getItem('valetudo_token');
          if (!token) return false;
          const payload = JSON.parse(atob(token.split('.')[1]));
          return (
            payload.roles?.includes('DENTIST') &&
            !payload.roles?.includes('DOCTOR')
          );
        } catch {
          return false;
        }
      })();

  /* ── Appointments state ─────────────────────────────────────── */
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppointmentItem | null>(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  /* ── Encounter form state ───────────────────────────────────── */
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [encounterConfirmation, setEncounterConfirmation] = useState<string[] | null>(null);
  const [isSubmittingEMR, setIsSubmittingEMR] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    type: 'success' | 'error';
    pdfKind?: 'prescriptions' | 'clearances';
    pdfId?: number;
  } | null>(null);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  /* ── Attachment preview modal ──────────────────────────────── */
  const [previewModal, setPreviewModal] = useState<{
    url: string;
    fileName: string;
    mimeType: string;
  } | null>(null);

  /* ── In-consultation diagnostic attachments ───────────────── */
  const [activePatientAttachments, setActivePatientAttachments] = useState<any[]>([]);
  const [openingAttachmentId, setOpeningAttachmentId] = useState<number | null>(null);

  /* ── Odontogram state ──────────────────────────────────────── */
  const [dentalChartData, setDentalChartData] = useState<Record<number, ToothRecord>>({});
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);
  const [forceShowDentalChart, setForceShowDentalChart] = useState(false);

  /* ── Vitals state ──────────────────────────────────────────── */
  const [bpSystolic, setBpSystolic] = useState('');
  const [bpDiastolic, setBpDiastolic] = useState('');
  const [temperature, setTemperature] = useState('');
  const [pulseRate, setPulseRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [respRate, setRespRate] = useState('');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');

  /* ── Issuance tab state ────────────────────────────────────── */
  const [docType, setDocType] = useState<'rx' | 'clearance'>('rx');
  const [clearancePurpose, setClearancePurpose] = useState(
    'On-the-Job Training (OJT) Medical Clearance'
  );
  const [clearanceRemarks, setClearanceRemarks] = useState(
    'Physically fit to undergo university practicum requirements.'
  );
  const [isIssuingClearance, setIsIssuingClearance] = useState(false);
  const [clearanceExpiryDate, setClearanceExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  });

  useEffect(() => {
    let active = true;

    const checkSignatureStatus = async () => {
      try {
        const token = localStorage.getItem('valetudo_token');
        if (!token) throw new Error('Your session is unavailable. Please sign in again.');

        const res = await fetch(`${API_BASE_URL}/api/signature/me/status`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not verify signature status.');

        if (active) {
          setSignatureStatus(data.enrolled ? 'enrolled' : 'missing');
          setSignatureStatusError(null);
        }
      } catch (error) {
        if (active) {
          setSignatureStatus('error');
          setSignatureStatusError(
            error instanceof Error ? error.message : 'Could not verify signature status.'
          );
        }
      }
    };

    void checkSignatureStatus();
    return () => {
      active = false;
    };
  }, []);

  /* ── History modal ─────────────────────────────────────────── */
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  /* ── Prescription history modal (issuer-only) ──────────────── */
  const [showRxHistoryModal, setShowRxHistoryModal] = useState(false);
  const [rxHistory, setRxHistory] = useState<any[]>([]);
  const [loadingRxHistory, setLoadingRxHistory] = useState(false);
  const [rxHistoryPatientName, setRxHistoryPatientName] = useState('');
  const [rxHistoryError, setRxHistoryError] = useState<string | null>(null);

  /* ── Clearance history modal (issuer-only) ─────────────────── */
  const [showClrHistoryModal, setShowClrHistoryModal] = useState(false);
  const [clrHistory, setClrHistory] = useState<any[]>([]);
  const [loadingClrHistory, setLoadingClrHistory] = useState(false);
  const [clrHistoryPatientName, setClrHistoryPatientName] = useState('');
  const [clrHistoryError, setClrHistoryError] = useState<string | null>(null);

  /* ── Archive (patient directory) state ────────────────────── */
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [selectedDirectoryPatient, setSelectedDirectoryPatient] = useState<any | null>(null);
  const [directoryTimeline, setDirectoryTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  /* ── Immunization modal state (single source of truth) ────── */
  const [showImmunizationModal, setShowImmunizationModal] = useState(false);
  const [patientImmunizations, setPatientImmunizations] = useState<string[]>([]);
  const [newImmunizations, setNewImmunizations] = useState<string[]>([]);
  const [customImmunizationInput, setCustomImmunizationInput] = useState('');
  const [loadingImmunizations, setLoadingImmunizations] = useState(false);
  const [savingImmunizations, setSavingImmunizations] = useState(false);
  const [immunizationFeedback, setImmunizationFeedback] = useState<{
    text: string;
    type: 'success' | 'error';
  } | null>(null);

  /* ═══════════════════════════════════════════════════════════ */
  /* DATA FETCHERS                                               */
  /* ═══════════════════════════════════════════════════════════ */

  const fetchAppointments = async (mode = viewMode, retainSelection = true) => {
    if (mode === 'analytics') return;
    setLoadingAppointments(true);
    const token = localStorage.getItem('valetudo_token');
    let url = `${API_BASE_URL}/api/appointments/today?filter=active`;
    if (mode === 'history') url = `${API_BASE_URL}/api/appointments/today?filter=history`;
    else if (mode === 'scheduled') url = `${API_BASE_URL}/api/appointments/today?filter=scheduled`;

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        const unique = Array.from(
          new Map(data.map((item: AppointmentItem) => [item.appointment_id, item])).values()
        ) as AppointmentItem[];
        setAppointments(unique);

        if (unique.length > 0) {
          if (!retainSelection || !selectedApp) {
            selectPatient(unique[0]);
          } else {
            const updated = unique.find(
              (a) => a.appointment_id === selectedApp.appointment_id
            );
            selectPatient(updated || unique[0]);
          }
        } else {
          setSelectedApp(null);
          resetForm();
        }
      }
    } catch (err) {
      console.error('Error fetching appointments:', err);
    } finally {
      setLoadingAppointments(false);
    }
  };

  useEffect(() => {
    fetchAppointments(viewMode, false);
    const token = localStorage.getItem('valetudo_token');
    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('appointment:booked', () => fetchAppointments(viewMode, true));
    socket.on('appointment:status_changed', (evt: any) => {
      fetchAppointments(viewMode, true);
      if (evt?.status === 'checked_in' && window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: 'Patient Triaged & Ready',
          body: 'A student booked under your care has been checked in by the triage nurse.',
        });
      }
    });
    socket.on('queue:updated', () => fetchAppointments(viewMode, true));
    socket.on('appointment:cancelled', () => fetchAppointments(viewMode, true));

    return () => {
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  useEffect(() => {
  const handleConflict = (e: Event) => {
    const customEvent = e as CustomEvent;
    const conflicts = customEvent.detail || [];
    
    if (conflicts.length > 0) {
      // Show a prominent UI warning to the doctor
      setFeedbackMsg({
        text: `Offline Sync Conflict: ${conflicts.length} record(s) were modified by someone else while you were offline, or failed to process. Please review the patient's current status manually.`,
        type: 'error' // Assuming your feedbackMsg supports 'error' type styling
      });
    }
  };

  window.addEventListener('offline-sync-conflict', handleConflict);
  return () => window.removeEventListener('offline-sync-conflict', handleConflict);
}, []);

  const resetForm = () => {
    setChiefComplaint('');
    setDiagnosis('');
    setTreatmentPlan('');
    setClinicalNotes('');
    setEncounterConfirmation(null);
    setAttachedFile(null);
    setFeedbackMsg(null);
    setDentalChartData({});
    setSelectedTooth(null);
    setActivePatientAttachments([]);
    setForceShowDentalChart(false);
  };

  const selectPatient = (app: AppointmentItem) => {
    setSelectedApp(app);

    let rawComplaint = app.past_chief_complaint || app.notes || '';
    if (rawComplaint.includes('[TRIAGE VITALS]')) {
      rawComplaint = rawComplaint.replace(/\[TRIAGE VITALS\][^\n]*\n?/, '').trim();
    }
    setChiefComplaint(
      rawComplaint.trim() === DEFAULT_CHIEF_COMPLAINT ? '' : rawComplaint
    );
    const pastDiagnosis = app.past_diagnosis || '';
    setDiagnosis(isDefaultDiagnosis(pastDiagnosis) ? '' : pastDiagnosis);
    const pastTreatment = stripLegacyOdontogram(app.past_treatment || '');
    setTreatmentPlan(
      pastTreatment.trim() === DEFAULT_TREATMENT_PLAN ? '' : pastTreatment
    );
    setClinicalNotes(app.past_clinical_notes || '');
    setEncounterConfirmation(null);
    setBpSystolic('');
    setBpDiastolic('');
    setTemperature('');
    setPulseRate('');
    setSpo2('');
    setRespRate('');
    setHeight(app.height ? String(app.height) : '');
    setWeight(app.weight ? String(app.weight) : '');
    setAttachedFile(null);
    setFeedbackMsg(null);
    setSelectedTooth(null);
    setForceShowDentalChart(false);

    /* Restore dentist-only odontogram when the server provided one */
    setDentalChartData(isDentist && app.past_dental_chart ? app.past_dental_chart : {});

    /* Check-in prepends a single triage line ahead of the appointment notes. */
    const triageNote = app.notes?.split('\n', 1)[0];
    if (triageNote?.startsWith('[TRIAGE VITALS] ')) {
      const bpMatch = triageNote.match(/BP:\s*(\d+)\/(\d+)/);
      if (bpMatch) {
        setBpSystolic(bpMatch[1]);
        setBpDiastolic(bpMatch[2]);
      }
      const tempMatch = triageNote.match(/Temp:\s*([0-9.]+)/);
      if (tempMatch) setTemperature(tempMatch[1]);
      const pulseMatch = triageNote.match(/Pulse:\s*(\d+)/);
      if (pulseMatch) setPulseRate(pulseMatch[1]);
      const spo2Match = triageNote.match(/SpO2:\s*([0-9.]+|—)/i);
      if (spo2Match) setSpo2(spo2Match[1] === '—' ? '' : spo2Match[1]);
      const respRateMatch = triageNote.match(/Resp:\s*([0-9.]+|—)/i);
      if (respRateMatch) setRespRate(respRateMatch[1] === '—' ? '' : respRateMatch[1]);
      const heightMatch = triageNote.match(/Height:\s*([0-9.]+|—)/);
      if (heightMatch) setHeight(heightMatch[1] === '—' ? '' : heightMatch[1]);
      const weightMatch = triageNote.match(/Weight:\s*([0-9.]+|—)/);
      if (weightMatch) setWeight(weightMatch[1] === '—' ? '' : weightMatch[1]);
    }

    fetchActivePatientAttachments(app.patient_id);
  };

  const fetchActivePatientAttachments = async (patientId: number) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patient/${patientId}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const emrs = await res.json();
        const allAtts: any[] = [];
        emrs.forEach((e: any) => {
          if (Array.isArray(e.attachments)) {
            e.attachments.forEach((att: any) => {
              allAtts.push({
                ...att,
                encounter_date: e.encounter_date,
                doctor_last_name: e.doctor_last_name,
                diagnosis: e.diagnosis,
              });
            });
          }
        });
        setActivePatientAttachments(allAtts);
      }
    } catch (_) {
      setActivePatientAttachments([]);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* ATTACHMENT PREVIEW                                          */
  /* ═══════════════════════════════════════════════════════════ */

  const handleOpenAttachment = async (
    attachmentId: number,
    fileName: string,
    mimeType?: string
  ) => {
    setOpeningAttachmentId(attachmentId);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/documents/attachments/${attachmentId}/download`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (!res.ok) throw new Error('Failed to download/decrypt diagnostic file.');
      const blob = await res.blob();
      const detectedMime =
        mimeType ||
        res.headers.get('content-type') ||
        (fileName.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

      const typedBlob = new Blob([blob], { type: detectedMime });
      const objectUrl = URL.createObjectURL(typedBlob);

      /* Revoke the previous object URL to avoid leaks */
      setPreviewModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: objectUrl, fileName, mimeType: detectedMime };
      });
    } catch (err: any) {
      alert(`Could not open ${fileName}: ${err.message}`);
    } finally {
      setOpeningAttachmentId(null);
    }
  };

  const handleClosePreviewModal = () => {
    if (previewModal?.url) URL.revokeObjectURL(previewModal.url);
    setPreviewModal(null);
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* ODONTOGRAM                                                  */
  /* ═══════════════════════════════════════════════════════════ */

  const handleToothConditionChange = (condition: ToothCondition) => {
    if (!selectedTooth) return;
    setDentalChartData((prev) => ({
      ...prev,
      [selectedTooth]: {
        number: selectedTooth,
        condition,
        notes: prev[selectedTooth]?.notes || '',
      },
    }));
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* CONSULTATION LIFECYCLE                                      */
  /* ═══════════════════════════════════════════════════════════ */

  const handleStartConsultation = async () => {
    if (!selectedApp) return;
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/${selectedApp.appointment_id}/status`,
        {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ status: 'serving' }),
        }
      );
      if (res.ok) {
        setSelectedApp({ ...selectedApp, status: 'serving' });
        fetchAppointments('active', true);
        setFeedbackMsg({ text: '▶ Consultation in progress.', type: 'success' });
      } else {
        const errData = await res.json();
        setFeedbackMsg({
          text: errData.error || 'Failed to begin consultation.',
          type: 'error',
        });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message, type: 'error' });
    }
  };

  const handleFinishConsultation = async (
    e?: React.FormEvent,
    confirmed = false
  ) => {
    e?.preventDefault();
    if (!selectedApp || isBookingMode) return;
    if (!confirmed) {
      const defaultedFields = [
        !chiefComplaint.trim() && `Chief complaint: ${DEFAULT_CHIEF_COMPLAINT}`,
        !diagnosis.trim() && `Clinical diagnosis: ${DEFAULT_DIAGNOSIS}`,
        !treatmentPlan.trim() && `Treatment plan: ${DEFAULT_TREATMENT_PLAN}`,
      ].filter((field): field is string => Boolean(field));
      setEncounterConfirmation(defaultedFields);
      return;
    }
    setEncounterConfirmation(null);
    setIsSubmittingEMR(true);
    setFeedbackMsg(null);
    const token = localStorage.getItem('valetudo_token');

    const chartedTeeth = Object.values(dentalChartData).filter(
      (t) => t.condition !== 'sound'
    );

    const encounterPayload = {
      patient_user_id: selectedApp.patient_id,
      appointment_id: selectedApp.appointment_id,
      chief_complaint: chiefComplaint.trim() || DEFAULT_CHIEF_COMPLAINT,
      diagnosis: diagnosis.trim() || DEFAULT_DIAGNOSIS,
      treatment_plan: treatmentPlan.trim() || DEFAULT_TREATMENT_PLAN,
      notes: clinicalNotes,
      dental_chart:
        isDentist && chartedTeeth.length > 0 ? dentalChartData : undefined,
    };

    if (!navigator.onLine) {
      queueOfflineMutation({
        table_name: 'EMR_RECORDS',
        record_uuid: crypto.randomUUID(),
        action: 'CREATE',
        payload: encounterPayload,
      });
      setSelectedApp({ ...selectedApp, status: 'completed' });
      resetForm();
      setIsSubmittingEMR(false);
      setFeedbackMsg({
        text:
          '[Offline Mode] Network unavailable. Encounter saved to local offline queue. Will auto-sync to MySQL upon reconnection.',
        type: 'success',
      });
      return;
    }

    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/${selectedApp.appointment_id}/complete`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(encounterPayload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete encounter.');

      let fileSuccess = false;
      if (attachedFile && data.emrId) {
        try {
          const formData = new FormData();
          formData.append('file', attachedFile);
          const uploadRes = await fetch(
            `${API_BASE_URL}/api/documents/emr/${data.emrId}/attachments`,
            {
              method: 'POST',
              headers: { Authorization: `Bearer ${token}` },
              body: formData,
            }
          );
          if (uploadRes.ok) fileSuccess = true;
        } catch (_) {
          /* attachment upload is best-effort */
        }
      }

      await fetchAppointments('active', false);
      resetForm();
      setFeedbackMsg({
        text: fileSuccess
          ? 'Encounter finalized, lab file uploaded to MinIO S3, and patient discharged.'
          : 'Encounter finalized and patient discharged to History Archive.',
        type: 'success',
      });
    } catch (err: any) {
      /* Only a real network failure (fetch TypeError) is queued offline.
         Server rejections must be shown, not silently queued. */
      if (!(err instanceof TypeError)) {
        setFeedbackMsg({
          text: err.message || 'Failed to complete encounter.',
          type: 'error',
        });
        return;
      }
      
      queueOfflineMutation({
        table_name: 'EMR_RECORDS',
        record_uuid: crypto.randomUUID(),
        action: 'CREATE',
        payload: encounterPayload,
      });
      resetForm();
      setFeedbackMsg({
        text:
          'Server unreachable. Encounter queued locally in offline storage. Will replay automatically when online.',
        type: 'success',
      });
    } finally {
      setIsSubmittingEMR(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* HISTORY MODAL                                               */
  /* ═══════════════════════════════════════════════════════════ */

const handleViewPatientHistory = async () => {
    if (!selectedApp) return;
    setShowHistoryModal(true);
    setLoadingHistory(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patient/${selectedApp.patient_id}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json();
      if (Array.isArray(data)) {
        setPatientHistory(data);
        return;
      }
      throw new Error('Server returned non-200');
    } catch (err) {
      // Feature 6: Offline SQLite Fallback for Past EMR History Modal
      if (window.electronAPI?.offlineGetEmrHistory) {
        try {
          const offlineEmrs = await window.electronAPI.offlineGetEmrHistory(selectedApp.patient_id);
          setPatientHistory(offlineEmrs);
          return;
        } catch (sqliteErr) {
          console.error('[SQLite History Error]:', sqliteErr);
        }
      }
      console.error('History fetch error:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* PRESCRIPTION HISTORY (issuer-only)                          */
  /* ═══════════════════════════════════════════════════════════ */

  const openPrescriptionHistory = async (patientId: number, patientName: string) => {
    setRxHistoryPatientName(patientName);
    setRxHistory([]);
    setRxHistoryError(null);
    setShowRxHistoryModal(true);
    setLoadingRxHistory(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/documents/prescriptions/patient/${patientId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }
      setRxHistory(data);
    } catch (err: any) {
      setRxHistoryError(
        'Could not load prescription history: ' + (err?.message || 'Network error')
      );
    } finally {
      setLoadingRxHistory(false);
    }
  };

  
  const openClearanceHistory = async (patientId: number, patientName: string) => {
    setClrHistoryPatientName(patientName);
    setClrHistory([]);
    setClrHistoryError(null);
    setShowClrHistoryModal(true);
    setLoadingClrHistory(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/documents/clearances/patient/${patientId}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      const data = await res.json().catch(() => null);
      if (!res.ok || !Array.isArray(data)) {
        throw new Error((data && data.error) || `HTTP ${res.status}`);
      }
      setClrHistory(data);
    } catch (err: any) {
      setClrHistoryError(
        'Could not load clearance history: ' + (err?.message || 'Network error')
      );
    } finally {
      setLoadingClrHistory(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* PATIENT DIRECTORY (ARCHIVE TAB)                             */
  /* ═══════════════════════════════════════════════════════════ */

const handleSearchPatientDirectory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!patientSearchQuery.trim()) return;
    setIsSearchingPatients(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patients/search?query=${encodeURIComponent(
          patientSearchQuery.trim()
        )}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setSearchResults(await res.json());
        return;
      }
      throw new Error('Server returned non-200');
    } catch (err) {
      // Feature 6: Offline SQLite Fallback for Patient Search
      if (window.electronAPI?.offlineSearchPatients) {
        try {
          const offlineMatches = await window.electronAPI.offlineSearchPatients(patientSearchQuery.trim());
          const mapped = offlineMatches.map((p: any) => ({
            ...p,
            identifier_no: p.student_no,
            affiliation: p.course,
          }));
          setSearchResults(mapped);
          return;
        } catch (sqliteErr) {
          console.error('[SQLite Search Error]:', sqliteErr);
        }
      }
      console.error('Failed to search patients:', err);
    } finally {
      setIsSearchingPatients(false);
    }
  };

const loadPatientTimeline = async (patient: any) => {
    setSelectedDirectoryPatient(patient);
    setLoadingTimeline(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patient/${patient.user_id}/history`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        setDirectoryTimeline(await res.json());
        return;
      }
      throw new Error('Server returned non-200');
    } catch (err) {
      // Feature 6: Offline SQLite Fallback for EMR Timeline
      if (window.electronAPI?.offlineGetEmrHistory) {
        try {
          const offlineEmrs = await window.electronAPI.offlineGetEmrHistory(patient.user_id);
          setDirectoryTimeline(offlineEmrs);
          return;
        } catch (sqliteErr) {
          console.error('[SQLite Timeline Error]:', sqliteErr);
        }
      }
      console.error('Failed to load patient timeline:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* IMMUNIZATION MODAL HANDLERS                                 */
  /* ═══════════════════════════════════════════════════════════ */

  const openImmunizationModal = async () => {
    if (!selectedApp || isBookingMode) return;
    setShowImmunizationModal(true);
    setPatientImmunizations([]);
    setNewImmunizations([]);
    setCustomImmunizationInput('');
    setImmunizationFeedback(null);
    setLoadingImmunizations(true);

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/profile/patient/${selectedApp.patient_id}/immunizations`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) {
        const data = await res.json();
        setPatientImmunizations(
          Array.isArray(data.immunizations) ? data.immunizations : []
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setImmunizationFeedback({
          text: '' + (err.error || 'Failed to load immunization records.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setImmunizationFeedback({
        text: 'Network error: ' + err.message,
        type: 'error',
      });
    } finally {
      setLoadingImmunizations(false);
    }
  };

  const closeImmunizationModal = () => {
    setShowImmunizationModal(false);
    setPatientImmunizations([]);
    setNewImmunizations([]);
    setCustomImmunizationInput('');
    setImmunizationFeedback(null);
  };

  const handleQuickAddImmunization = (name: string) => {
    const lower = name.toLowerCase();
    if (
      patientImmunizations.some((p) => p.toLowerCase() === lower) ||
      newImmunizations.some((p) => p.toLowerCase() === lower)
    ) {
      return;
    }
    setNewImmunizations((prev) => [...prev, name]);
    setImmunizationFeedback(null);
  };

  const handleAddCustomImmunization = () => {
    const trimmed = customImmunizationInput.trim();
    if (!trimmed) return;

    const lower = trimmed.toLowerCase();
    if (
      patientImmunizations.some((p) => p.toLowerCase() === lower) ||
      newImmunizations.some((p) => p.toLowerCase() === lower)
    ) {
      setImmunizationFeedback({
        text: 'That immunization is already on record or already queued for this visit.',
        type: 'error',
      });
      return;
    }

    setNewImmunizations((prev) => [...prev, trimmed]);
    setCustomImmunizationInput('');
    setImmunizationFeedback(null);
  };

  const handleRemoveNewImmunization = (idx: number) => {
    setNewImmunizations((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveImmunizations = async () => {
    if (!selectedApp || newImmunizations.length === 0) return;
    setSavingImmunizations(true);
    setImmunizationFeedback(null);
    const token = localStorage.getItem('valetudo_token');

    try {
      const mergedList = Array.from(
        new Set([...patientImmunizations, ...newImmunizations])
      );
      const res = await fetch(
        `${API_BASE_URL}/api/profile/patient/${selectedApp.patient_id}/immunizations`,
        {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            immunizations: mergedList,
            appointment_id: selectedApp.appointment_id,
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save immunization records.');

      setPatientImmunizations(
        Array.isArray(data.immunizations) ? data.immunizations : mergedList
      );
      setNewImmunizations([]);
      setImmunizationFeedback({ text: '' + data.message, type: 'success' });
      setFeedbackMsg({ text: `${data.message}`, type: 'success' });
    } catch (err: any) {
      setImmunizationFeedback({ text: '' + err.message, type: 'error' });
    } finally {
      setSavingImmunizations(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* PDF DOWNLOAD                                                */
  /* ═══════════════════════════════════════════════════════════ */

  const handleDownloadPdf = async (
    kind: 'prescriptions' | 'clearances',
    id: number,
    onError?: (message: string) => void
  ) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${kind}/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        const message = 'PDF download failed: ' + (err.error || `HTTP ${res.status}`);
        if (onError) onError(message);
        else setFeedbackMsg({ text: message, type: 'error' });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download =
        kind === 'prescriptions'
          ? `prescription-${id}.pdf`
          : `clearance-${id}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();

      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err: any) {
      const message = 'Network error fetching PDF: ' + err.message;
      if (onError) onError(message);
      else setFeedbackMsg({ text: message, type: 'error' });
    }
  };

  
  /* Opens the server-generated PDF (same file as "Download PDF") in the preview window */
  const openIssuedPdf = async (
    kind: 'prescriptions' | 'clearances',
    id: number
  ): Promise<boolean> => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${kind}/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      const blob = new Blob([await res.blob()], { type: 'application/pdf' });
      const objectUrl = URL.createObjectURL(blob);
      const fileName =
        kind === 'prescriptions' ? `prescription-${id}.pdf` : `clearance-${id}.pdf`;
      setPreviewModal((prev) => {
        if (prev?.url) URL.revokeObjectURL(prev.url);
        return { url: objectUrl, fileName, mimeType: 'application/pdf' };
      });
      return true;
    } catch (err: any) {
      alert(
        `Issued successfully, but the PDF could not be opened (${err.message}). Use the Download PDF button.`
      );
      return false;
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* CLEARANCE ISSUANCE                                          */
  /* ═══════════════════════════════════════════════════════════ */

  const handlePrintClearance = async () => {
    if (!selectedApp || isBookingMode) return;
    setIsIssuingClearance(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/clearances`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: selectedApp.patient_id,
          appointment_id: selectedApp.appointment_id,
          purpose: clearancePurpose,
          remarks: clearanceRemarks,
          expires_at: clearanceExpiryDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === 'SIGNATURE_NOT_ENROLLED') setShowSignature(true);
        throw new Error(data.error || 'Failed to issue medical clearance.');
      }

      const clearanceId = data.clearanceId;
      await openIssuedPdf('clearances', clearanceId);

      setFeedbackMsg({
        text: `Clearance #${clearanceId} (Expires: ${clearanceExpiryDate}) issued!`,
        type: 'success',
        pdfKind: 'clearances',
        pdfId: clearanceId,
      });
    } catch (err: any) {
      setFeedbackMsg({
        text: 'Error issuing clearance: ' + err.message,
        type: 'error',
      });
    } finally {
      setIsIssuingClearance(false);
    }
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* DERIVED                                                     */
  /* ═══════════════════════════════════════════════════════════ */

  const isArchivedMode =
    viewMode === 'history' ||
    selectedApp?.status === 'completed' ||
    selectedApp?.status === 'cancelled';

      /* Bookings (not yet triaged) are VIEW-ONLY. Documents and encounters
     may only be created from the QUEUE. */
  const isBookingMode =
    viewMode === 'scheduled' || selectedApp?.status === 'scheduled';

  const isDentalVisit =
    isDentist &&
    Boolean(
      selectedApp?.appointment_type?.toLowerCase().includes('dent') ||
        selectedApp?.appointment_type?.toLowerCase().includes('tooth') ||
        selectedApp?.appointment_type?.toLowerCase().includes('oral') ||
        selectedApp?.appointment_type?.toLowerCase().includes('prophylaxis') ||
        forceShowDentalChart
    );

  const headerTitle: Record<DoctorViewMode, string> = {
    active: 'My consultation queue',
    scheduled: 'My upcoming bookings',
    history: 'My consultation history',
    archive: 'Patient EMR directory',
    analytics: 'Epidemiological analytics',
  };
  const headerSub: Record<DoctorViewMode, string> = {
    active: 'Triaged patients assigned to your department',
    scheduled: 'Bookings awaiting clinic nurse triage check-in',
    history: 'Completed encounters discharged by your department',
    archive: 'Search and inspect a chronological encounter timeline',
    analytics:
      'Campus illness trajectories, seasonal spike monitoring & health reports',
  };

  /* ═══════════════════════════════════════════════════════════ */
  /* RENDER                                                      */
  /* ═══════════════════════════════════════════════════════════ */

  return (
    <div style={{ width: '100%' }}>
      {/* ── Page header ─────────────────────────────────────── */}
      {viewMode !== 'analytics' && (
        <div
          style={{
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 16,
          }}
        >
          <div className="vd-page-head" style={{ marginBottom: 0 }}>
            <div className="vd-page-head-eyebrow">Consultation</div>
            <h1 className="vd-page-head-title">{headerTitle[viewMode]}</h1>
            <p className="vd-page-head-sub">{headerSub[viewMode]}</p>
          </div>
          <button
            type="button"
            style={btnGhost}
            onClick={() => setShowSignature(true)}
          >
            <Icon name="edit_note" size={14} /> My signature
          </button>
        </div>
      )}

      {(signatureStatus === 'missing' || signatureStatus === 'error') && (
        <div
          role="alert"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            flexWrap: 'wrap',
            marginBottom: 18,
            padding: '14px 18px',
            borderRadius: T.radius.md,
            background: T.warningSoft,
            color: T.ink,
            border: `1px solid ${T.warningBorder}`,
          }}
        >
          <div style={{ flex: '1 1 300px' }}>
            <strong>
              {signatureStatus === 'missing'
                ? 'Your handwritten signature is not saved.'
                : 'Your signature status could not be verified.'}
            </strong>
            <div style={{ marginTop: 4, fontSize: 12.5, lineHeight: 1.5 }}>
              {signatureStatus === 'missing'
                ? 'Prescriptions and clearances issued without it would reach patients without your handwritten signature. Save it before issuing documents.'
                : `${signatureStatusError || 'Check your connection.'} Document issuance requires a saved signature.`}
            </div>
          </div>
          <button type="button" style={btnPrimary} onClick={() => setShowSignature(true)}>
            <Icon name="edit_note" size={14} /> Save signature
          </button>
        </div>
      )}

      {/* ── ACTIVE SOS BANNER (Doctor & Dentist console) ─────────────
          Mounted for the whole console — DENTIST shares it (App.tsx routes
          both roles here). Delivery is decided server-side: an unlabelled
          DENTIST gets 403 on /active and the banner renders nothing, while
          a labelled one receives the full clinical payload. */}
      <EmergencyAlertBanner />

      {/* ── Queue grid (hidden on analytics/archive) ────────── */}
      {viewMode !== 'analytics' && viewMode !== 'archive' && (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.lg,
            padding: 22,
            marginBottom: 22,
            boxShadow: T.shadow.xs,
          }}
        >
          {loadingAppointments ? (
            <div
              style={{
                padding: 24,
                textAlign: 'center',
                color: T.textSub,
                fontSize: 13,
              }}
            >
              Loading roster…
            </div>
          ) : appointments.length === 0 ? (
            <div
              style={{
                padding: '28px 20px',
                textAlign: 'center',
                color: T.textSub,
                fontSize: 13,
                lineHeight: 1.6,
              }}
            >
              {viewMode === 'active'
                ? 'No patients currently waiting in your consultation queue.'
                : viewMode === 'scheduled'
                ? 'No pending mobile bookings assigned to your schedule.'
                : 'No archived consultations found for your department.'}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
                gap: 12,
              }}
            >
              {appointments.map((app) => {
                const isSelected = selectedApp?.appointment_id === app.appointment_id;
                const badge = STATUS_STYLE(app.status);
                return (
                  <button
                    key={app.appointment_id}
                    type="button"
                    onClick={() => selectPatient(app)}
                    style={{
                      textAlign: 'left',
                      padding: '14px 16px',
                      borderRadius: T.radius.lg,
                      border: `1.5px solid ${isSelected ? T.primary : T.border}`,
                      background: isSelected ? T.primaryTint : T.surface,
                      cursor: 'pointer',
                      fontFamily: T.font,
                      transition: 'all 120ms ease',
                      boxShadow: isSelected ? T.shadow.sm : 'none',
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
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          fontFamily: T.mono,
                          fontSize: 11.5,
                          fontWeight: 700,
                          color: T.primary,
                          background: T.surface,
                          padding: '3px 8px',
                          borderRadius: T.radius.xs,
                          border: `1px solid ${T.primaryTint}`,
                        }}
                      >
                        <Icon name="confirmation_number" size={14} /> {app.queue_ticket || (app.status === 'completed' ? 'DONE' : 'WAITING')}
                      </span>
                      <span
                        style={{
                          padding: '3px 10px',
                          borderRadius: T.radius.pill,
                          background: badge.bg,
                          color: badge.color,
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.3,
                        }}
                      >
                        {badge.text}
                      </span>
                    </div>
                    <div
                      style={{
                        fontSize: 15,
                        fontWeight: 700,
                        color: T.text,
                        marginBottom: 4,
                      }}
                    >
                      {app.first_name} {app.last_name}
                    </div>
                    <div
                      style={{
                        fontSize: 12,
                        color: T.textSub,
                        marginBottom: 2,
                      }}
                    >
                      {app.appointment_type}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: T.textMuted,
                        fontFamily: T.mono,
                      }}
                    >
                         <Icon name="calendar_month" size={14} /> {app.date_str} · ⏰ {app.time_slot}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Analytics tab ───────────────────────────────────── */}
      {viewMode === 'analytics' && <AnalyticsDashboard />}

      {/* ── Archive (patient EMR directory) ────────────────── */}
      {viewMode === 'archive' && (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: T.radius.lg,
            padding: 22,
            boxShadow: T.shadow.xs,
          }}
        >
          <form
            onSubmit={handleSearchPatientDirectory}
            style={{ display: 'flex', gap: 12, marginBottom: 20 }}
          >
            <input
              style={{ ...inputStyle, flex: 1 }}
              placeholder="Student ID (e.g. 22-LN-0451), first/last name, or email"
              value={patientSearchQuery}
              onChange={(e) => setPatientSearchQuery(e.target.value)}
            />
            <button type="submit" disabled={isSearchingPatients} style={btnPrimary}>
              {isSearchingPatients ? 'Searching…' : 'Search'}
            </button>
          </form>

          <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 24 }}>
            <aside style={{ borderRight: `1px solid ${T.border}`, paddingRight: 18 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 800,
                  letterSpacing: 1.4,
                  color: T.textMuted,
                  textTransform: 'uppercase',
                  marginBottom: 10,
                }}
              >
                Matched patients ({searchResults.length})
              </div>
              {searchResults.length === 0 ? (
                <p style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                  Type a query and press Search. Leave empty to list all.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {searchResults.map((p) => {
                    const isSel = selectedDirectoryPatient?.user_id === p.user_id;
                    return (
                      <button
                        key={p.user_id}
                        type="button"
                        onClick={() => loadPatientTimeline(p)}
                        style={{
                          textAlign: 'left',
                          padding: '10px 12px',
                          borderRadius: T.radius.md,
                          border: `1.5px solid ${isSel ? T.primary : T.border}`,
                          background: isSel ? T.primaryTint : T.surface,
                          cursor: 'pointer',
                          fontFamily: T.font,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 13.5,
                            fontWeight: 700,
                            color: T.text,
                          }}
                        >
                          {p.first_name} {p.last_name}
                        </div>
                        <div
                          style={{
                            fontSize: 11.5,
                            color: T.primary,
                            fontWeight: 700,
                            marginTop: 2,
                          }}
                        >
                          {p.identifier_no}
                        </div>
                        <div
                          style={{
                            fontSize: 11,
                            color: T.textSub,
                            marginTop: 2,
                          }}
                        >
                          {p.affiliation}
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            <div>
              {!selectedDirectoryPatient ? (
                <div
                  style={{
                    padding: '60px 20px',
                    textAlign: 'center',
                    color: T.textMuted,
                    fontSize: 13,
                    lineHeight: 1.6,
                  }}
                >
                  Select a patient from the search results to inspect their chronological
                  EMR timeline.
                </div>
              ) : loadingTimeline ? (
                <p style={{ color: T.textSub, fontSize: 13 }}>
                  Loading clinical timeline…
                </p>
              ) : (
                <div>
                  <div
                    style={{
                      background: T.sage100,
                      padding: '14px 18px',
                      borderRadius: T.radius.md,
                      marginBottom: 18,
                    }}
                  >
                    <h4
                      style={{
                        margin: 0,
                        color: T.text,
                        fontSize: 15,
                        fontWeight: 800,
                      }}
                    >
                      {selectedDirectoryPatient.first_name}{' '}
                      {selectedDirectoryPatient.last_name}
                      <span
                        style={{
                          color: T.primary,
                          marginLeft: 8,
                          fontSize: 13,
                        }}
                      >
                        ({selectedDirectoryPatient.identifier_no})
                      </span>
                    </h4>
                    <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
                      <b>Affiliation:</b> {selectedDirectoryPatient.affiliation} ·{' '}
                      <b>Blood:</b> {selectedDirectoryPatient.blood_type || 'Unknown'} ·{' '}
                      <b>Allergies:</b>{' '}
                      <span style={{ color: T.danger, fontWeight: 700 }}>
                        {selectedDirectoryPatient.allergies}
                      </span>
                    </p>
                                        <button
                      type="button"
                      onClick={() =>
                        openPrescriptionHistory(
                          selectedDirectoryPatient.user_id,
                          `${selectedDirectoryPatient.first_name} ${selectedDirectoryPatient.last_name}`
                        )
                      }
                      style={{
                        ...btnGhost,
                        marginTop: 10,
                        color: T.primary,
                        borderColor: T.primaryTint,
                      }}
                      title="Prescriptions you issued to this patient"
                    >
                      <Icon name="medication" size={14} /> My prescriptions
                    </button>
                                        <button
                      type="button"
                      onClick={() =>
                        openClearanceHistory(
                          selectedDirectoryPatient.user_id,
                          `${selectedDirectoryPatient.first_name} ${selectedDirectoryPatient.last_name}`
                        )
                      }
                      style={{
                        ...btnGhost,
                        marginTop: 10,
                        marginLeft: 8,
                        color: T.primary,
                        borderColor: T.primaryTint,
                      }}
                      title="Clearances you issued to this patient"
                    >
                      <Icon name="description" size={14} /> My clearances
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: T.textMuted,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    Chronological encounter history ({directoryTimeline.length})
                  </div>

                  {directoryTimeline.length === 0 ? (
                    <p style={{ fontSize: 13, color: T.textSub }}>
                      No prior encounters on record.
                    </p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {directoryTimeline.map((item) => (
                        <div
                          key={item.emr_id}
                          style={{
                            border: `1px solid ${T.border}`,
                            borderRadius: T.radius.md,
                            padding: 16,
                            background: T.surface,
                            boxShadow: T.shadow.xs,
                          }}
                        >
                          <div
                            style={{
                              display: 'flex',
                              justifyContent: 'space-between',
                              marginBottom: 8,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 13,
                                fontWeight: 800,
                                color: T.primary,
                              }}
                            >
                              {new Date(item.encounter_date).toLocaleDateString()} ·{' '}
                              {new Date(item.encounter_date).toLocaleTimeString([], {
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                            <span style={{ fontSize: 11.5, color: T.textSub }}>
                              Dr. {item.doctor_last_name}
                            </span>
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              marginBottom: 4,
                              color: T.text,
                            }}
                          >
                            <b>Complaint:</b> {item.chief_complaint}
                          </div>
                          <div
                            style={{
                              fontSize: 13,
                              marginBottom: 4,
                              color: T.info,
                            }}
                          >
                            <b>Diagnosis:</b> {item.diagnosis}
                          </div>
                          {item.treatment_plan && (
                            <div
                              style={{
                                fontSize: 12.5,
                                color: T.textSub,
                                marginBottom: 4,
                                whiteSpace: 'pre-wrap',
                              }}
                            >
                              <b>Plan:</b> {item.treatment_plan}
                            </div>
                          )}

                          {item.vitals && item.vitals.filter(Boolean).length > 0 && (
                            <div
                              style={{
                                display: 'flex',
                                gap: 6,
                                flexWrap: 'wrap',
                                marginTop: 8,
                              }}
                            >
                              {item.vitals
                                .filter(Boolean)
                                .map((v: any, vi: number) => (
                                  <span
                                    key={vi}
                                    style={{
                                      fontSize: 11,
                                      background: T.sage100,
                                      color: T.textSub,
                                      padding: '3px 8px',
                                      borderRadius: T.radius.xs,
                                      fontFamily: T.mono,
                                      fontWeight: 600,
                                    }}
                                  >
                                    {v.metric}:{' '}
                                    <b style={{ color: T.text }}>
                                      {v.value} {v.unit}
                                    </b>
                                  </span>
                                ))}
                            </div>
                          )}

                          {item.attachments && item.attachments.length > 0 && (
                            <div
                              style={{
                                marginTop: 10,
                                paddingTop: 10,
                                borderTop: `1px dashed ${T.border}`,
                                display: 'flex',
                                gap: 8,
                                flexWrap: 'wrap',
                              }}
                            >
                              {item.attachments.map((att: any) => (
                                <button
                                  key={att.attachment_id}
                                  type="button"
                                  onClick={() =>
                                    handleOpenAttachment(att.attachment_id, att.file_name)
                                  }
                                  disabled={openingAttachmentId === att.attachment_id}
                                  style={{
                                    fontSize: 11.5,
                                    color: T.info,
                                    fontWeight: 700,
                                    background: T.infoSoft,
                                    padding: '4px 10px',
                                    borderRadius: T.radius.xs,
                                    border: `1px solid ${T.infoBorder}`,
                                    cursor: 'pointer',
                                  }}
                                >
                                  <Icon name="attach_file" size={14} /> {att.file_name}{' '}
                                  {openingAttachmentId === att.attachment_id
                                    ? '(Loading…)'
                                    : ''}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Active / Scheduled / History ───────────────────── */}
      {viewMode !== 'analytics' && viewMode !== 'archive' && (
        <>
          {/* Patient safety strip */}
          {selectedApp && (
            <div
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderLeft: `5px solid ${
                  selectedApp.status === 'scheduled'
                    ? T.warning
                    : selectedApp.status === 'completed'
                    ? T.success
                    : T.info
                }`,
                borderRadius: T.radius.lg,
                padding: '18px 22px',
                marginBottom: 20,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 16,
                boxShadow: T.shadow.xs,
              }}
            >
              <div style={{ minWidth: 260 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 800,
                      color: T.text,
                    }}
                  >
                    {selectedApp.first_name} {selectedApp.last_name}
                    <span
                      style={{
                        color: T.textSub,
                        fontSize: 13,
                        fontWeight: 600,
                        marginLeft: 8,
                      }}
                    >
                      {selectedApp.student_no || 'Staff'}
                    </span>
                  </h3>
                  <span
                    style={{
                      background: T.sage100,
                      color: T.textSub,
                      fontSize: 11.5,
                      fontWeight: 700,
                      padding: '3px 10px',
                      borderRadius: T.radius.pill,
                    }}
                  >
                    {selectedApp.course || 'PSU Lingayen'}
                  </span>
                  <span
                    style={{
                      background: STATUS_STYLE(selectedApp.status).bg,
                      color: STATUS_STYLE(selectedApp.status).color,
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: 0.3,
                      padding: '3px 10px',
                      borderRadius: T.radius.pill,
                    }}
                  >
                    {STATUS_STYLE(selectedApp.status).text}
                  </span>
                </div>

                <div
                  style={{
                    display: 'flex',
                    gap: 18,
                    marginTop: 10,
                    fontSize: 12.5,
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    <b style={{ color: T.textSub }}>Blood:</b>{' '}
                    {selectedApp.blood_type || 'O+'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>Allergies:</b>{' '}
                    <span
                      style={{
                        color:
                          selectedApp.allergies && selectedApp.allergies !== 'None'
                            ? T.danger
                            : T.success,
                        fontWeight: 700,
                      }}
                    >
                      {selectedApp.allergies
                        ? `${selectedApp.allergies}`
                        : 'None reported'}
                    </span>
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>Conditions:</b>{' '}
                    {selectedApp.chronic_conditions || 'None'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>H:</b>{' '}
                    {selectedApp.height ? `${selectedApp.height} cm` : '—'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>W:</b>{' '}
                    {selectedApp.weight ? `${selectedApp.weight} kg` : '—'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>Sex:</b>{' '}
                    {selectedApp.sex || 'Not recorded'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>DOB / Age:</b>{' '}
                    {selectedApp.date_of_birth
                      ? `${selectedApp.date_of_birth}${selectedApp.age != null ? ` (${selectedApp.age} yrs)` : ''}`
                      : 'Not recorded'}
                  </span>
                  <span>
                    <b style={{ color: T.textSub }}>BMI:</b>{' '}
                    {selectedApp.bmi
                      ? `${selectedApp.bmi} · ${selectedApp.bmi_category || ''}`
                      : 'Not available'}
                  </span>
                  {selectedApp.health_profile_updated_at && (
                    <span style={{ color: T.textMuted, fontStyle: 'italic' }}>
                      Last verified:{' '}
                      {new Date(
                        selectedApp.health_profile_updated_at
                      ).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div
                style={{
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  flexWrap: 'wrap',
                }}
              >
                <button
                  type="button"
                  onClick={handleViewPatientHistory}
                  style={{
                    ...btnGhost,
                    color: T.info,
                    borderColor: T.infoBorder,
                  }}
                >
                  <Icon name="article" size={14} /> Past EMR history
                </button>
                
                <button
                  type="button"
                  onClick={() =>
                    openPrescriptionHistory(
                      selectedApp.patient_id,
                      `${selectedApp.first_name} ${selectedApp.last_name}`
                    )
                  }
                  style={{
                    ...btnGhost,
                    color: T.primary,
                    borderColor: T.primaryTint,
                  }}
                  title="Prescriptions you issued to this patient"
                >
                  <Icon name="medication" size={14} /> My prescriptions
                </button>

                
                <button
                  type="button"
                  onClick={() =>
                    openClearanceHistory(
                      selectedApp.patient_id,
                      `${selectedApp.first_name} ${selectedApp.last_name}`
                    )
                  }
                  style={{
                    ...btnGhost,
                    color: T.primary,
                    borderColor: T.primaryTint,
                  }}
                  title="Clearances you issued to this patient"
                >
                  <Icon name="description" size={14} /> My clearances
                </button>

                {!isBookingMode && (
                  <button
                    type="button"
                    onClick={openImmunizationModal}
                    style={{
                      ...btnGhost,
                      color: T.primary,
                      borderColor: T.primaryTint,
                    }}
                    title="View and append immunization records"
                  >
                    <Icon name="vaccines" size={14} /> Immunizations
                  </button>
                )}

                {isDentist && !isBookingMode && (
                  <button
                    type="button"
                    onClick={() => setForceShowDentalChart((prev) => !prev)}
                    style={{
                      ...btnGhost,
                      color: isDentalVisit ? T.tonalTealFg : T.textSub,
                      borderColor: isDentalVisit ? '#9FD9CB' : T.border,
                      background: isDentalVisit ? T.tonalTealBg : T.surface,
                    }}
                    title="Toggle Dental Odontogram"
                  >
                    <Icon name="dentistry" size={14} /> {isDentalVisit ? 'Odontogram Active' : 'Dental Chart'}
                  </button>
                )}

                {selectedApp.status === 'completed' ? (
                  <span
                    style={{
                      background: T.successSoft,
                      color: T.success,
                      padding: '10px 16px',
                      borderRadius: T.radius.pill,
                      fontWeight: 700,
                      fontSize: 12.5,
                      border: `1px solid ${T.successBorder}`,
                    }}
                  >
                    <Icon name="check_circle" size={14} /> Encounter discharged
                  </span>
                ) : selectedApp.status === 'scheduled' ? (
                  <span
                    style={{
                      background: T.warningSoft,
                      color: T.warning,
                      padding: '10px 16px',
                      borderRadius: T.radius.pill,
                      fontWeight: 700,
                      fontSize: 12.5,
                      border: `1px solid ${T.warningBorder}`,
                    }}
                  >
                    ⏳ Awaiting nurse triage
                  </span>
                ) : selectedApp.status === 'serving' ? (
                  <span
                    style={{
                      background: T.successSoft,
                      color: T.success,
                      padding: '10px 16px',
                      borderRadius: T.radius.pill,
                      fontWeight: 700,
                      fontSize: 13,
                      border: `1px solid ${T.successBorder}`,
                    }}
                  >
                    <Icon name="medical_services" size={14} /> In consultation
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleStartConsultation}
                    style={{ ...btnPrimary }}
                  >
                    ▶ Begin consultation
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── IN-CONSULTATION DIAGNOSTIC LABS & ATTACHMENT PREVIEW ── */}
          {selectedApp && activePatientAttachments.length > 0 && (
            <div
              style={{
                background: '#F0F9FF',
                border: '1px solid #BAE6FD',
                borderRadius: T.radius.lg,
                padding: '14px 18px',
                marginBottom: 20,
                boxShadow: T.shadow.xs,
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
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: '#0369A1',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  <Icon name="folder_open" size={14} /> Prior Diagnostic Records & Lab Imaging on File (
                  {activePatientAttachments.length})
                </span>
                <span style={{ fontSize: 11, color: T.info, fontWeight: 600 }}>
                  Click to open/inspect attachment
                </span>
              </div>

              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {activePatientAttachments.map((att: any, idx: number) => (
                  <button
                    key={att.attachment_id || idx}
                    type="button"
                    onClick={() =>
                      handleOpenAttachment(att.attachment_id, att.file_name, att.mime_type)
                    }
                    disabled={openingAttachmentId === att.attachment_id}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      padding: '6px 14px',
                      background: '#FFFFFF',
                      border: '1px solid #7DD3FC',
                      borderRadius: T.radius.pill,
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.info,
                      cursor: 'pointer',
                      boxShadow: T.shadow.xs,
                      fontFamily: T.font,
                    }}
                  >
                    <Icon name="draft" size={14} /> {att.file_name}
                    <span
                      style={{
                        fontSize: 10.5,
                        color: T.textMuted,
                        fontWeight: 500,
                      }}
                    >
                      ({new Date(att.encounter_date).toLocaleDateString()})
                    </span>
                    <span style={{ fontSize: 11, color: '#0369A1' }}>
                      {openingAttachmentId === att.attachment_id ? '⏳' : '️'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* ── INTERACTIVE ODONTOGRAM ───────────────────────── */}
          {selectedApp && isDentalVisit && !isBookingMode && (
            <div
              style={{
                background: T.surface,
                border: `1.5px solid ${T.tonalTealFg}`,
                borderRadius: T.radius.lg,
                padding: '18px 22px',
                marginBottom: 20,
                boxShadow: T.shadow.sm,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 12,
                  flexWrap: 'wrap',
                  gap: 10,
                }}
              >
                <div>
                  <h4
                    style={{
                      margin: 0,
                      fontSize: 15,
                      fontWeight: 800,
                      color: T.tonalTealFg,
                      display: 'flex',
                      alignItems: 'center',
                      gap: 6,
                    }}
                  >
                    <Icon name="dentistry" size={14} /> Adult Dental Chart (Odontogram) · Universal Numbering System
                  </h4>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: T.textSub }}>
                    Click a tooth (Upper 1–16, Lower 32–17) to record or update findings.
                    Automatically appended to the clinical plan upon discharge.
                  </p>
                </div>

                {Object.values(dentalChartData).filter(
                  (t) => t.condition !== 'sound'
                ).length > 0 &&
                  !isArchivedMode && (
                    <button
                      type="button"
                      onClick={() => setDentalChartData({})}
                      style={{
                        ...btnGhost,
                        padding: '4px 10px',
                        fontSize: 11,
                        color: T.danger,
                        borderColor: T.dangerBorder,
                      }}
                    >
                      Reset Chart
                    </button>
                  )}
              </div>

              <div
                style={{
                  background: T.sage50,
                  padding: 12,
                  borderRadius: T.radius.md,
                  border: `1px solid ${T.borderSoft}`,
                }}
              >
                {/* Upper teeth */}
                <div style={{ marginBottom: 10 }}>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: T.textMuted,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Maxillary Arch (Upper Teeth 1–16)
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(16, 1fr)',
                      gap: 4,
                    }}
                  >
                    {UPPER_TEETH.map((tNum) => {
                      const tData = dentalChartData[tNum] || {
                        number: tNum,
                        condition: 'sound' as ToothCondition,
                      };
                      const conf = CONDITION_COLORS[tData.condition];
                      const isSel = selectedTooth === tNum;
                      return (
                        <button
                          key={tNum}
                          type="button"
                          onClick={() => setSelectedTooth(tNum)}
                          title={`Tooth #${tNum} (${conf.label})`}
                          style={{
                            padding: '6px 2px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            borderRadius: T.radius.xs,
                            border: isSel
                              ? `2px solid ${T.primary}`
                              : `1px solid ${conf.border}`,
                            background: isSel ? '#E2EBE1' : conf.bg,
                            cursor: isArchivedMode ? 'default' : 'pointer',
                            fontFamily: T.mono,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: conf.text,
                            }}
                          >
                            {tNum}
                          </span>
                          <span
                            style={{
                              fontSize: 8.5,
                              fontWeight: 800,
                              color: conf.text,
                            }}
                          >
                            {tData.condition[0].toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Lower teeth */}
                <div>
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      color: T.textMuted,
                      marginBottom: 4,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                    }}
                  >
                    Mandibular Arch (Lower Teeth 32–17)
                  </div>
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(16, 1fr)',
                      gap: 4,
                    }}
                  >
                    {LOWER_TEETH.map((tNum) => {
                      const tData = dentalChartData[tNum] || {
                        number: tNum,
                        condition: 'sound' as ToothCondition,
                      };
                      const conf = CONDITION_COLORS[tData.condition];
                      const isSel = selectedTooth === tNum;
                      return (
                        <button
                          key={tNum}
                          type="button"
                          onClick={() => setSelectedTooth(tNum)}
                          title={`Tooth #${tNum} (${conf.label})`}
                          style={{
                            padding: '6px 2px',
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            borderRadius: T.radius.xs,
                            border: isSel
                              ? `2px solid ${T.primary}`
                              : `1px solid ${conf.border}`,
                            background: isSel ? '#E2EBE1' : conf.bg,
                            cursor: isArchivedMode ? 'default' : 'pointer',
                            fontFamily: T.mono,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 800,
                              color: conf.text,
                            }}
                          >
                            {tNum}
                          </span>
                          <span
                            style={{
                              fontSize: 8.5,
                              fontWeight: 800,
                              color: conf.text,
                            }}
                          >
                            {tData.condition[0].toUpperCase()}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {!isArchivedMode && selectedTooth && (
                <div
                  style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px dashed ${T.border}`,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                      flexWrap: 'wrap',
                      gap: 6,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 800,
                        color: T.primary,
                      }}
                    >
                      Set Finding for Tooth #{selectedTooth}:
                    </span>
                    <span style={{ fontSize: 11, color: T.textMuted }}>
                      Current:{' '}
                      {
                        CONDITION_COLORS[
                          dentalChartData[selectedTooth]?.condition || 'sound'
                        ].label
                      }
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {(Object.keys(CONDITION_COLORS) as ToothCondition[]).map((cond) => {
                      const current =
                        (dentalChartData[selectedTooth]?.condition || 'sound') === cond;
                      const conf = CONDITION_COLORS[cond];
                      return (
                        <button
                          key={cond}
                          type="button"
                          onClick={() => handleToothConditionChange(cond)}
                          style={{
                            padding: '4px 12px',
                            borderRadius: T.radius.pill,
                            border: current
                              ? `2px solid ${T.primary}`
                              : `1px solid ${conf.border}`,
                            background: conf.bg,
                            color: conf.text,
                            fontSize: 11.5,
                            fontWeight: 700,
                            cursor: 'pointer',
                          }}
                        >
                          {conf.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Two-column workspace — QUEUE ONLY (bookings are view-only) */}
          {isBookingMode ? (
            <div
              style={{
                padding: '18px 22px',
                background: T.warningSoft,
                border: `1px solid ${T.border}`,
                borderLeft: `5px solid ${T.warning}`,
                borderRadius: T.radius.lg,
                color: T.text,
                fontSize: 13.5,
                lineHeight: 1.6,
              }}
            >
              <strong><Icon name="lock" size={14} /> View-only booking.</strong> Prescriptions, clearances and
              encounter records can only be created from the{' '}
              <strong>Consultation queue</strong> after the nurse has triaged the
              patient.
            </div>
          ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20 }}>
            {/* LEFT: Document issuance */}
            <section
              aria-disabled={!selectedApp}
              inert={!selectedApp}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius.lg,
                padding: 22,
                boxShadow: T.shadow.xs,
                opacity: selectedApp ? 1 : 0.45,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 18,
                }}
              >
                <h3
                  style={{
                    margin: 0,
                    color: T.primary,
                    fontSize: 16,
                    fontWeight: 800,
                  }}
                >
                  Official document issuance
                </h3>
                <div
                  style={{
                    display: 'flex',
                    gap: 4,
                    padding: 3,
                    background: T.sage100,
                    borderRadius: T.radius.pill,
                  }}
                >
                  {[
                    { id: 'rx' as const, label: 'Prescription' },
                    { id: 'clearance' as const, label: 'Clearance' },
                  ].map((tab) => {
                    const isActive = docType === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setDocType(tab.id)}
                        style={{
                          padding: '6px 14px',
                          borderRadius: T.radius.pill,
                          border: 'none',
                          background: isActive ? T.surface : 'transparent',
                          color: isActive ? T.primary : T.textSub,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: T.font,
                          boxShadow: isActive ? T.shadow.xs : 'none',
                        }}
                      >
                        {tab.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Shared issuance feedback banner */}
              {feedbackMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    borderRadius: T.radius.md,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background:
                      feedbackMsg.type === 'success' ? T.successSoft : T.dangerSoft,
                    color: feedbackMsg.type === 'success' ? T.success : T.danger,
                    border: `1px solid ${
                      feedbackMsg.type === 'success'
                        ? T.successBorder
                        : T.dangerBorder
                    }`,
                    wordBreak: 'break-all',
                    lineHeight: 1.5,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 12,
                    flexWrap: 'wrap',
                  }}
                >
                  <span style={{ flex: '1 1 260px' }}>{feedbackMsg.text}</span>

                  {feedbackMsg.type === 'success' &&
                    feedbackMsg.pdfKind &&
                    feedbackMsg.pdfId && (
                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf(feedbackMsg.pdfKind!, feedbackMsg.pdfId!)
                        }
                        style={{
                          padding: '6px 14px',
                          borderRadius: T.radius.pill,
                          background: T.primary,
                          color: T.textOnPrimary,
                          border: 'none',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: T.font,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        <Icon name="download" size={14} />️ Download PDF
                      </button>
                    )}
                </div>
              )}

              {docType === 'rx' ? (
                <PrescriptionGenerator
                  key={selectedApp?.appointment_id}
                  patientUserId={selectedApp?.patient_id || 5}
                  appointmentId={selectedApp?.appointment_id}
                  verifiedPatient={{
                    first_name: selectedApp?.first_name || 'Daniella',
                    last_name: selectedApp?.last_name || 'Movida',
                    student_no: selectedApp?.student_no || '22-LN-0123',
                    course: selectedApp?.course || 'BS Information Technology',
                    allergies: selectedApp?.allergies || 'None',
                    date_of_birth: selectedApp?.date_of_birth,
                    age: selectedApp?.age,
                    sex: selectedApp?.sex,
                  }}
                  initialNotes={selectedApp?.past_dietary_notes}
                  isArchived={isArchivedMode}
                  signatureEnrolled={
                    signatureStatus === 'checking' || signatureStatus === 'error'
                      ? null
                      : signatureStatus === 'enrolled'
                  }
                  onSignatureRequired={() => setShowSignature(true)}
                  onPrescriptionIssued={(info) => {
                    setFeedbackMsg({
                      text: `Prescription #${info.prescriptionId} recorded and signed.`,
                      type: 'success',
                      pdfKind: 'prescriptions',
                      pdfId: info.prescriptionId,
                    });
                    void openIssuedPdf('prescriptions', info.prescriptionId);
                  }}
                  onPrescriptionError={(message) => {
                    setFeedbackMsg({ text: message, type: 'error' });
                  }}
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.textSub,
                        marginBottom: 6,
                      }}
                    >
                      Clearance purpose
                    </label>
                    <select
                      value={clearancePurpose}
                      disabled={isArchivedMode}
                      onChange={(e) => setClearancePurpose(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="On-the-Job Training (OJT) Medical Clearance">
                        On-the-Job Training (OJT) Medical Clearance
                      </option>
                      <option value="SCUAA / Sports Athletic Meet Participation">
                        SCUAA / Sports Athletic Meet Participation
                      </option>
                      <option value="Academic Readmission / Excuse Certificate">
                        Academic Readmission / Excuse Certificate
                      </option>
                      <option value="Annual Campus Physical Examination">
                        Annual Campus Physical Examination
                      </option>
                    </select>
                  </div>

                  <div>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: 6,
                      }}
                    >
                      <label
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: T.textSub,
                        }}
                      >
                        Validity / expiration date
                      </label>
                      {!isArchivedMode && (
                        <div style={{ display: 'flex', gap: 6 }}>
                          {[
                            { label: '+30d', days: 30 },
                            { label: '+6mo', months: 6 },
                            { label: '+1y', years: 1 },
                          ].map((opt) => (
                            <button
                              key={opt.label}
                              type="button"
                              onClick={() => {
                                const d = new Date();
                                if (opt.days) d.setDate(d.getDate() + opt.days);
                                if (opt.months) d.setMonth(d.getMonth() + opt.months);
                                if (opt.years)
                                  d.setFullYear(d.getFullYear() + opt.years);
                                setClearanceExpiryDate(
                                  d.toISOString().split('T')[0]
                                );
                              }}
                              style={{
                                fontSize: 10.5,
                                padding: '3px 8px',
                                borderRadius: T.radius.xs,
                                border: `1px solid ${T.border}`,
                                background: T.sage50,
                                color: T.primary,
                                cursor: 'pointer',
                                fontWeight: 700,
                                fontFamily: T.font,
                              }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <input
                      type="date"
                      value={clearanceExpiryDate}
                      disabled={isArchivedMode}
                      readOnly={isArchivedMode}
                      onChange={(e) => setClearanceExpiryDate(e.target.value)}
                      style={inputStyle}
                      required
                    />
                  </div>

                  <div>
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12,
                        fontWeight: 700,
                        color: T.textSub,
                        marginBottom: 6,
                      }}
                    >
                      Clinical fitness statement
                    </label>
                    <textarea
                      rows={5}
                      value={clearanceRemarks}
                      disabled={isArchivedMode}
                      readOnly={isArchivedMode}
                      onChange={(e) => setClearanceRemarks(e.target.value)}
                      style={{
                        ...inputStyle,
                        resize: 'vertical',
                        fontFamily: T.font,
                      }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintClearance}
                    disabled={
                      !selectedApp ||
                      isIssuingClearance ||
                      selectedApp.status === 'scheduled' ||
                      isArchivedMode
                    }
                    style={{
                      ...btnPrimary,
                      width: '100%',
                      padding: 12,
                      opacity:
                        !selectedApp ||
                        isIssuingClearance ||
                        selectedApp.status === 'scheduled' ||
                        isArchivedMode
                          ? 0.5
                          : 1,
                      cursor:
                        !selectedApp ||
                        isIssuingClearance ||
                        selectedApp.status === 'scheduled' ||
                        isArchivedMode
                          ? 'not-allowed'
                          : 'pointer',
                    }}
                  >
                    {isArchivedMode
                      ? 'Clearance already archived'
                      : isIssuingClearance
                      ? 'Signing & spooling…'
                      : '️ Issue, sign & print clearance'}
                  </button>
                </div>
              )}
            </section>

            {/* RIGHT: Encounter diagnosis & vitals */}
            <section
              aria-disabled={!selectedApp}
              inert={!selectedApp}
              style={{
                background: T.surface,
                border: `1px solid ${T.border}`,
                borderRadius: T.radius.lg,
                padding: 22,
                boxShadow: T.shadow.xs,
                opacity: selectedApp ? 1 : 0.45,
              }}
            >
              <h3
                style={{
                  margin: '0 0 16px 0',
                  color: T.info,
                  fontSize: 16,
                  fontWeight: 800,
                }}
              >
                <Icon name="medical_services" size={14} /> Encounter diagnosis & vitals
              </h3>

              {isArchivedMode && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: T.sage100,
                    color: T.textSub,
                    borderRadius: T.radius.md,
                    marginBottom: 16,
                    fontSize: 12.5,
                    border: `1px solid ${T.border}`,
                  }}
                >
                  <Icon name="lock" size={14} /> <b>Archived record.</b> This encounter is completed and
                  permanently signed. Fields below reflect the recorded EMR entry.
                </div>
              )}

              {selectedApp?.status === 'scheduled' && (
                <div
                  style={{
                    padding: '12px 16px',
                    background: T.warningSoft,
                    color: T.warning,
                    borderRadius: T.radius.md,
                    marginBottom: 16,
                    fontSize: 12.5,
                    border: `1px solid ${T.warningBorder}`,
                  }}
                >
                  <Icon name="warning" size={14} /> <b>Patient not yet triaged.</b> The student must first present
                  their QR Health Pass at the intake desk for the clinic nurse to
                  record initial vitals.
                </div>
              )}

              <form onSubmit={handleFinishConsultation}>
                {/* Vitals grid */}
                <div
                  style={{
                    background: T.sage50,
                    padding: 14,
                    borderRadius: T.radius.md,
                    marginBottom: 16,
                    border: `1px solid ${T.borderSoft}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: T.textSub,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    Nurse-recorded vitals (read-only)
                  </div>

                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(4, 1fr)',
                      gap: 10,
                    }}
                  >
                    {[
                      { label: 'BP systolic', value: bpSystolic },
                      { label: 'BP diastolic', value: bpDiastolic },
                      { label: 'Temp (°C)', value: temperature },
                      { label: 'Pulse bpm', value: pulseRate },
                      { label: 'SpO₂ %', value: spo2 },
                      { label: 'Resp cpm', value: respRate },
                      {
                        label: 'Height cm',
                        value: height,
                      },
                      {
                        label: 'Weight kg',
                        value: weight,
                      },
                      {
                        label: 'Patient sex',
                        value: selectedApp?.sex || '',
                      },
                      {
                        label: 'BMI',
                        value: selectedApp?.bmi
                          ? `${selectedApp.bmi} · ${selectedApp.bmi_category || ''}`
                          : '',
                      },
                    ].map((f) => (
                      <div key={f.label}>
                        <label
                          style={{
                            fontSize: 10.5,
                            color: T.textSub,
                            fontWeight: 600,
                          }}
                        >
                          {f.label}
                        </label>
                        <output
                          aria-label={`${f.label}, read only`}
                          style={{
                            display: 'block',
                            boxSizing: 'border-box',
                            width: '100%',
                            marginTop: 4,
                            padding: '8px 10px',
                            fontSize: 13,
                            color: f.value ? T.text : T.textSub,
                            background: T.sage100,
                            border: `1px solid ${T.borderSoft}`,
                            borderRadius: T.radius.md,
                          }}
                        >
                          {f.value || 'Not recorded'}
                        </output>
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.textSub,
                      marginBottom: 6,
                    }}
                  >
                    Chief complaint
                  </label>
                  <textarea
                    rows={2}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      fontFamily: T.font,
                    }}
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    placeholder={DEFAULT_CHIEF_COMPLAINT}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.textSub,
                      marginBottom: 6,
                    }}
                  >
                    Clinical diagnosis
                  </label>
                  <input
                    style={inputStyle}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    value={diagnosis}
                    placeholder={DEFAULT_DIAGNOSIS}
                    onChange={(e) => setDiagnosis(e.target.value)}
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label
                    style={{
                      display: 'block',
                      fontSize: 12,
                      fontWeight: 700,
                      color: T.textSub,
                      marginBottom: 6,
                    }}
                  >
                    Treatment plan
                  </label>
                  <textarea
                    rows={3}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    style={{
                      ...inputStyle,
                      resize: 'vertical',
                      fontFamily: T.font,
                    }}
                    value={treatmentPlan}
                    placeholder={DEFAULT_TREATMENT_PLAN}
                    onChange={(e) => setTreatmentPlan(e.target.value)}
                  />
                </div>

                {!isArchivedMode && (
                  <div
                    style={{
                      marginBottom: 16,
                      padding: 14,
                      background: T.sage50,
                      border: `1px dashed ${T.border}`,
                      borderRadius: T.radius.md,
                    }}
                  >
                    <label
                      style={{
                        display: 'block',
                        fontSize: 12.5,
                        fontWeight: 700,
                        color: T.textSub,
                        marginBottom: 8,
                      }}
                    >
                      <Icon name="attach_file" size={14} /> Attach diagnostic lab result (CBC, urinalysis, X-ray
                      PDF/image)
                    </label>
                    <input
                      key={selectedApp?.appointment_id || 'no-patient'}
                      type="file"
                      accept=".pdf,image/png,image/jpeg,.jpg"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0])
                          setAttachedFile(e.target.files[0]);
                      }}
                      style={{ fontSize: 12, color: T.textSub }}
                    />
                    {attachedFile && (
                      <div
                        style={{
                          fontSize: 12,
                          color: T.primary,
                          fontWeight: 700,
                          marginTop: 8,
                          display: 'flex',
                          alignItems: 'center',
                          gap: 10,
                        }}
                      >
                        <span>
                          <Icon name="draft" size={14} /> {attachedFile.name} (
                          {(attachedFile.size / 1024).toFixed(1)} KB)
                        </span>
                        <button
                          type="button"
                          onClick={() => setAttachedFile(null)}
                          style={{
                            background: 'none',
                            border: 'none',
                            color: T.danger,
                            cursor: 'pointer',
                            fontWeight: 700,
                            fontSize: 12,
                          }}
                        >
                          <Icon name="close" size={14} /> Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    isSubmittingEMR ||
                    !selectedApp ||
                    selectedApp.status === 'scheduled' ||
                    isArchivedMode
                  }
                  style={{
                    ...btnPrimary,
                    width: '100%',
                    padding: 13,
                    background:
                      isArchivedMode ||
                      !selectedApp ||
                      selectedApp.status === 'scheduled'
                        ? T.sage400
                        : T.primary,
                    opacity:
                      isArchivedMode ||
                      !selectedApp ||
                      selectedApp.status === 'scheduled'
                        ? 0.6
                        : 1,
                    cursor:
                      isArchivedMode ||
                      !selectedApp ||
                      selectedApp.status === 'scheduled'
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {isSubmittingEMR
                    ? 'Finalizing encounter & uploading to MinIO…'
                    : isArchivedMode
                    ? 'Encounter already finalized & discharged'
                    : selectedApp?.status === 'scheduled'
                    ? '⏳ Patient not triaged by nurse'
                    : 'Finish consultation & discharge'}
                </button>
              </form>
            </section>
          </div>
          )}
        </>
      )}

      {encounterConfirmation && (
        <div className="modal-backdrop" onClick={() => setEncounterConfirmation(null)}>
          <div
            className="modal-card"
            style={{ maxWidth: 560 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 10px', color: T.primary, fontSize: 17 }}>
              Confirm encounter details
            </h3>
            {encounterConfirmation.length > 0 ? (
              <>
                <p style={{ margin: '0 0 10px', color: T.warning, fontSize: 13, fontWeight: 700 }}>
                  Some fields are blank. The default text below will be recorded unless you go back and edit.
                </p>
                <ul style={{ margin: '0 0 18px', paddingLeft: 22, color: T.textSub, fontSize: 12.5 }}>
                  {encounterConfirmation.map((field) => (
                    <li key={field} style={{ whiteSpace: 'pre-line', marginBottom: 6 }}>{field}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p style={{ margin: '0 0 18px', color: T.textSub, fontSize: 13 }}>
                Review the encounter details before finalizing and discharging the patient.
              </p>
            )}
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
              <button
                type="button"
                style={btnGhost}
                onClick={() => setEncounterConfirmation(null)}
              >
                Go back and edit
              </button>
              <button
                type="button"
                style={btnPrimary}
                disabled={isSubmittingEMR}
                onClick={() => void handleFinishConsultation(undefined, true)}
              >
                Confirm and finalize
              </button>
            </div>
          </div>
        </div>
      )}

            {/* ── Prescription history modal (issuer-only) ─────────── */}
      {showRxHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowRxHistoryModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 780 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: `1px solid ${T.border}`,
                paddingBottom: 14,
                marginBottom: 18,
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color: T.primary,
                    fontSize: 17,
                    fontWeight: 800,
                  }}
                >
                  <Icon name="medication" size={14} /> Prescriptions you issued: {rxHistoryPatientName}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
                  Only prescriptions issued by you to this patient are shown.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowRxHistoryModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: T.textSub,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {rxHistoryError && (
              <div
                style={{
                  background: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.dangerBorder}`,
                  borderRadius: T.radius.md,
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {rxHistoryError}
              </div>
            )}

            {loadingRxHistory ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textSub,
                }}
              >
                Loading prescriptions…
              </div>
            ) : rxHistory.length === 0 && !rxHistoryError ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textMuted,
                }}
              >
                You have not issued any prescriptions to this patient.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {rxHistory.map((rx) => {
                  const tone =
                    rx.status === 'active'
                      ? { bg: T.successSoft, fg: T.success, bd: T.successBorder }
                      : rx.status === 'cancelled'
                      ? { bg: T.dangerSoft, fg: T.danger, bd: T.dangerBorder }
                      : { bg: T.warningSoft, fg: T.warning, bd: T.warningBorder };
                  return (
                    <div
                      key={rx.prescription_id}
                      style={{
                        border: `1px solid ${T.border}`,
                        borderRadius: T.radius.md,
                        padding: 16,
                        background: T.sage50,
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
                        <b style={{ color: T.primary, fontSize: 13.5 }}>
                          {new Date(rx.issued_at).toLocaleString()}{' '}
                          <span style={{ color: T.textSub, fontWeight: 600 }}>
                            · Rx #{rx.prescription_id}
                          </span>
                          {rx.expires_at && (
                            <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 500, marginLeft: 8 }}>
                              (Expires: {new Date(rx.expires_at).toLocaleDateString()})
                            </span>
                          )}
                        </b>
                        <span
                          style={{
                            background: tone.bg,
                            color: tone.fg,
                            border: `1px solid ${tone.bd}`,
                            borderRadius: 999,
                            padding: '2px 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                          }}
                        >
                          {rx.status}
                        </span>
                      </div>

                      {rx.items.map((it: any) => (
                        <div
                          key={it.item_id}
                          style={{
                            fontSize: 13,
                            marginBottom: 8,
                            paddingBottom: 8,
                            borderBottom: `1px dashed ${T.border}`,
                          }}
                        >
                          <b>{it.medicine_name}</b>
                          {it.generic_name ? ` (${it.generic_name})` : ''}
                          {it.is_outside && (
                            <span
                              style={{
                                marginLeft: 8,
                                background: T.warningSoft,
                                color: T.warning,
                                border: `1px solid ${T.warningBorder}`,
                                borderRadius: 999,
                                padding: '1px 8px',
                                fontSize: 10,
                                fontWeight: 800,
                                letterSpacing: 0.5,
                                verticalAlign: 'middle',
                                whiteSpace: 'nowrap',
                              }}
                              title="Not dispensed by the infirmary — purchased at an external pharmacy"
                            >
                              OUTSIDE Rx
                            </span>
                          )}
                          <div style={{ color: T.textSub, marginTop: 2 }}>
                            {it.dosage} · {it.frequency} · {it.route} · {it.duration_days}{' '}
                            day(s) · qty: {it.quantity_prescribed ?? it.quantity_dispensed}
                            {it.is_outside ? ' (prescribed)' : it.quantity_dispensed ? ` (dispensed: ${it.quantity_dispensed})` : ''}
                          </div>
                          {it.instructions && (
                            <div style={{ color: T.textSub, marginTop: 2 }}>
                              <b>Instructions:</b> {it.instructions}
                            </div>
                          )}
                        </div>
                      ))}

                      {rx.notes && (
                        <div
                          style={{
                            fontSize: 13,
                            color: T.textSub,
                            whiteSpace: 'pre-wrap',
                            marginBottom: 10,
                          }}
                        >
                          <b>Notes:</b> {rx.notes}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf(
                            'prescriptions',
                            rx.prescription_id,
                            setRxHistoryError
                          )
                        }
                        style={{
                          ...btnGhost,
                          color: T.info,
                          borderColor: T.infoBorder,
                        }}
                      >
                        <Icon name="draft" size={14} /> Download PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
            {/* ── Clearance history modal (issuer-only) ────────────── */}
      {showClrHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowClrHistoryModal(false)}>
          <div
            className="modal-card"
            style={{ maxWidth: 780 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: `1px solid ${T.border}`,
                paddingBottom: 14,
                marginBottom: 18,
              }}
            >
              <div>
                <h3
                  style={{
                    margin: 0,
                    color: T.primary,
                    fontSize: 17,
                    fontWeight: 800,
                  }}
                >
                  <Icon name="description" size={14} /> Clearances you issued: {clrHistoryPatientName}
                </h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
                  Only clearances issued by you to this patient are shown.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowClrHistoryModal(false)}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: T.textSub,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {clrHistoryError && (
              <div
                style={{
                  background: T.dangerSoft,
                  color: T.danger,
                  border: `1px solid ${T.dangerBorder}`,
                  borderRadius: T.radius.md,
                  padding: '10px 14px',
                  fontSize: 13,
                  marginBottom: 14,
                }}
              >
                {clrHistoryError}
              </div>
            )}

            {loadingClrHistory ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textSub,
                }}
              >
                Loading clearances…
              </div>
            ) : clrHistory.length === 0 && !clrHistoryError ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textMuted,
                }}
              >
                You have not issued any clearances to this patient.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {clrHistory.map((c) => {
                  const isPastExpiry =
                    c.expires_at &&
                    new Date(c.expires_at).getTime() < new Date().setHours(0, 0, 0, 0);
                  const shownStatus =
                    c.status === 'approved' && isPastExpiry ? 'expired' : c.status;
                  const tone =
                    shownStatus === 'approved'
                      ? { bg: T.successSoft, fg: T.success, bd: T.successBorder }
                      : shownStatus === 'revoked' || shownStatus === 'rejected'
                      ? { bg: T.dangerSoft, fg: T.danger, bd: T.dangerBorder }
                      : { bg: T.warningSoft, fg: T.warning, bd: T.warningBorder };
                  return (
                    <div
                      key={c.clearance_id}
                      style={{
                        border: `1px solid ${T.border}`,
                        borderRadius: T.radius.md,
                        padding: 16,
                        background: T.sage50,
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
                        <b style={{ color: T.primary, fontSize: 13.5 }}>
                          {new Date(c.issued_at).toLocaleString()}{' '}
                          <span style={{ color: T.textSub, fontWeight: 600 }}>
                            · Clearance #{c.clearance_id}
                          </span>
                        </b>
                        <span
                          style={{
                            background: tone.bg,
                            color: tone.fg,
                            border: `1px solid ${tone.bd}`,
                            borderRadius: 999,
                            padding: '2px 10px',
                            fontSize: 11,
                            fontWeight: 800,
                            textTransform: 'uppercase',
                            letterSpacing: 0.6,
                          }}
                        >
                          {shownStatus}
                        </span>
                      </div>

                      <div style={{ fontSize: 13, marginBottom: 6 }}>
                        <b>{c.purpose}</b>
                      </div>
                      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 6 }}>
                        <b>Valid until:</b> {new Date(c.expires_at).toLocaleDateString()}
                      </div>

                      {c.remarks && (
                        <div
                          style={{
                            fontSize: 13,
                            color: T.textSub,
                            whiteSpace: 'pre-wrap',
                            marginBottom: 6,
                          }}
                        >
                          <b>Remarks:</b> {c.remarks}
                        </div>
                      )}

                      {c.status === 'revoked' && (
                        <div style={{ fontSize: 13, color: T.danger, marginBottom: 6 }}>
                          <b>Revoked</b>
                          {c.revoked_at
                            ? ` on ${new Date(c.revoked_at).toLocaleDateString()}`
                            : ''}
                          {c.revocation_reason ? `: ${c.revocation_reason}` : ''}
                        </div>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          handleDownloadPdf('clearances', c.clearance_id, setClrHistoryError)
                        }
                        style={{
                          ...btnGhost,
                          marginTop: 6,
                          color: T.info,
                          borderColor: T.infoBorder,
                        }}
                      >
                        <Icon name="draft" size={14} /> Download PDF
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* ── EMR History modal ───────────────────────────────── */}
      {showHistoryModal && createPortal(
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="past-emr-history-title"
            style={{ maxWidth: 780 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderBottom: `1px solid ${T.border}`,
                paddingBottom: 14,
                marginBottom: 18,
              }}
            >
              <h3
                id="past-emr-history-title"
                style={{
                  margin: 0,
                  color: T.info,
                  fontSize: 17,
                  fontWeight: 800,
                }}
              >
                <Icon name="article" size={14} /> Medical history: {selectedApp?.first_name}{' '}
                {selectedApp?.last_name}
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                aria-label="Close medical history"
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: T.textSub,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {loadingHistory ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textSub,
                }}
              >
                Loading records…
              </div>
            ) : patientHistory.length === 0 ? (
              <div
                style={{
                  padding: '40px 20px',
                  textAlign: 'center',
                  color: T.textMuted,
                }}
              >
                No prior encounters recorded.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {patientHistory.map((item) => (
                  <div
                    key={item.emr_id}
                    style={{
                      border: `1px solid ${T.border}`,
                      borderRadius: T.radius.md,
                      padding: 16,
                      background: T.sage50,
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                    >
                      <b style={{ color: T.primary, fontSize: 13.5 }}>
                        {new Date(item.encounter_date).toLocaleDateString()}
                      </b>
                      <small style={{ color: T.textSub }}>
                        Attending: Dr. {item.doctor_last_name} ({item.doctor_license})
                      </small>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <b>Diagnosis:</b> {item.diagnosis}
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}>
                      <b>Complaint:</b> {item.chief_complaint}
                    </div>
                    {item.treatment_plan && (
                      <div
                        style={{
                          fontSize: 13,
                          color: T.textSub,
                          marginBottom: 4,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        <b>Treatment:</b> {item.treatment_plan}
                      </div>
                    )}
                    {item.notes && (
                      <div
                        style={{
                          fontSize: 13,
                          color: T.textSub,
                          marginBottom: 4,
                        }}
                      >
                        <b>Clinical notes:</b> {item.notes}
                      </div>
                    )}
                    {item.prescriptions?.[0]?.notes && (
                      <div
                        style={{
                          fontSize: 13,
                          color: T.primary,
                          marginBottom: 4,
                        }}
                      >
                        <b>Physician dietary / Rx notes:</b>{' '}
                        {item.prescriptions[0].notes}
                      </div>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <div
                        style={{
                          marginTop: 10,
                          paddingTop: 10,
                          borderTop: `1px dashed ${T.border}`,
                        }}
                      >
                        <div
                          style={{
                            fontSize: 10.5,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            color: T.primary,
                            textTransform: 'uppercase',
                            marginBottom: 8,
                          }}
                        >
                          <Icon name="attach_file" size={14} /> Diagnostic lab attachments
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {item.attachments.map((att: any) => (
                            <button
                              key={att.attachment_id}
                              type="button"
                              onClick={() =>
                                handleOpenAttachment(att.attachment_id, att.file_name)
                              }
                              disabled={openingAttachmentId === att.attachment_id}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 6,
                                padding: '5px 12px',
                                background: T.infoSoft,
                                color: T.info,
                                borderRadius: T.radius.xs,
                                fontSize: 11.5,
                                fontWeight: 700,
                                border: `1px solid ${T.infoBorder}`,
                                cursor: 'pointer',
                              }}
                            >
                              <Icon name="draft" size={14} /> {att.file_name} (
                              {(att.file_size / 1024).toFixed(0)} KB){' '}
                              {openingAttachmentId === att.attachment_id ? '⏳' : ''}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* IMMUNIZATIONS MODAL                                         */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {showImmunizationModal && selectedApp && (
        <div className="modal-backdrop" onClick={closeImmunizationModal}>
          <div
            className="modal-card"
            style={{ maxWidth: 660, padding: 0, overflow: 'hidden' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div
              style={{
                padding: '22px 26px 18px',
                borderBottom: `1px solid ${T.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: T.radius.md,
                    background: T.primaryTint,
                    display: 'grid',
                    placeItems: 'center',
                    fontSize: 20,
                    flexShrink: 0,
                  }}
                >
                  <Icon name="vaccines" size={14} />
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 17,
                      fontWeight: 800,
                      color: T.text,
                    }}
                  >
                    Immunization records
                  </h3>
                  <p
                    style={{
                      margin: '3px 0 0',
                      fontSize: 12.5,
                      color: T.textSub,
                    }}
                  >
                    {selectedApp.first_name} {selectedApp.last_name} ·{' '}
                    {selectedApp.student_no || 'PSU Member'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={closeImmunizationModal}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: 20,
                  cursor: 'pointer',
                  color: T.textSub,
                  lineHeight: 1,
                  padding: 4,
                }}
              >
                <Icon name="close" size={14} />
              </button>
            </div>

            {/* Body */}
            <div
              style={{
                padding: '20px 26px',
                maxHeight: '66vh',
                overflowY: 'auto',
              }}
            >
              {/* Currently on record */}
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 1.4,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Currently on record ({patientImmunizations.length})
                </div>

                {loadingImmunizations ? (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.textMuted,
                      padding: '12px 0',
                    }}
                  >
                    Loading records…
                  </div>
                ) : patientImmunizations.length === 0 ? (
                  <div
                    style={{
                      padding: '14px 18px',
                      background: T.sage50,
                      border: `1px dashed ${T.border}`,
                      borderRadius: T.radius.md,
                      fontSize: 12.5,
                      color: T.textMuted,
                      fontStyle: 'italic',
                    }}
                  >
                    No immunization records yet. Add the first one below.
                  </div>
                ) : (
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {patientImmunizations.map((imm, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '6px 12px',
                          background: T.successSoft,
                          color: T.success,
                          border: `1px solid ${T.successBorder}`,
                          borderRadius: T.radius.pill,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        <Icon name="check" size={14} /> {imm}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Quick-add */}
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 1.4,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Quick-add common vaccines
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {COMMON_VACCINES.map((v) => {
                    const lower = v.toLowerCase();
                    const disabled =
                      patientImmunizations.some(
                        (p) => p.toLowerCase() === lower
                      ) ||
                      newImmunizations.some((p) => p.toLowerCase() === lower);
                    return (
                      <button
                        key={v}
                        type="button"
                        disabled={disabled}
                        onClick={() => handleQuickAddImmunization(v)}
                        style={{
                          padding: '6px 12px',
                          borderRadius: T.radius.pill,
                          border: `1px solid ${
                            disabled ? T.borderSoft : T.border
                          }`,
                          background: disabled ? T.sage50 : T.surface,
                          color: disabled ? T.textFaint : T.text,
                          fontSize: 11.5,
                          fontWeight: 600,
                          cursor: disabled ? 'not-allowed' : 'pointer',
                          fontFamily: T.font,
                          transition: 'all 120ms ease',
                        }}
                      >
                        + {v}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom input */}
              <div style={{ marginBottom: 22 }}>
                <div
                  style={{
                    fontSize: 10.5,
                    fontWeight: 800,
                    letterSpacing: 1.4,
                    color: T.textMuted,
                    textTransform: 'uppercase',
                    marginBottom: 10,
                  }}
                >
                  Or type a custom entry
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleAddCustomImmunization();
                  }}
                  style={{ display: 'flex', gap: 8 }}
                >
                  <input
                    style={{ ...inputStyle, flex: 1 }}
                    placeholder="e.g. Anti-rabies dose 2 of 3"
                    value={customImmunizationInput}
                    onChange={(e) => setCustomImmunizationInput(e.target.value)}
                    maxLength={120}
                  />
                  <button
                    type="submit"
                    disabled={!customImmunizationInput.trim()}
                    style={{
                      ...btnPrimary,
                      padding: '10px 20px',
                      opacity: customImmunizationInput.trim() ? 1 : 0.5,
                      cursor: customImmunizationInput.trim()
                        ? 'pointer'
                        : 'not-allowed',
                    }}
                  >
                    Add
                  </button>
                </form>
              </div>

              {/* Pending additions */}
              {newImmunizations.length > 0 && (
                <div
                  style={{
                    padding: 16,
                    background: T.primaryTint,
                    borderRadius: T.radius.md,
                    border: `1px solid ${T.sage300}`,
                  }}
                >
                  <div
                    style={{
                      fontSize: 10.5,
                      fontWeight: 800,
                      letterSpacing: 1.4,
                      color: T.primary,
                      textTransform: 'uppercase',
                      marginBottom: 10,
                    }}
                  >
                    Pending additions ({newImmunizations.length})
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {newImmunizations.map((imm, idx) => (
                      <span
                        key={idx}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 8,
                          padding: '6px 8px 6px 12px',
                          background: T.surface,
                          color: T.primary,
                          border: `1px solid ${T.sage300}`,
                          borderRadius: T.radius.pill,
                          fontSize: 12,
                          fontWeight: 700,
                        }}
                      >
                        {imm}
                        <button
                          type="button"
                          onClick={() => handleRemoveNewImmunization(idx)}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            color: T.textSub,
                            fontSize: 13,
                            lineHeight: 1,
                            padding: 0,
                            width: 16,
                            height: 16,
                            display: 'grid',
                            placeItems: 'center',
                            borderRadius: '50%',
                            fontFamily: T.font,
                          }}
                          title="Remove"
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {immunizationFeedback && (
                <div
                  style={{
                    marginTop: 16,
                    padding: '12px 16px',
                    borderRadius: T.radius.md,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background:
                      immunizationFeedback.type === 'success'
                        ? T.successSoft
                        : T.dangerSoft,
                    color:
                      immunizationFeedback.type === 'success'
                        ? T.success
                        : T.danger,
                    border: `1px solid ${
                      immunizationFeedback.type === 'success'
                        ? T.successBorder
                        : T.dangerBorder
                    }`,
                  }}
                >
                  {immunizationFeedback.text}
                </div>
              )}
            </div>

            {/* Footer */}
            <div
              style={{
                padding: '16px 26px',
                borderTop: `1px solid ${T.border}`,
                background: T.sage50,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                flexWrap: 'wrap',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 11.5,
                  color: T.textMuted,
                  fontStyle: 'italic',
                }}
              >
                Records are appended — existing entries are preserved.
              </p>
              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  type="button"
                  onClick={closeImmunizationModal}
                  style={btnGhost}
                  disabled={savingImmunizations}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveImmunizations}
                  disabled={savingImmunizations || newImmunizations.length === 0}
                  style={{
                    ...btnPrimary,
                    opacity:
                      savingImmunizations || newImmunizations.length === 0
                        ? 0.5
                        : 1,
                    cursor:
                      savingImmunizations || newImmunizations.length === 0
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {savingImmunizations
                    ? 'Saving…'
                    : `Save ${newImmunizations.length} new record${
                        newImmunizations.length === 1 ? '' : 's'
                      }`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════ */}
      {/* IN-APP DIAGNOSTIC ATTACHMENT PREVIEW MODAL                  */}
      {/* ═══════════════════════════════════════════════════════════ */}
      {previewModal && (
        <div
          className="modal-backdrop"
          style={{ zIndex: 999 }}
          onClick={handleClosePreviewModal}
        >
          <div
            className="modal-card"
            style={{
              maxWidth: 960,
              width: '92vw',
              height: '86vh',
              display: 'flex',
              flexDirection: 'column',
              padding: 22,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 14,
                paddingBottom: 10,
                borderBottom: `1px solid ${T.border}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  minWidth: 0,
                }}
              >
                <span style={{ fontSize: 22 }}><Icon name="draft" size={22} /></span>
                <div style={{ minWidth: 0 }}>
                  <h3
                    style={{
                      margin: 0,
                      fontSize: 16,
                      fontWeight: 800,
                      color: T.text,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {previewModal.fileName}
                  </h3>
                  <span style={{ fontSize: 11.5, color: T.textSub }}>
                    Diagnostic Lab / Clinical Attachment Preview
                  </span>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <button
                  type="button"
                  onClick={() => {
                    const a = document.createElement('a');
                    a.href = previewModal.url;
                    a.download = previewModal.fileName;
                    document.body.appendChild(a);
                    a.click();
                    a.remove();
                  }}
                  style={{
                    ...btnGhost,
                    padding: '6px 14px',
                    fontSize: 12,
                    fontWeight: 700,
                    color: T.primary,
                  }}
                >
                  <Icon name="save" size={14} /> Save to PC
                </button>
                <button
                  type="button"
                  onClick={handleClosePreviewModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    fontSize: 22,
                    cursor: 'pointer',
                    color: T.textSub,
                    lineHeight: 1,
                  }}
                >
                  <Icon name="close" size={14} />
                </button>
              </div>
            </div>

            <div
              style={{
                flex: 1,
                background: T.surfaceMuted,
                borderRadius: T.radius.md,
                overflow: 'hidden',
                border: `1px solid ${T.border}`,
                display: 'flex',
              }}
            >
              {previewModal.mimeType.includes('pdf') ||
              previewModal.fileName.toLowerCase().endsWith('.pdf') ? (
                <iframe
                  src={previewModal.url}
                  title={previewModal.fileName}
                  style={{ width: '100%', height: '100%', border: 'none' }}
                />
              ) : (
                <div
                  style={{
                    width: '100%',
                    height: '100%',
                    display: 'grid',
                    placeItems: 'center',
                    padding: 16,
                    overflow: 'auto',
                  }}
                >
                  <img
                    src={previewModal.url}
                    alt={previewModal.fileName}
                    style={{
                      maxWidth: '100%',
                      maxHeight: '100%',
                      objectFit: 'contain',
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* ── My signature (enroll / renew) ───────────────────── */}
      {showSignature && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(15,30,23,0.45)',
            display: 'grid',
            placeItems: 'center',
            zIndex: 1000,
            padding: 16,
            overflow: 'auto',
          }}
        >
          <div style={{ width: '100%', maxWidth: 640 }}>
            <div style={{ textAlign: 'right', marginBottom: 8 }}>
              <button
                type="button"
                style={btnGhost}
                onClick={() => setShowSignature(false)}
              >
                <Icon name="close" size={14} /> Close
              </button>
            </div>
            <SignatureEnrollment onSaved={() => {
              setSignatureStatus('enrolled');
              setSignatureStatusError(null);
            }} />
          </div>
        </div>
      )}
    </div>
  );
}
