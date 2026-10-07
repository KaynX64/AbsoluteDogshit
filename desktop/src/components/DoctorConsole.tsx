// desktop/src/components/DoctorConsole.tsx
import React, { useState, useEffect } from 'react';
import PrescriptionGenerator from './PrescriptionGenerator';
import { io } from 'socket.io-client';
import AnalyticsDashboard from './AnalyticsDashboard';
import { queueOfflineMutation } from '../services/offlineSync';
import { T, btnPrimary, btnGhost, inputStyle } from '../theme';
import { API_BASE_URL, SOCKET_URL } from '../config/api';

export type DoctorViewMode = 'active' | 'scheduled' | 'history' | 'archive' | 'analytics';

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
  health_profile_updated_at?: string;
  queue_ticket?: string;
  queue_status?: string;
  past_chief_complaint?: string;
  past_diagnosis?: string;
  past_treatment?: string;
  past_clinical_notes?: string;
  past_dietary_notes?: string;
}

interface DoctorConsoleProps {
  /** Optional controlled view mode — sidebar drives it. Falls back to internal state. */
  viewMode?: DoctorViewMode;
  onViewModeChange?: (m: DoctorViewMode) => void;
}

const STATUS_STYLE = (status: string) => {
  switch (status) {
    case 'scheduled':  return { text: 'AWAITING NURSE',      bg: T.warningSoft, color: T.warning };
    case 'serving':    return { text: 'IN CONSULTATION',     bg: T.successSoft, color: T.success };
    case 'checked_in': return { text: 'TRIAGED · READY',     bg: T.infoSoft,    color: T.info };
    case 'completed':  return { text: 'COMPLETED',           bg: T.successSoft, color: T.success };
    case 'cancelled':  return { text: 'CANCELLED',           bg: T.dangerSoft,  color: T.danger };
    case 'no_show':    return { text: 'NO SHOW',             bg: T.sage100,     color: T.textSub };
    default:           return { text: status.toUpperCase(),  bg: T.sage100,     color: T.textSub };
  }
};

/* Quick-add catalogue — the twelve most common vaccines on a Philippine
   university campus. Doctors can still type anything else in the field below. */
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

