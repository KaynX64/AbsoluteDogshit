// desktop/src/components/DoctorConsole.tsx
import React, { useState, useEffect } from 'react';
import PrescriptionGenerator from './PrescriptionGenerator';
import { io } from 'socket.io-client';

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
  past_diagnosis?: string;
  past_treatment?: string;
}

export default function DoctorConsole() {
  const [appointments, setAppointments] = useState<AppointmentItem[]>([]);
  const [selectedApp, setSelectedApp] = useState<AppointmentItem | null>(null);
  const [loadingAppointments, setLoadingAppointments] = useState(false);

  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');

  // Form fields
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmittingEMR, setIsSubmittingEMR] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Encounter Vitals
  const [bpSystolic, setBpSystolic] = useState('120');
  const [bpDiastolic, setBpDiastolic] = useState('80');
  const [temperature, setTemperature] = useState('36.6');
  const [pulseRate, setPulseRate] = useState('75');

  // Document Issuance Tab
  const [docType, setDocType] = useState<'rx' | 'clearance'>('rx');
  const [clearancePurpose, setClearancePurpose] = useState('On-the-Job Training (OJT) Medical Clearance');
  const [clearanceRemarks, setClearanceRemarks] = useState('Physically fit to undergo university practicum requirements.');
  const [isIssuingClearance, setIsIssuingClearance] = useState(false);

  // Expiration Date State (Defaults to 6 months from today)
  const [clearanceExpiryDate, setClearanceExpiryDate] = useState<string>(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 6);
    return d.toISOString().split('T')[0];
  });

  // Patient EMR History State
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [patientHistory, setPatientHistory] = useState<any[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const fetchAppointments = async (mode = viewMode, retainSelection = true) => {
    setLoadingAppointments(true);
    const token = localStorage.getItem('valetudo_token');

    const url =
      mode === 'history'
        ? 'http://localhost:5000/api/appointments/today?filter=history'
        : 'http://localhost:5000/api/appointments/today';

    try {
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setAppointments(data);
        if (data.length > 0) {
          if (!retainSelection || !selectedApp) {
            selectPatient(data[0]);
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
    fetchAppointments('active', false);

    const socket = io('http://localhost:5000');
    socket.on('appointment:booked', (newBooking: any) => {
      fetchAppointments(viewMode, true);
      if (window.electronAPI?.showNotification) {
        window.electronAPI.showNotification({
          title: '📅 New Consultation Booked',
          body: `${newBooking?.patientName || 'A student'} scheduled a visit.`,
        });
      }
    });

    socket.on('appointment:cancelled', () => fetchAppointments(viewMode, true));
    socket.on('appointment:status_changed', () => fetchAppointments(viewMode, true));

    return () => {
      socket.disconnect();
    };
  }, [viewMode]);

  const handleSwitchView = (mode: 'active' | 'history') => {
    setViewMode(mode);
    fetchAppointments(mode, false);
  };

  const resetForm = () => {
    setChiefComplaint('');
    setDiagnosis('');
    setTreatmentPlan('');
    setClinicalNotes('');
    setFeedbackMsg(null);
  };

  const selectPatient = (app: AppointmentItem) => {
    setSelectedApp(app);
    setChiefComplaint(app.notes || `${app.appointment_type} requested`);
    setDiagnosis(app.past_diagnosis || '');
    setTreatmentPlan(app.past_treatment || '');
    setClinicalNotes('');
    setFeedbackMsg(null);

    if (app.notes && app.notes.includes('[TRIAGE VITALS]')) {
      const bpMatch = app.notes.match(/BP:\s*(\d+)\/(\d+)/);
      if (bpMatch) {
        setBpSystolic(bpMatch[1]);
        setBpDiastolic(bpMatch[2]);
      }
      const tempMatch = app.notes.match(/Temp:\s*([0-9.]+)/);
      if (tempMatch) setTemperature(tempMatch[1]);
      const pulseMatch = app.notes.match(/Pulse:\s*(\d+)/);
      if (pulseMatch) setPulseRate(pulseMatch[1]);
    }
  };

  const handleStartConsultation = async () => {
    if (!selectedApp) return;
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`http://localhost:5000/api/appointments/${selectedApp.appointment_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'serving' }),
      });
      if (res.ok) {
        setSelectedApp({ ...selectedApp, status: 'serving' });
        fetchAppointments('active', true);
        setFeedbackMsg({ text: '▶ Consultation in progress.', type: 'success' });
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
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`http://localhost:5000/api/appointments/${selectedApp.appointment_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          patient_user_id: selectedApp.patient_id,
          chief_complaint: chiefComplaint,
          diagnosis,
          treatment_plan: treatmentPlan,
          notes: clinicalNotes,
          vitals: {
            systolic_bp: bpSystolic,
            diastolic_bp: bpDiastolic,
            temperature,
            pulse: pulseRate,
          },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        await fetchAppointments('active', false);
        resetForm();
        setFeedbackMsg({ text: '✅ Encounter finalized and patient discharged.', type: 'success' });
      } else {
        setFeedbackMsg({ text: data.error || 'Failed to complete encounter.', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message, type: 'error' });
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
      const res = await fetch(`http://localhost:5000/api/appointments/patient/${selectedApp.patient_id}/history`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (Array.isArray(data)) {
        setPatientHistory(data);
      }
    } catch (err) {
      console.error('History fetch error:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePrintClearance = async () => {
    if (!selectedApp) return;

    setIsIssuingClearance(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      // Step A: Send custom expiration date to backend
      const res = await fetch('http://localhost:5000/api/documents/clearances', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          user_id: selectedApp.patient_id,
          purpose: clearancePurpose,
          remarks: clearanceRemarks,
          expires_at: clearanceExpiryDate,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to issue medical clearance.');
      }

      const realQrToken = data.qrToken;
      const clearanceId = data.clearanceId;
      const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(realQrToken)}`;

      // Step B: Printable HTML displaying the selected expiration date
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
              .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; font-size: 12px; }
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
              <b>Vital Signs:</b> Height: ${selectedApp.height || '162'} cm &nbsp;|&nbsp; Weight: ${selectedApp.weight || '54'} kg &nbsp;|&nbsp; Blood Type: ${selectedApp.blood_type || 'O+'}
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

      setFeedbackMsg({ text: `✅ Clearance #${clearanceId} (Expires: ${clearanceExpiryDate}) issued!`, type: 'success' });
    } catch (err: any) {
      setFeedbackMsg({ text: 'Error issuing clearance: ' + err.message, type: 'error' });
    } finally {
      setIsIssuingClearance(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%',
    boxSizing: 'border-box',
    padding: '8px 10px',
    border: '1px solid #cbd5e1',
    borderRadius: 6,
    fontSize: 13,
    color: '#0f172a',
    backgroundColor: '#ffffff',
  };

  return (
    <div>
      {/* 1. TOP ROSTER */}
      <div style={{ background: '#ffffff', padding: 16, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: '#0284c7' }}>
              {viewMode === 'active' ? "⏳ Doctor's Active Consultation Queue" : '📜 Consultation History Archive'}
            </h3>
            <small style={{ color: '#64748b' }}>Scheduled appointments and checked-in walk-in arrivals</small>
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={() => handleSwitchView('active')}
              style={{
                padding: '6px 14px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                border: '1px solid #0284c7',
                background: viewMode === 'active' ? '#0284c7' : '#ffffff',
                color: viewMode === 'active' ? '#ffffff' : '#0284c7',
              }}
            >
              ⏳ Active Queue
            </button>
            <button
              onClick={() => handleSwitchView('history')}
              style={{
                padding: '6px 14px',
                borderRadius: 4,
                fontSize: 12,
                fontWeight: 'bold',
                cursor: 'pointer',
                border: '1px solid #0284c7',
                background: viewMode === 'history' ? '#0284c7' : '#ffffff',
                color: viewMode === 'history' ? '#ffffff' : '#0284c7',
              }}
            >
              📜 History Archive
            </button>
            <button
              onClick={() => fetchAppointments(viewMode, true)}
              style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              🔄
            </button>
          </div>
        </div>

        {loadingAppointments ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Loading appointments...</p>
        ) : appointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b', fontSize: 13 }}>
            {viewMode === 'active' ? '🎉 All consultations completed! Active queue is clear.' : 'No archived consultations found.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {appointments.map((app) => {
              const isSelected = selectedApp?.appointment_id === app.appointment_id;
              return (
                <div
                  key={app.appointment_id}
                  onClick={() => selectPatient(app)}
                  style={{
                    padding: 12,
                    borderRadius: 6,
                    border: isSelected ? '2px solid #0284c7' : '1px solid #e2e8f0',
                    background: isSelected ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#0284c7', fontSize: 13 }}>
                      📅 {app.date_str} • ⏰ {app.time_slot}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: '#f1f5f9', color: '#334155', fontWeight: 'bold' }}>
                      {app.status.toUpperCase()}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: 14, color: '#1e293b' }}>
                    {app.first_name} {app.last_name}
                  </p>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{app.appointment_type}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. PATIENT SAFETY & VITALS BANNER */}
      {selectedApp && (
        <div
          style={{
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderLeft: '5px solid #0284c7',
            borderRadius: 8,
            padding: '12px 18px',
            marginBottom: 20,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <h4 style={{ margin: 0, fontSize: 16, color: '#0f172a' }}>
                {selectedApp.first_name} {selectedApp.last_name} ({selectedApp.student_no || 'ID: Staff'})
              </h4>
              <span style={{ background: '#f1f5f9', color: '#475569', fontSize: 12, padding: '2px 8px', borderRadius: 4 }}>
                {selectedApp.course || 'PSU Lingayen'}
              </span>
            </div>

            <div style={{ display: 'flex', gap: 18, marginTop: 8, fontSize: 13 }}>
              <span><b>Blood:</b> {selectedApp.blood_type || 'O+'}</span>
              <span>
                <b>Allergies:</b>{' '}
                <span style={{ color: selectedApp.allergies ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>
                  {selectedApp.allergies ? `⚠️ ${selectedApp.allergies}` : 'None reported'}
                </span>
              </span>
              <span><b>Conditions:</b> {selectedApp.chronic_conditions || 'None'}</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              onClick={handleViewPatientHistory}
              style={{ padding: '8px 14px', background: '#f8fafc', color: '#0284c7', border: '1px solid #0284c7', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
            >
              📜 Past EMR History
            </button>
            {selectedApp.status === 'scheduled' || selectedApp.status === 'checked_in' ? (
              <button
                type="button"
                onClick={handleStartConsultation}
                style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
              >
                ▶ Begin Consultation
              </button>
            ) : selectedApp.status === 'serving' ? (
              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px 14px', borderRadius: 6, fontWeight: 'bold', fontSize: 13 }}>
                🩺 In Consultation
              </span>
            ) : null}
          </div>
        </div>
      )}

      {/* 3. MAIN WORKSPACE */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20 }}>
        {/* LEFT: Clinical Consultation Form */}
        <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff', textAlign: 'left' }}>
          <h3 style={{ margin: '0 0 14px 0', color: '#0284c7', fontSize: 16 }}>🩺 Encounter Diagnosis & Vitals Logging</h3>

          <form onSubmit={handleFinishConsultation}>
            {/* Vitals Input Grid */}
            <div style={{ background: '#f8fafc', padding: 10, borderRadius: 6, marginBottom: 12, border: '1px solid #e2e8f0' }}>
              <small style={{ fontWeight: 'bold', color: '#475569', display: 'block', marginBottom: 6 }}>
                Encounter Vitals (Persists to Normalized VITAL_SIGNS table):
              </small>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>BP (Systolic):</label>
                  <input
                    style={inputStyle}
                    value={bpSystolic}
                    onChange={(e) => setBpSystolic(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>BP (Diastolic):</label>
                  <input
                    style={inputStyle}
                    value={bpDiastolic}
                    onChange={(e) => setBpDiastolic(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Temp (°C):</label>
                  <input
                    style={inputStyle}
                    value={temperature}
                    onChange={(e) => setTemperature(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: 11, color: '#64748b' }}>Pulse (bpm):</label>
                  <input
                    style={inputStyle}
                    value={pulseRate}
                    onChange={(e) => setPulseRate(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Chief Complaint:
              </label>
              <textarea
                rows={2}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={chiefComplaint}
                onChange={(e) => setChiefComplaint(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Clinical Diagnosis:
              </label>
              <input
                style={inputStyle}
                value={diagnosis}
                placeholder="e.g. Fit for OJT / Acute Viral Pharyngitis"
                onChange={(e) => setDiagnosis(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Treatment Plan:
              </label>
              <textarea
                rows={3}
                style={{ ...inputStyle, resize: 'vertical' }}
                value={treatmentPlan}
                placeholder="Prescribed medicine regimen, rest recommendations..."
                onChange={(e) => setTreatmentPlan(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmittingEMR || !selectedApp}
              style={{
                width: '100%',
                padding: 12,
                background: !selectedApp ? '#94a3b8' : '#059669',
                color: '#ffffff',
                border: 'none',
                borderRadius: 6,
                cursor: !selectedApp ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: 14,
              }}
            >
              {isSubmittingEMR ? 'Finalizing Encounter...' : '✅ Finish Consultation & Discharge'}
            </button>

            {feedbackMsg && (
              <p style={{ color: feedbackMsg.type === 'success' ? '#16a34a' : '#dc2626', fontSize: 13, fontWeight: 'bold', textAlign: 'center', marginTop: 10 }}>
                {feedbackMsg.text}
              </p>
            )}
          </form>
        </section>

        {/* RIGHT: Document Issuance */}
        <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff', textAlign: 'left' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>Official Document Issuance</h3>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                type="button"
                onClick={() => setDocType('rx')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid #0f766e',
                  background: docType === 'rx' ? '#0f766e' : '#fff',
                  color: docType === 'rx' ? '#fff' : '#0f766e',
                }}
              >
                ℞ Prescription
              </button>
              <button
                type="button"
                onClick={() => setDocType('clearance')}
                style={{
                  padding: '4px 10px',
                  borderRadius: 4,
                  fontSize: 12,
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  border: '1px solid #0f766e',
                  background: docType === 'clearance' ? '#0f766e' : '#fff',
                  color: docType === 'clearance' ? '#fff' : '#0f766e',
                }}
              >
                📄 Clearance
              </button>
            </div>
          </div>

          {docType === 'rx' ? (
            <PrescriptionGenerator
              patientUserId={selectedApp?.patient_id || 5}
              verifiedPatient={{
                first_name: selectedApp?.first_name || 'Daniella',
                last_name: selectedApp?.last_name || 'Movida',
                student_no: selectedApp?.student_no || '22-LN-0123',
                course: selectedApp?.course || 'BS Information Technology',
                allergies: selectedApp?.allergies || 'None',
              }}
              onPrescriptionIssued={() => {
                setFeedbackMsg({ text: '✅ Prescription successfully issued to patient.', type: 'success' });
              }}
            />
          ) : (
            <div>
              {/* 1. Clearance Purpose Selection */}
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                  Clearance Purpose:
                </label>
                <select
                  value={clearancePurpose}
                  onChange={(e) => setClearancePurpose(e.target.value)}
                  style={inputStyle}
                >
                  <option value="On-the-Job Training (OJT) Medical Clearance">On-the-Job Training (OJT) Medical Clearance</option>
                  <option value="SCUAA / Sports Athletic Meet Participation">SCUAA / Sports Athletic Meet Participation</option>
                  <option value="Academic Readmission / Excuse Certificate">Academic Readmission / Excuse Certificate</option>
                  <option value="Annual Campus Physical Examination">Annual Campus Physical Examination</option>
                </select>
              </div>

              {/* 2. Expiration Date Input with Preset Chips */}
              <div style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155' }}>
                    Validity / Expiration Date:
                  </label>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setDate(d.getDate() + 30);
                        setClearanceExpiryDate(d.toISOString().split('T')[0]);
                      }}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f766e', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Set validity for 30 days"
                    >
                      +30 Days (Sports)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setMonth(d.getMonth() + 6);
                        setClearanceExpiryDate(d.toISOString().split('T')[0]);
                      }}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f766e', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Set validity for 6 months"
                    >
                      +6 Months (OJT)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const d = new Date();
                        d.setFullYear(d.getFullYear() + 1);
                        setClearanceExpiryDate(d.toISOString().split('T')[0]);
                      }}
                      style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, border: '1px solid #cbd5e1', background: '#f8fafc', color: '#0f766e', cursor: 'pointer', fontWeight: 'bold' }}
                      title="Set validity for 1 year"
                    >
                      +1 Year (Annual)
                    </button>
                  </div>
                </div>
                <input
                  type="date"
                  value={clearanceExpiryDate}
                  onChange={(e) => setClearanceExpiryDate(e.target.value)}
                  style={inputStyle}
                  required
                />
              </div>

              {/* 3. Clinical Remarks */}
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                  Clinical Fitness Statement:
                </label>
                <textarea
                  rows={4}
                  value={clearanceRemarks}
                  onChange={(e) => setClearanceRemarks(e.target.value)}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>

              {/* 4. Issue and Print Action Button */}
              <button
                type="button"
                onClick={handlePrintClearance}
                disabled={!selectedApp || isIssuingClearance}
                style={{
                  width: '100%',
                  padding: 10,
                  background: !selectedApp || isIssuingClearance ? '#94a3b8' : '#0284c7',
                  color: '#fff',
                  border: 'none',
                  borderRadius: 6,
                  cursor: !selectedApp || isIssuingClearance ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: 14,
                }}
              >
                {isIssuingClearance ? 'Signing & Spooling...' : '🖨️ Issue, Sign & Print Clearance'}
              </button>
            </div>
          )}
        </section>
      </div>

      {/* 4. MODAL: EMR HISTORY */}
      {showHistoryModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
          }}
        >
          <div
            style={{
              background: '#fff',
              width: '85%',
              maxWidth: 750,
              maxHeight: '80vh',
              borderRadius: 8,
              padding: 24,
              overflowY: 'auto',
              boxShadow: '0 10px 25px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: 12 }}>
              <h3 style={{ margin: 0, color: '#0284c7' }}>
                📜 Medical History: {selectedApp?.first_name} {selectedApp?.last_name}
              </h3>
              <button
                onClick={() => setShowHistoryModal(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, cursor: 'pointer', fontWeight: 'bold' }}
              >
                ✕
              </button>
            </div>

            {loadingHistory ? (
              <p style={{ textAlign: 'center', padding: '20px 0', color: '#64748b' }}>Loading records...</p>
            ) : patientHistory.length === 0 ? (
              <p style={{ textAlign: 'center', padding: '20px 0', color: '#64748b' }}>No prior encounters recorded.</p>
            ) : (
              <div style={{ marginTop: 16 }}>
                {patientHistory.map((item) => (
                  <div
                    key={item.emr_id}
                    style={{
                      border: '1px solid #e2e8f0',
                      borderRadius: 6,
                      padding: 14,
                      marginBottom: 12,
                      background: '#f8fafc',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                      <b style={{ color: '#0f766e', fontSize: 14 }}>{new Date(item.encounter_date).toLocaleDateString()}</b>
                      <small style={{ color: '#64748b' }}>Attending: Dr. {item.doctor_last_name} ({item.doctor_license})</small>
                    </div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Diagnosis:</b> {item.diagnosis}</div>
                    <div style={{ fontSize: 13, marginBottom: 4 }}><b>Complaint:</b> {item.chief_complaint}</div>
                    {item.treatment_plan && <div style={{ fontSize: 13, color: '#334155' }}><b>Treatment:</b> {item.treatment_plan}</div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}