export default function DoctorConsole({
  viewMode: controlledView,
  onViewModeChange,
}: DoctorConsoleProps = {}) {
  const [internalView] = useState<DoctorViewMode>('active');
  const viewMode = controlledView ?? internalView;

  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppointmentItem | null>(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  /* ── Form fields ─────────────────────────────────────────────── */
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmittingEMR, setIsSubmittingEMR] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{
    text: string;
    type: 'success' | 'error';
    pdfKind?: 'prescriptions' | 'clearances';
    pdfId?: number;
  } | null>(null);

  const [attachedFile, setAttachedFile] = useState<File | null>(null);

  const [bpSystolic, setBpSystolic] = useState('120');
  const [bpDiastolic, setBpDiastolic] = useState('80');
  const [temperature, setTemperature] = useState('36.6');
  const [pulseRate, setPulseRate] = useState('75');
  const [spo2, setSpo2] = useState('98');
  const [respRate, setRespRate] = useState('18');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
// ── Vaccination History State ──────────────────────────────────────────────
  const [patientVaccines, setPatientVaccines] = useState<string[]>([]);
  const [newVaccineInput, setNewVaccineInput] = useState('');
  const [isSavingVaccines, setIsSavingVaccines] = useState(false);
  const [vaccineMsg, setVaccineMsg] = useState<string | null>(null);

  const commonVaccines = [
    'COVID-19 Primary & Booster',
    'Hepatitis B',
    'Tetanus Toxoid',
    'Influenza 2026',
    'Anti-Rabies',
    'MMR (Measles, Mumps, Rubella)',
    'Chickenpox (Varicella)',
    'HPV (Human Papillomavirus)',
    'Pneumococcal',
  ];
  const [docType, setDocType] = useState<'rx' | 'clearance'>('rx');
  const [clearancePurpose, setClearancePurpose] = useState('On-the-Job Training (OJT) Medical Clearance');
  const [clearanceRemarks, setClearanceRemarks] = useState('Physically fit to undergo university practicum requirements.');
  const [isIssuingClearance, setIsIssuingClearance] = useState(false);
  const [clearanceExpiryDate, setClearanceExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  });

  /* ── History & archive state ─────────────────────────────────── */
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [patientSearchQuery, setPatientSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearchingPatients, setIsSearchingPatients] = useState(false);
  const [selectedDirectoryPatient, setSelectedDirectoryPatient] = useState<any | null>(null);
  const [directoryTimeline, setDirectoryTimeline] = useState<any[]>([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);

  /* ── Immunization modal state ────────────────────────────────── */
  const [showImmunizationModal, setShowImmunizationModal] = useState(false);
  const [patientImmunizations, setPatientImmunizations] = useState<string[]>([]);
  const [newImmunizations, setNewImmunizations] = useState<string[]>([]);
  const [loadingImmunizations, setLoadingImmunizations] = useState(false);
  const [savingImmunizations, setSavingImmunizations] = useState(false);
  const [customImmunizationInput, setCustomImmunizationInput] = useState('');
  const [immunizationFeedback, setImmunizationFeedback] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  /* ── Data fetchers ───────────────────────────────────────────── */
  const fetchAppointments = async (mode = viewMode, retainSelection = true) => {
    if (mode === 'analytics') return;
    setLoadingAppointments(true);
    const token = localStorage.getItem('valetudo_token');
    let url = `${API_BASE_URL}/api/appointments/today?filter=active`;
    if (mode === 'history')        url = `${API_BASE_URL}/api/appointments/today?filter=history`;
    else if (mode === 'scheduled') url = `${API_BASE_URL}/api/appointments/today?filter=scheduled`;

    try {
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (Array.isArray(data)) {
        const uniqueAppointments = Array.from(
          new Map(data.map((item: AppointmentItem) => [item.appointment_id, item])).values()
        );
        setAppointments(uniqueAppointments);
        if (uniqueAppointments.length > 0) {
          if (!retainSelection || !selectedApp) selectPatient(uniqueAppointments[0]);
          else {
            const updated = uniqueAppointments.find((a) => a.appointment_id === selectedApp.appointment_id);
            selectPatient(updated || uniqueAppointments[0]);
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
          title: '🔔 Patient Triaged & Ready',
          body: 'A student booked under your care has been checked in by the triage nurse.',
        });
      }
    });
    socket.on('queue:updated', () => fetchAppointments(viewMode, true));
    socket.on('appointment:cancelled', () => fetchAppointments(viewMode, true));
    return () => { socket.disconnect(); };
  }, [viewMode]);

  const resetForm = () => {
    setChiefComplaint('');
    setDiagnosis('');
    setTreatmentPlan('');
    setClinicalNotes('');
    setAttachedFile(null);
    setFeedbackMsg(null);
  };

  const selectPatient = (app: AppointmentItem) => {
    setSelectedApp(app);
    let rawComplaint = app.past_chief_complaint || app.notes || `${app.appointment_type} requested`;
    if (rawComplaint.includes('[TRIAGE VITALS]')) {
      rawComplaint = rawComplaint.replace(/\[TRIAGE VITALS\][^\n]*\n?/, '').trim();
    }
    setChiefComplaint(rawComplaint || `${app.appointment_type} requested`);
    setDiagnosis(app.past_diagnosis || '');
    setTreatmentPlan(app.past_treatment || '');
    setClinicalNotes(app.past_clinical_notes || '');
    setHeight(app.height ? String(app.height) : '');
    setWeight(app.weight ? String(app.weight) : '');
    setAttachedFile(null);
    setFeedbackMsg(null);

    if (app.notes && app.notes.includes('[TRIAGE VITALS]')) {
      const bpMatch = app.notes.match(/BP:\s*(\d+)\/(\d+)/);
      if (bpMatch) { setBpSystolic(bpMatch[1]); setBpDiastolic(bpMatch[2]); }
      const tempMatch = app.notes.match(/Temp:\s*([0-9.]+)/);
      if (tempMatch) setTemperature(tempMatch[1]);
      const pulseMatch = app.notes.match(/Pulse:\s*(\d+)/);
      if (pulseMatch) setPulseRate(pulseMatch[1]);
    }
    fetchPatientVaccines(app.patient_id);
  };
  const fetchPatientVaccines = async (userId: number) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/patient/${userId}/immunizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPatientVaccines(data.immunizations || []);
      }
    } catch (_) {
      setPatientVaccines([]);
    }
  };

  const handleAddVaccine = (vaccineName: string) => {
    const trimmed = vaccineName.trim();
    if (!trimmed) return;
    if (patientVaccines.includes(trimmed)) {
      setVaccineMsg('⚠️ Vaccine already recorded in patient list.');
      return;
    }
    setPatientVaccines([...patientVaccines, trimmed]);
    setNewVaccineInput('');
    setVaccineMsg(null);
  };

  const handleRemoveVaccine = (vaccineName: string) => {
    setPatientVaccines(patientVaccines.filter((v) => v !== vaccineName));
  };

  const handleSaveVaccinationHistory = async () => {
    if (!selectedApp) return;
    setIsSavingVaccines(true);
    setVaccineMsg(null);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/patient/${selectedApp.patient_id}/immunizations`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ immunizations: patientVaccines }),
      });
      const data = await res.json();
      if (res.ok) {
        setVaccineMsg('✅ Immunization records saved to health profile!');
      } else {
        setVaccineMsg('❌ ' + (data.error || 'Failed to save vaccines.'));
      }
    } catch (err: any) {
      setVaccineMsg('❌ Network error: ' + err.message);
    } finally {
      setIsSavingVaccines(false);
    }
  };

  const handleStartConsultation = async () => {
    if (!selectedApp) return;
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${selectedApp.appointment_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'serving' }),
      });
      if (res.ok) {
        setSelectedApp({ ...selectedApp, status: 'serving' });
        fetchAppointments('active', true);
        setFeedbackMsg({ text: '▶ Consultation in progress.', type: 'success' });
      } else {
        const errData = await res.json();
        setFeedbackMsg({ text: errData.error || 'Failed to begin consultation.', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message, type: 'error' });
    }
  };

  const handleFinishConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;
    if (!diagnosis.trim()) {
      setFeedbackMsg({ text: '⚠️ Please enter a clinical diagnosis before finalizing.', type: 'error' });
      return;
    }
    setIsSubmittingEMR(true);
    setFeedbackMsg(null);
    const token = localStorage.getItem('valetudo_token');

    const encounterPayload = {
      patient_user_id: selectedApp.patient_id,
      appointment_id: selectedApp.appointment_id,
      chief_complaint: chiefComplaint,
      diagnosis,
      treatment_plan: treatmentPlan,
      notes: clinicalNotes,
      vitals: {
        systolic_bp: bpSystolic, diastolic_bp: bpDiastolic,
        temperature, pulse: pulseRate, spo2, resp_rate: respRate,
        height, weight,
      },
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
        text: '🌐 [Offline Mode] Network unavailable. Encounter saved to local offline queue. Will auto-sync to MySQL upon reconnection.',
        type: 'success',
      });
      return;
    }

    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${selectedApp.appointment_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify(encounterPayload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to complete encounter.');

      let fileSuccess = false;
      if (attachedFile && data.emrId) {
        try {
          const formData = new FormData();
          formData.append('file', attachedFile);
          const uploadRes = await fetch(`${API_BASE_URL}/api/documents/emr/${data.emrId}/attachments`, {
            method: 'POST',
            headers: { Authorization: `Bearer ${token}` },
            body: formData,
          });
          if (uploadRes.ok) fileSuccess = true;
        } catch (_) {}
      }

      await fetchAppointments('active', false);
      resetForm();
      setFeedbackMsg({
        text: fileSuccess
          ? '✅ Encounter finalized, lab file uploaded to MinIO S3, and patient discharged.'
          : '✅ Encounter finalized and patient discharged to History Archive.',
        type: 'success',
      });
    } catch (err: any) {
      queueOfflineMutation({
        table_name: 'EMR_RECORDS',
        record_uuid: crypto.randomUUID(),
        action: 'CREATE',
        payload: encounterPayload,
      });
      resetForm();
      setFeedbackMsg({
        text: '⚠️ Server unreachable. Encounter queued locally in offline storage. Will replay automatically when online.',
        type: 'success',
      });
    } finally {
      setIsSubmittingEMR(false);
    }
  };

  const handleViewPatientHistory = async () => {
    if (!selectedApp) return;
    setShowHistoryModal(true);
    setLoadingHistory(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/patient/${selectedApp.patient_id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) setPatientHistory(data);
    } catch (err) { console.error('History fetch error:', err); }
    finally { setLoadingHistory(false); }
  };

  const handleSearchPatientDirectory = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!patientSearchQuery.trim()) return;
    setIsSearchingPatients(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(
        `${API_BASE_URL}/api/appointments/patients/search?query=${encodeURIComponent(patientSearchQuery.trim())}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      if (res.ok) setSearchResults(await res.json());
    } catch (err) { console.error('Failed to search patients:', err); }
    finally { setIsSearchingPatients(false); }
  };

  const loadPatientTimeline = async (patient: any) => {
    setSelectedDirectoryPatient(patient);
    setLoadingTimeline(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/patient/${patient.user_id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) setDirectoryTimeline(await res.json());
    } catch (err) { console.error('Failed to load patient timeline:', err); }
    finally { setLoadingTimeline(false); }
  };

  /* ── Immunization handlers ───────────────────────────────────── */
  const openImmunizationModal = async () => {
    if (!selectedApp) return;
    setShowImmunizationModal(true);
    setPatientImmunizations([]);
    setNewImmunizations([]);
    setCustomImmunizationInput('');
    setImmunizationFeedback(null);
    setLoadingImmunizations(true);

    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/profile/${selectedApp.patient_id}/immunizations`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setPatientImmunizations(Array.isArray(data.immunizations) ? data.immunizations : []);
      } else {
        const err = await res.json().catch(() => ({}));
        setImmunizationFeedback({
          text: '❌ ' + (err.error || 'Failed to load immunization records.'),
          type: 'error',
        });
      }
    } catch (err: any) {
      setImmunizationFeedback({ text: '❌ Network error: ' + err.message, type: 'error' });
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
        text: '⚠️ That immunization is already on record or already queued for this visit.',
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
      const res = await fetch(`${API_BASE_URL}/api/profile/${selectedApp.patient_id}/immunizations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ immunizations: newImmunizations }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to save immunization records.');

      setPatientImmunizations(Array.isArray(data.immunizations) ? data.immunizations : []);
      setNewImmunizations([]);
      setImmunizationFeedback({ text: '✅ ' + data.message, type: 'success' });
      setFeedbackMsg({ text: `💉 ${data.message}`, type: 'success' });
    } catch (err: any) {
      setImmunizationFeedback({ text: '❌ ' + err.message, type: 'error' });
    } finally {
      setSavingImmunizations(false);
    }
  };

   // ── Fetch the official signed PDF from MinIO and save it ──────────
  const handleDownloadPdf = async (
    kind: 'prescriptions' | 'clearances',
    id: number
  ) => {
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/${kind}/${id}/pdf`, {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setFeedbackMsg({
          text: '❌ PDF download failed: ' + (err.error || `HTTP ${res.status}`),
          type: 'error',
        });
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);

      // Use an <a download> click — Electron routes this through its
      // native download pipeline (save dialog + file picker) instead of
      // the popup handler that blocks blob: URLs.
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
      setFeedbackMsg({
        text: '❌ Network error fetching PDF: ' + err.message,
        type: 'error',
      });
    }
  };
  const handlePrintClearance = async () => {
    if (!selectedApp) return;
    setIsIssuingClearance(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/documents/clearances`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          user_id: selectedApp.patient_id,
          purpose: clearancePurpose,
          remarks: clearanceRemarks,
          expires_at: clearanceExpiryDate,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to issue medical clearance.');

      const realQrToken = data.qrToken;
      const clearanceId = data.clearanceId;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(realQrToken)}`;

      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <title>Medical Clearance #${clearanceId}</title>
            <style>
              body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1e293b; max-width: 800px; margin: 0 auto; }
              .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
              .header h1 { margin: 0; color: #0f766e; font-size: 20px; }
              .title { text-align: center; margin: 26px 0 16px; font-size: 18px; font-weight: bold; text-decoration: underline; }
              .patient-box { margin: 16px 0; padding: 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 13px; line-height: 1.6; }
              .body-text { font-size: 14px; line-height: 1.8; margin-top: 18px; }
              .verification-panel { margin-top: 26px; display: flex; align-items: center; gap: 20px; border: 1px solid #99f6e4; background: #f0fdfa; padding: 16px; border-radius: 6px; }
              .footer { margin-top: 40px; display: space-between; align-items: flex-end; font-size: 12px; }
              .sig-line { border-top: 1px solid #000; width: 220px; text-align: center; font-weight: bold; padding-top: 4px; }
            </style>
          </head>
          <body>
            <div class="header">
              <h1>PANGASINAN STATE UNIVERSITY INFIRMARY</h1>
              <p>Lingayen Campus Medical Services • Republic Act No. 10173 Verified E-Clearance</p>
            </div>
            <div class="title">OFFICIAL MEDICAL CLEARANCE CERTIFICATE</div>
            <div class="patient-box">
              <b>Student Name:</b> ${selectedApp.first_name} ${selectedApp.last_name} &nbsp;|&nbsp; <b>ID No:</b> ${selectedApp.student_no || 'N/A'}<br/>
              <b>Course / Department:</b> ${selectedApp.course || 'PSU Student'}<br/>
              <b>Vital Signs:</b> Height: ${height || selectedApp.height || '162'} cm &nbsp;|&nbsp; Weight: ${weight || selectedApp.weight || '54'} kg &nbsp;|&nbsp; Blood Type: ${selectedApp.blood_type || 'O+'}
            </div>
            <p class="body-text">
              To Whom It May Concern:<br/><br/>
              This certifies that the student named above has undergone clinical evaluation at the PSU Lingayen Campus Infirmary on <b>${new Date().toLocaleDateString()}</b> and is determined to be:
              <br/><br/>
              <b>Purpose:</b> ${clearancePurpose}<br/>
              <b>Valid Until:</b> <span style="color: #0f766e; font-weight: bold;">${new Date(clearanceExpiryDate).toLocaleDateString()}</span><br/>
              <b>Clinical Assessment / Remarks:</b> ${clearanceRemarks}
            </p>
            <div class="verification-panel">
              <img src="${qrImageUrl}" width="110" height="110" alt="Clearance QR Verification" />
              <div>
                <b style="color: #0f766e;">Republic Act No. 10173 Cryptographic Seal</b>
                <p style="margin: 4px 0; font-size: 11px; color: #64748b;">
                  Verifiable by university deans, athletic screening committees, or host training establishments.
                </p>
                <code style="font-size: 10px; background: #fff; padding: 2px 6px; border: 1px solid #cbd5e1; border-radius: 4px;">${realQrToken}</code>
              </div>
            </div>
            <div class="footer">
              <div>
                <p>Issued Date: ${new Date().toLocaleDateString()}</p>
                <p>Expiration Date: ${new Date(clearanceExpiryDate).toLocaleDateString()}</p>
                <p>Clearance Ref: CLR-${clearanceId}</p>
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

      setFeedbackMsg({
        text: `✅ Clearance #${clearanceId} (Expires: ${clearanceExpiryDate}) issued!`,
        type: 'success',
        pdfKind: 'clearances',
        pdfId: clearanceId,
      });
    } catch (err: any) {
      setFeedbackMsg({ text: 'Error issuing clearance: ' + err.message, type: 'error' });
    } finally {
      setIsIssuingClearance(false);
    }
  };

  const isArchivedMode = viewMode === 'history' || selectedApp?.status === 'completed' || selectedApp?.status === 'cancelled';

  /* ═══════════════════════════════════════════════════════════════ */
  /* RENDER                                                          */
  /* ═══════════════════════════════════════════════════════════════ */

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
    analytics: 'Campus illness trajectories, seasonal spike monitoring & health reports',
  };

  return (
    <div style={{ width: '100%' }}>
      {/* ── Page header ─────────────────────────────────────── */}
      {viewMode !== 'analytics' && (
        <div style={{ marginBottom: 20 }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6, color: T.text, margin: 0 }}>
            {headerTitle[viewMode]}
          </h1>
          <p style={{ fontSize: 13.5, color: T.textSub, margin: '6px 0 0' }}>{headerSub[viewMode]}</p>
        </div>
      )}

      {/* ── Queue grid (hidden on analytics/archive) ────────── */}
      {viewMode !== 'analytics' && viewMode !== 'archive' && (
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius.lg,
          padding: 22,
          marginBottom: 22,
          boxShadow: T.shadow.xs,
        }}>
          {loadingAppointments ? (
            <div style={{ padding: 24, textAlign: 'center', color: T.textSub, fontSize: 13 }}>
              Loading roster…
            </div>
          ) : appointments.length === 0 ? (
            <div style={{
              padding: '28px 20px', textAlign: 'center',
              color: T.textSub, fontSize: 13, lineHeight: 1.6,
            }}>
              {viewMode === 'active'
                ? 'No patients currently waiting in your consultation queue.'
                : viewMode === 'scheduled'
                ? 'No pending mobile bookings assigned to your schedule.'
                : 'No archived consultations found for your department.'}
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: 12,
            }}>
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
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 6,
                        fontFamily: T.mono, fontSize: 11.5, fontWeight: 700,
                        color: T.primary,
                        background: T.surface, padding: '3px 8px', borderRadius: T.radius.xs,
                        border: `1px solid ${T.primaryTint}`,
                      }}>
                        🎫 {app.queue_ticket || 'DONE'}
                      </span>
                      <span style={{
                        padding: '3px 10px', borderRadius: T.radius.pill,
                        background: badge.bg, color: badge.color,
                        fontSize: 10, fontWeight: 800, letterSpacing: 0.3,
                      }}>
                        {badge.text}
                      </span>
                    </div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: T.text, marginBottom: 4 }}>
                      {app.first_name} {app.last_name}
                    </div>
                    <div style={{ fontSize: 12, color: T.textSub, marginBottom: 2 }}>
                      {app.appointment_type}
                    </div>
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: T.mono }}>
                      ⏰ {app.time_slot}
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
        <div style={{
          background: T.surface,
          border: `1px solid ${T.border}`,
          borderRadius: T.radius.lg,
          padding: 22,
          boxShadow: T.shadow.xs,
        }}>
          <form onSubmit={handleSearchPatientDirectory} style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
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
              <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>
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
                        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text }}>
                          {p.first_name} {p.last_name}
                        </div>
                        <div style={{ fontSize: 11.5, color: T.primary, fontWeight: 700, marginTop: 2 }}>
                          {p.identifier_no}
                        </div>
                        <div style={{ fontSize: 11, color: T.textSub, marginTop: 2 }}>
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
                <div style={{ padding: '60px 20px', textAlign: 'center', color: T.textMuted, fontSize: 13, lineHeight: 1.6 }}>
                  Select a patient from the search results to inspect their chronological EMR timeline.
                </div>
              ) : loadingTimeline ? (
                <p style={{ color: T.textSub, fontSize: 13 }}>Loading clinical timeline…</p>
              ) : (
                <div>
                  <div style={{
                    background: T.sage100, padding: '14px 18px',
                    borderRadius: T.radius.md, marginBottom: 18,
                  }}>
                    <h4 style={{ margin: 0, color: T.text, fontSize: 15, fontWeight: 800 }}>
                      {selectedDirectoryPatient.first_name} {selectedDirectoryPatient.last_name}
                      <span style={{ color: T.primary, marginLeft: 8, fontSize: 13 }}>
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
                  </div>

                  <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: 1.4, color: T.textMuted, textTransform: 'uppercase', marginBottom: 10 }}>
                    Chronological encounter history ({directoryTimeline.length})
                  </div>

                  {directoryTimeline.length === 0 ? (
                    <p style={{ fontSize: 13, color: T.textSub }}>No prior encounters on record.</p>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {directoryTimeline.map((item) => (
                        <div key={item.emr_id} style={{
                          border: `1px solid ${T.border}`,
                          borderRadius: T.radius.md,
                          padding: 16,
                          background: T.surface,
                          boxShadow: T.shadow.xs,
                        }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                            <span style={{ fontSize: 13, fontWeight: 800, color: T.primary }}>
                              {new Date(item.encounter_date).toLocaleDateString()} ·{' '}
                              {new Date(item.encounter_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                            <span style={{ fontSize: 11.5, color: T.textSub }}>
                              Dr. {item.doctor_last_name}
                            </span>
                          </div>
                          <div style={{ fontSize: 13, marginBottom: 4, color: T.text }}>
                            <b>Complaint:</b> {item.chief_complaint}
                          </div>
                          <div style={{ fontSize: 13, marginBottom: 4, color: T.info }}>
                            <b>Diagnosis:</b> {item.diagnosis}
                          </div>
                          {item.treatment_plan && (
                            <div style={{ fontSize: 12.5, color: T.textSub, marginBottom: 4 }}>
                              <b>Plan:</b> {item.treatment_plan}
                            </div>
                          )}

                          {item.vitals && item.vitals.filter(Boolean).length > 0 && (
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8 }}>
                              {item.vitals.filter(Boolean).map((v: any, vi: number) => (
                                <span key={vi} style={{
                                  fontSize: 11, background: T.sage100, color: T.textSub,
                                  padding: '3px 8px', borderRadius: T.radius.xs,
                                  fontFamily: T.mono, fontWeight: 600,
                                }}>
                                  {v.metric}: <b style={{ color: T.text }}>{v.value} {v.unit}</b>
                                </span>
                              ))}
                            </div>
                          )}

                          {item.attachments && item.attachments.length > 0 && (
                            <div style={{
                              marginTop: 10, paddingTop: 10,
                              borderTop: `1px dashed ${T.border}`,
                              display: 'flex', gap: 8, flexWrap: 'wrap',
                            }}>
                              {item.attachments.map((att: any) => (
                                <a
                                  key={att.attachment_id}
                                  href={`${API_BASE_URL}/api/documents/attachments/${att.attachment_id}/download`}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    fontSize: 11.5, color: T.info,
                                    fontWeight: 700, textDecoration: 'none',
                                    background: T.infoSoft, padding: '4px 10px',
                                    borderRadius: T.radius.xs,
                                  }}
                                >
                                  📎 {att.file_name}
                                </a>
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
            <div style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderLeft: `5px solid ${
                selectedApp.status === 'scheduled' ? T.warning
                : selectedApp.status === 'completed' ? T.success
                : T.info
              }`,
              borderRadius: T.radius.lg,
              padding: '18px 22px',
              marginBottom: 22,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 16,
              boxShadow: T.shadow.xs,
            }}>
              <div style={{ minWidth: 260 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text }}>
                    {selectedApp.first_name} {selectedApp.last_name}
                    <span style={{ color: T.textSub, fontSize: 13, fontWeight: 600, marginLeft: 8 }}>
                      {selectedApp.student_no || 'Staff'}
                    </span>
                  </h3>
                  <span style={{
                    background: T.sage100, color: T.textSub,
                    fontSize: 11.5, fontWeight: 700,
                    padding: '3px 10px', borderRadius: T.radius.pill,
                  }}>
                    {selectedApp.course || 'PSU Lingayen'}
                  </span>
                  <span style={{
                    background: STATUS_STYLE(selectedApp.status).bg,
                    color: STATUS_STYLE(selectedApp.status).color,
                    fontSize: 10.5, fontWeight: 800, letterSpacing: 0.3,
                    padding: '3px 10px', borderRadius: T.radius.pill,
                  }}>
                    {STATUS_STYLE(selectedApp.status).text}
                  </span>
                </div>

                <div style={{ display: 'flex', gap: 18, marginTop: 10, fontSize: 12.5, flexWrap: 'wrap' }}>
                  <span><b style={{ color: T.textSub }}>Blood:</b> {selectedApp.blood_type || 'O+'}</span>
                  <span>
                    <b style={{ color: T.textSub }}>Allergies:</b>{' '}
                    <span style={{
                      color: selectedApp.allergies && selectedApp.allergies !== 'None' ? T.danger : T.success,
                      fontWeight: 700,
                    }}>
                      {selectedApp.allergies ? `⚠️ ${selectedApp.allergies}` : 'None reported'}
                    </span>
                  </span>
                  <span><b style={{ color: T.textSub }}>Conditions:</b> {selectedApp.chronic_conditions || 'None'}</span>
                  <span><b style={{ color: T.textSub }}>H:</b> {selectedApp.height ? `${selectedApp.height} cm` : '—'}</span>
                  <span><b style={{ color: T.textSub }}>W:</b> {selectedApp.weight ? `${selectedApp.weight} kg` : '—'}</span>
                  {selectedApp.health_profile_updated_at && (
                    <span style={{ color: T.textMuted, fontStyle: 'italic' }}>
                      Last verified: {new Date(selectedApp.health_profile_updated_at).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={handleViewPatientHistory}
                  style={{ ...btnGhost, color: T.info, borderColor: T.infoBorder }}
                >
                  📜 Past EMR history
                </button>

                <button
                  type="button"
                  onClick={openImmunizationModal}
                  style={{ ...btnGhost, color: T.primary, borderColor: T.primaryTint }}
                  title="View and append immunization records"
                >
                  💉 Immunizations
                </button>

                {selectedApp.status === 'completed' ? (
                  <span style={{
                    background: T.successSoft, color: T.success,
                    padding: '10px 16px', borderRadius: T.radius.pill,
                    fontWeight: 700, fontSize: 12.5,
                    border: `1px solid ${T.successBorder}`,
                  }}>
                    ✅ Encounter discharged
                  </span>
                ) : selectedApp.status === 'scheduled' ? (
                  <span style={{
                    background: T.warningSoft, color: T.warning,
                    padding: '10px 16px', borderRadius: T.radius.pill,
                    fontWeight: 700, fontSize: 12.5,
                    border: `1px solid ${T.warningBorder}`,
                  }}>
                    ⏳ Awaiting nurse triage
                  </span>
                ) : selectedApp.status === 'serving' ? (
                  <span style={{
                    background: T.successSoft, color: T.success,
                    padding: '10px 16px', borderRadius: T.radius.pill,
                    fontWeight: 700, fontSize: 13,
                    border: `1px solid ${T.successBorder}`,
                  }}>
                    🩺 In consultation
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
{/* 💉 PATIENT VACCINATION & IMMUNIZATION HISTORY MANAGER */}
          {selectedApp && (
            <div style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg,
              padding: '18px 22px',
              marginBottom: 20,
              boxShadow: T.shadow.xs,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 10 }}>
                <div>
                  <h4 style={{ margin: 0, fontSize: 15, fontWeight: 800, color: T.primary }}>
                    💉 Patient Vaccination & Immunization History
                  </h4>
                  <p style={{ margin: '3px 0 0', fontSize: 12, color: T.textSub }}>
                    Verified in-person clinical vaccine records for <b>{selectedApp.first_name} {selectedApp.last_name}</b> (R.A. 10173 Protected)
                  </p>
                </div>

                <button
                  type="button"
                  onClick={handleSaveVaccinationHistory}
                  disabled={isSavingVaccines || isArchivedMode}
                  style={{
                    ...btnPrimary,
                    padding: '8px 18px',
                    fontSize: 12.5,
                    opacity: (isSavingVaccines || isArchivedMode) ? 0.6 : 1,
                    cursor: (isSavingVaccines || isArchivedMode) ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSavingVaccines ? 'Saving…' : '💾 Save Vaccines to Profile'}
                </button>
              </div>

              {/* Vaccine Badges Display */}
              <div style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: 8,
                padding: '12px 14px',
                background: T.sage50,
                borderRadius: T.radius.md,
                border: `1px solid ${T.borderSoft}`,
                minHeight: 46,
                alignItems: 'center',
              }}>
                {patientVaccines.length === 0 ? (
                  <span style={{ fontSize: 12, color: T.textMuted, fontStyle: 'italic' }}>
                    No immunizations recorded yet. Select from common vaccines or type below to add.
                  </span>
                ) : (
                  patientVaccines.map((v) => (
                    <span
                      key={v}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                        padding: '4px 12px',
                        borderRadius: T.radius.pill,
                        background: '#D7E8D2',
                        color: '#264D36',
                        fontSize: 12,
                        fontWeight: 700,
                        border: '1px solid #BBF7D0',
                      }}
                    >
                      ✓ {v}
                      {!isArchivedMode && (
                        <button
                          type="button"
                          onClick={() => handleRemoveVaccine(v)}
                          title="Remove vaccine"
                          style={{
                            background: 'none',
                            border: 'none',
                            color: '#7A2E26',
                            cursor: 'pointer',
                            fontWeight: 900,
                            padding: 0,
                            marginLeft: 2,
                            fontSize: 13,
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </span>
                  ))
                )}
              </div>

              {/* Inputter & Quick Suggestion Pills */}
              {!isArchivedMode && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                    <input
                      type="text"
                      placeholder="Type vaccine name (e.g. Tetanus Toxoid 2nd Dose, Pneumococcal)..."
                      value={newVaccineInput}
                      onChange={(e) => setNewVaccineInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddVaccine(newVaccineInput);
                        }
                      }}
                      style={{
                        ...inputStyle,
                        flex: '1 1 280px',
                        padding: '8px 14px',
                        fontSize: 12.5,
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => handleAddVaccine(newVaccineInput)}
                      style={{
                        ...btnGhost,
                        padding: '8px 16px',
                        fontSize: 12.5,
                        background: T.sage100,
                        borderColor: T.sage300,
                        color: T.primary,
                        fontWeight: 700,
                      }}
                    >
                      + Add to List
                    </button>
                  </div>

                  {/* Quick presets */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: T.textMuted }}>Quick Presets:</span>
                    {commonVaccines.map((cv) => {
                      const alreadyHas = patientVaccines.includes(cv);
                      return (
                        <button
                          key={cv}
                          type="button"
                          onClick={() => handleAddVaccine(cv)}
                          disabled={alreadyHas}
                          style={{
                            padding: '3px 10px',
                            borderRadius: T.radius.pill,
                            fontSize: 11,
                            fontWeight: 600,
                            background: alreadyHas ? T.sage100 : T.surface,
                            color: alreadyHas ? T.textMuted : T.textSub,
                            border: `1px solid ${T.border}`,
                            cursor: alreadyHas ? 'default' : 'pointer',
                            opacity: alreadyHas ? 0.6 : 1,
                          }}
                        >
                          {alreadyHas ? '✓ ' : '+ '} {cv}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {vaccineMsg && (
                <div style={{
                  marginTop: 10,
                  fontSize: 12,
                  fontWeight: 700,
                  color: vaccineMsg.includes('✅') ? T.success : T.danger,
                }}>
                  {vaccineMsg}
                </div>
              )}
            </div>
          )}
          {/* Two-column workspace */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.15fr', gap: 20 }}>
            {/* LEFT: Document issuance */}
            <section style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg,
              padding: 22,
              boxShadow: T.shadow.xs,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
                <h3 style={{ margin: 0, color: T.primary, fontSize: 16, fontWeight: 800 }}>
                  Official document issuance
                </h3>
                <div style={{
                  display: 'flex', gap: 4, padding: 3,
                  background: T.sage100, borderRadius: T.radius.pill,
                }}>
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
                          padding: '6px 14px', borderRadius: T.radius.pill,
                          border: 'none',
                          background: isActive ? T.surface : 'transparent',
                          color: isActive ? T.primary : T.textSub,
                          fontSize: 12, fontWeight: 700, cursor: 'pointer',
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
              {/* ── Shared issuance feedback banner (Feature 8 isolation fix) ── */}
              {feedbackMsg && (
                <div
                  style={{
                    marginBottom: 16,
                    padding: '12px 16px',
                    borderRadius: T.radius.md,
                    fontSize: 12.5,
                    fontWeight: 600,
                    background: feedbackMsg.type === 'success' ? T.successSoft : T.dangerSoft,
                    color: feedbackMsg.type === 'success' ? T.success : T.danger,
                    border: `1px solid ${feedbackMsg.type === 'success' ? T.successBorder : T.dangerBorder}`,
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
                          color: '#fff',
                          border: 'none',
                          fontSize: 11.5,
                          fontWeight: 700,
                          cursor: 'pointer',
                          fontFamily: T.font,
                          whiteSpace: 'nowrap',
                        }}
                      >
                        ⬇️ Download PDF
                      </button>
                    )}
                </div>
              )}
              {docType === 'rx' ? (
              <PrescriptionGenerator
                key={selectedApp?.appointment_id}
                patientUserId={selectedApp?.patient_id || 5}
                verifiedPatient={{
                  first_name: selectedApp?.first_name || 'Daniella',
                  last_name: selectedApp?.last_name || 'Movida',
                  student_no: selectedApp?.student_no || '22-LN-0123',
                  course: selectedApp?.course || 'BS Information Technology',
                  allergies: selectedApp?.allergies || 'None',
                }}
                initialNotes={selectedApp?.past_dietary_notes}
                isArchived={isArchivedMode}
                onPrescriptionIssued={(info) => {
                  setFeedbackMsg({
                    text: `✅ Prescription #${info.prescriptionId} recorded and signed.`,
                    type: 'success',
                    pdfKind: 'prescriptions',
                    pdfId: info.prescriptionId,
                  });
                }}
                onPrescriptionError={(message) => {
                  setFeedbackMsg({ text: message, type: 'error' });
                }}
              />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                      Clearance purpose
                    </label>
                    <select
                      value={clearancePurpose}
                      disabled={isArchivedMode}
                      onChange={(e) => setClearancePurpose(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="On-the-Job Training (OJT) Medical Clearance">On-the-Job Training (OJT) Medical Clearance</option>
                      <option value="SCUAA / Sports Athletic Meet Participation">SCUAA / Sports Athletic Meet Participation</option>
                      <option value="Academic Readmission / Excuse Certificate">Academic Readmission / Excuse Certificate</option>
                      <option value="Annual Campus Physical Examination">Annual Campus Physical Examination</option>
                    </select>
                  </div>

                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: T.textSub }}>
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
                                if (opt.days)   d.setDate(d.getDate() + opt.days);
                                if (opt.months) d.setMonth(d.getMonth() + opt.months);
                                if (opt.years)  d.setFullYear(d.getFullYear() + opt.years);
                                setClearanceExpiryDate(d.toISOString().split('T')[0]);
                              }}
                              style={{
                                fontSize: 10.5, padding: '3px 8px',
                                borderRadius: T.radius.xs,
                                border: `1px solid ${T.border}`,
                                background: T.sage50, color: T.primary,
                                cursor: 'pointer', fontWeight: 700,
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
                    <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                      Clinical fitness statement
                    </label>
                    <textarea
                      rows={5}
                      value={clearanceRemarks}
                      disabled={isArchivedMode}
                      readOnly={isArchivedMode}
                      onChange={(e) => setClearanceRemarks(e.target.value)}
                      style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
                    />
                  </div>

                  <button
                    type="button"
                    onClick={handlePrintClearance}
                    disabled={!selectedApp || isIssuingClearance || selectedApp.status === 'scheduled' || isArchivedMode}
                    style={{
                      ...btnPrimary,
                      width: '100%',
                      padding: 12,
                      opacity: (!selectedApp || isIssuingClearance || selectedApp.status === 'scheduled' || isArchivedMode) ? 0.5 : 1,
                      cursor: (!selectedApp || isIssuingClearance || selectedApp.status === 'scheduled' || isArchivedMode) ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {isArchivedMode
                      ? '🔒 Clearance already archived'
                      : isIssuingClearance
                      ? 'Signing & spooling…'
                      : '🖨️ Issue, sign & print clearance'}
                  </button>
                </div>
              )}
            </section>

            {/* RIGHT: Encounter diagnosis & vitals */}
            <section style={{
              background: T.surface,
              border: `1px solid ${T.border}`,
              borderRadius: T.radius.lg,
              padding: 22,
              boxShadow: T.shadow.xs,
            }}>
              <h3 style={{ margin: '0 0 16px 0', color: T.info, fontSize: 16, fontWeight: 800 }}>
                🩺 Encounter diagnosis & vitals
              </h3>

              {isArchivedMode && (
                <div style={{
                  padding: '12px 16px', background: T.sage100, color: T.textSub,
                  borderRadius: T.radius.md, marginBottom: 16,
                  fontSize: 12.5, border: `1px solid ${T.border}`,
                }}>
                  🔒 <b>Archived record.</b> This encounter is completed and permanently signed. Fields below reflect the recorded EMR entry.
                </div>
              )}

              {selectedApp?.status === 'scheduled' && (
                <div style={{
                  padding: '12px 16px', background: T.warningSoft, color: '#92400E',
                  borderRadius: T.radius.md, marginBottom: 16,
                  fontSize: 12.5, border: `1px solid ${T.warningBorder}`,
                }}>
                  ⚠️ <b>Patient not yet triaged.</b> The student must first present their QR Health Pass at the intake desk for the clinic nurse to record initial vitals.
                </div>
              )}

              <form onSubmit={handleFinishConsultation}>
                {/* Vitals grid */}
                <div style={{
                  background: T.sage50, padding: 14, borderRadius: T.radius.md,
                  marginBottom: 16, border: `1px solid ${T.borderSoft}`,
                }}>
                  <div style={{
                    fontSize: 10.5, fontWeight: 800, letterSpacing: 1.4,
                    color: T.textSub, textTransform: 'uppercase',
                    marginBottom: 10,
                  }}>
                    Encounter vitals
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
                    {[
                      { label: 'BP systolic',   value: bpSystolic,   set: setBpSystolic },
                      { label: 'BP diastolic',  value: bpDiastolic,  set: setBpDiastolic },
                      { label: 'Temp (°C)',     value: temperature,  set: setTemperature },
                      { label: 'Pulse bpm',     value: pulseRate,    set: setPulseRate },
                      { label: 'SpO₂ %',        value: spo2,         set: setSpo2 },
                      { label: 'Resp cpm',      value: respRate,     set: setRespRate },
                      { label: 'Height cm',     value: height,       set: setHeight, placeholder: '162.5' },
                      { label: 'Weight kg',     value: weight,       set: setWeight, placeholder: '54.0' },
                    ].map((f) => (
                      <div key={f.label}>
                        <label style={{ fontSize: 10.5, color: T.textSub, fontWeight: 600 }}>{f.label}</label>
                        <input
                          style={{ ...inputStyle, marginTop: 4, padding: '8px 10px', fontSize: 13 }}
                          disabled={isArchivedMode}
                          readOnly={isArchivedMode}
                          placeholder={f.placeholder}
                          value={f.value}
                          onChange={(e) => f.set(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                    Chief complaint
                  </label>
                  <textarea
                    rows={2}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
                    value={chiefComplaint}
                    onChange={(e) => setChiefComplaint(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                    Clinical diagnosis
                  </label>
                  <input
                    style={inputStyle}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    value={diagnosis}
                    placeholder="e.g. Fit for OJT / Acute viral pharyngitis"
                    onChange={(e) => setDiagnosis(e.target.value)}
                    required
                  />
                </div>

                <div style={{ marginBottom: 14 }}>
                  <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
                    Treatment plan
                  </label>
                  <textarea
                    rows={3}
                    disabled={isArchivedMode}
                    readOnly={isArchivedMode}
                    style={{ ...inputStyle, resize: 'vertical', fontFamily: T.font }}
                    value={treatmentPlan}
                    placeholder="Prescribed regimen, rest recommendations…"
                    onChange={(e) => setTreatmentPlan(e.target.value)}
                  />
                </div>

                {!isArchivedMode && (
                  <div style={{
                    marginBottom: 16, padding: 14,
                    background: T.sage50, border: `1px dashed ${T.border}`,
                    borderRadius: T.radius.md,
                  }}>
                    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: T.textSub, marginBottom: 8 }}>
                      📎 Attach diagnostic lab result (CBC, urinalysis, X-ray PDF/image)
                    </label>
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,.jpg"
                      onChange={(e) => {
                        if (e.target.files && e.target.files[0]) setAttachedFile(e.target.files[0]);
                      }}
                      style={{ fontSize: 12, color: T.textSub }}
                    />
                    {attachedFile && (
                      <div style={{
                        fontSize: 12, color: T.primary, fontWeight: 700,
                        marginTop: 8, display: 'flex', alignItems: 'center', gap: 10,
                      }}>
                        <span>📄 {attachedFile.name} ({(attachedFile.size / 1024).toFixed(1)} KB)</span>
                        <button
                          type="button"
                          onClick={() => setAttachedFile(null)}
                          style={{
                            background: 'none', border: 'none', color: T.danger,
                            cursor: 'pointer', fontWeight: 700, fontSize: 12,
                          }}
                        >
                          ✕ Remove
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isSubmittingEMR || !selectedApp || selectedApp.status === 'scheduled' || isArchivedMode}
                  style={{
                    ...btnPrimary,
                    width: '100%', padding: 13,
                    background: (isArchivedMode || !selectedApp || selectedApp.status === 'scheduled') ? T.sage400 : T.primary,
                    opacity: (isArchivedMode || !selectedApp || selectedApp.status === 'scheduled') ? 0.6 : 1,
                    cursor: (isArchivedMode || !selectedApp || selectedApp.status === 'scheduled') ? 'not-allowed' : 'pointer',
                  }}
                >
                  {isSubmittingEMR
                    ? 'Finalizing encounter & uploading to MinIO…'
                    : isArchivedMode
                    ? '🔒 Encounter already finalized & discharged'
                    : selectedApp?.status === 'scheduled'
                    ? '⏳ Patient not triaged by nurse'
                    : '✅ Finish consultation & discharge'}
                </button>
              </form>
            </section>
          </div>
        </>
      )}

      {/* ── EMR History modal ───────────────────────────────── */}
      {showHistoryModal && (
        <div className="modal-backdrop" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-card" style={{ maxWidth: 780 }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `1px solid ${T.border}`, paddingBottom: 14, marginBottom: 18 }}>
              <h3 style={{ margin: 0, color: T.info, fontSize: 17, fontWeight: 800 }}>
                📜 Medical history: {selectedApp?.first_name} {selectedApp?.last_name}
              </h3>
              <button
                type="button"
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textSub }}
              >✕</button>
            </div>

            {loadingHistory ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textSub }}>Loading records…</div>
            ) : patientHistory.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', color: T.textMuted }}>No prior encounters recorded.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {patientHistory.map((item) => (
                  <div key={item.emr_id} style={{
                    border: `1px solid ${T.border}`,
                    borderRadius: T.radius.md,
                    padding: 16,
                    background: T.sage50,
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <b style={{ color: T.primary, fontSize: 13.5 }}>
                        {new Date(item.encounter_date).toLocaleDateString()}
                      </b>
                      <small style={{ color: T.textSub }}>
                        Attending: Dr. {item.doctor_last_name} ({item.doctor_license})
                      </small>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Diagnosis:</b> {item.diagnosis}</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Complaint:</b> {item.chief_complaint}</div>
                    {item.treatment_plan && (
                      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 4 }}>
                        <b>Treatment:</b> {item.treatment_plan}
                      </div>
                    )}
                    {item.notes && (
                      <div style={{ fontSize: 13, color: T.textSub, marginBottom: 4 }}>
                        <b>Clinical notes:</b> {item.notes}
                      </div>
                    )}
                    {item.prescriptions?.[0]?.notes && (
                      <div style={{ fontSize: 13, color: T.primary, marginBottom: 4 }}>
                        <b>Physician dietary / Rx notes:</b> {item.prescriptions[0].notes}
                      </div>
                    )}

                    {item.attachments && item.attachments.length > 0 && (
                      <div style={{
                        marginTop: 10, paddingTop: 10,
                        borderTop: `1px dashed ${T.border}`,
                      }}>
                        <div style={{
                          fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2,
                          color: T.primary, textTransform: 'uppercase',
                          marginBottom: 8,
                        }}>
                          📎 Diagnostic lab attachments
                        </div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          {item.attachments.map((att: any) => (
                            <a
                              key={att.attachment_id}
                              href={`${API_BASE_URL}/api/documents/attachments/${att.attachment_id}/download`}
                              target="_blank"
                              rel="noreferrer"
                              style={{
                                display: 'inline-flex', alignItems: 'center', gap: 6,
                                padding: '5px 12px',
                                background: T.infoSoft, color: T.info,
                                borderRadius: T.radius.xs,
                                fontSize: 11.5, fontWeight: 700,
                                textDecoration: 'none',
                                border: `1px solid ${T.infoBorder}`,
                              }}
                            >
                              📄 {att.file_name} ({(att.file_size / 1024).toFixed(0)} KB)
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
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
                  💉
                </div>
                <div style={{ minWidth: 0 }}>
                  <h3 style={{ margin: 0, fontSize: 17, fontWeight: 800, color: T.text }}>
                    Immunization records
                  </h3>
                  <p style={{ margin: '3px 0 0', fontSize: 12.5, color: T.textSub }}>
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
                ✕
              </button>
            </div>

            {/* Body */}
            <div style={{ padding: '20px 26px', maxHeight: '66vh', overflowY: 'auto' }}>
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
                  <div style={{ fontSize: 13, color: T.textMuted, padding: '12px 0' }}>
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
                        ✓ {imm}
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
                      patientImmunizations.some((p) => p.toLowerCase() === lower) ||
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
                          border: `1px solid ${disabled ? T.borderSoft : T.border}`,
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
                      cursor: customImmunizationInput.trim() ? 'pointer' : 'not-allowed',
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
                          ✕
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
                      immunizationFeedback.type === 'success' ? T.successSoft : T.dangerSoft,
                    color:
                      immunizationFeedback.type === 'success' ? T.success : T.danger,
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
              <p style={{ margin: 0, fontSize: 11.5, color: T.textMuted, fontStyle: 'italic' }}>
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
                      savingImmunizations || newImmunizations.length === 0 ? 0.5 : 1,
                    cursor:
                      savingImmunizations || newImmunizations.length === 0
                        ? 'not-allowed'
                        : 'pointer',
                  }}
                >
                  {savingImmunizations
                    ? 'Saving…'
                    : `Save ${newImmunizations.length} new record${newImmunizations.length === 1 ? '' : 's'}`}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}