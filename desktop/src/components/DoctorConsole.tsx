// desktop/src/components/DoctorConsole.tsx
import React, { useState, useEffect } from 'react';
import PrescriptionGenerator from './PrescriptionGenerator';

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

  // View Mode: 'active' (Scheduled/Checked-in/Serving) vs 'history' (Completed/Cancelled)
  const [viewMode, setViewMode] = useState<'active' | 'history'>('active');

  // EMR Form fields
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [isSubmittingEMR, setIsSubmittingEMR] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Document Issuance Tab ('rx' | 'clearance')
  const [docType, setDocType] = useState<'rx' | 'clearance'>('rx');
  const [clearancePurpose, setClearancePurpose] = useState('On-the-Job Training (OJT) Medical Clearance');
  const [clearanceRemarks, setClearanceRemarks] = useState('Physically fit to undergo university practicum requirements.');

  const fetchAppointments = async (mode = viewMode) => {
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
          selectPatient(data[0]);
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
    fetchAppointments('active');
  }, []);

  const handleSwitchView = (mode: 'active' | 'history') => {
    setViewMode(mode);
    fetchAppointments(mode);
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
        fetchAppointments('active');
        setFeedbackMsg({ text: '▶ Consultation in progress.', type: 'success' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message, type: 'error' });
    }
  };

  // When finished: save EMR, drop patient from active list, and reset form
  const handleFinishConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedApp) return;

    if (!diagnosis.trim()) {
      alert('Please enter a clinical diagnosis before finalizing.');
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
        }),
      });

      const data = await res.json();
      if (res.ok) {
        // Patient completed: refresh active queue (they disappear from active cards)
        await fetchAppointments('active');
        resetForm();
        setFeedbackMsg({ text: '✅ Consultation completed! Patient discharged and archived.', type: 'success' });
      } else {
        setFeedbackMsg({ text: data.error || 'Failed to complete encounter.', type: 'error' });
      }
    } catch (err: any) {
      setFeedbackMsg({ text: err.message, type: 'error' });
    } finally {
      setIsSubmittingEMR(false);
    }
  };

  const handleMarkNoShow = async () => {
    if (!selectedApp || !window.confirm('Mark this appointment as No-Show? It will be removed from the active queue.')) return;
    const token = localStorage.getItem('valetudo_token');
    try {
      await fetch(`http://localhost:5000/api/appointments/${selectedApp.appointment_id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'no_show' }),
      });
      await fetchAppointments('active');
      resetForm();
    } catch (err) {}
  };

  const handlePrintClearance = () => {
    if (!selectedApp) return;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: 'Segoe UI', Tahoma, sans-serif; padding: 40px; color: #1e293b; }
            .header { text-align: center; border-bottom: 2px solid #0f766e; padding-bottom: 12px; }
            .header h1 { margin: 0; color: #0f766e; font-size: 20px; }
            .title { text-align: center; margin: 30px 0 20px; font-size: 20px; font-weight: bold; text-decoration: underline; }
            .patient-box { margin: 20px 0; padding: 14px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; font-size: 14px; line-height: 1.6; }
            .body-text { font-size: 14px; line-height: 1.8; margin-top: 20px; }
            .footer { margin-top: 60px; display: flex; justify-content: space-between; font-size: 12px; }
            .sig-line { border-top: 1px solid #000; width: 220px; margin-top: 50px; text-align: center; font-weight: bold; }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>PANGASINAN STATE UNIVERSITY INFIRMARY</h1>
            <p>Lingayen Campus Medical Services • Republic Act No. 10173 Compliant</p>
          </div>
          <div class="title">OFFICIAL MEDICAL CLEARANCE CERTIFICATE</div>
          <div class="patient-box">
            <b>Student Name:</b> ${selectedApp.first_name} ${selectedApp.last_name} &nbsp;|&nbsp; <b>ID No:</b> ${selectedApp.student_no || 'N/A'}<br/>
            <b>Course / Department:</b> ${selectedApp.course || 'PSU Student'}<br/>
            <b>Vital Signs:</b> Height: ${selectedApp.height || '162'} cm &nbsp;|&nbsp; Weight: ${selectedApp.weight || '54'} kg &nbsp;|&nbsp; Blood Type: ${selectedApp.blood_type || 'O+'}
          </div>
          <p class="body-text">
            To Whom It May Concern:<br/><br/>
            This certifies that the student named above has been examined at the PSU Lingayen Campus Infirmary on <b>${new Date().toLocaleDateString()}</b> and is found to be:
            <br/><br/>
            <b>Purpose:</b> ${clearancePurpose}<br/>
            <b>Clinical Assessment / Remarks:</b> ${clearanceRemarks}
          </p>
          <div class="footer">
            <div>
              <p>Issued Date: ${new Date().toLocaleDateString()}</p>
              <p>Validation Token: VALETUDO-CLR-${selectedApp.appointment_id}-${Date.now().toString().slice(-6)}</p>
            </div>
            <div>
              <div class="sig-line">Attending Campus Physician<br/><small>PRC License Verified</small></div>
            </div>
          </div>
        </body>
      </html>
    `;
    const printWin = window.open('', '_blank');
    if (printWin) {
      printWin.document.write(htmlContent);
      printWin.document.close();
      printWin.print();
    }
  };

  return (
    <div>
      {/* ------------------------------------------------------------- */}
      {/* 1. TOP ROSTER: ACTIVE QUEUE VS HISTORY ARCHIVE TOGGLE         */}
      {/* ------------------------------------------------------------- */}
      <div style={{ background: '#ffffff', padding: 16, borderRadius: 8, border: '1px solid #cbd5e1', marginBottom: 20 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <h3 style={{ margin: 0, color: '#0284c7' }}>
              {viewMode === 'active' ? "⏳ Doctor's Active Queue" : '📜 Consultation History & Archive'}
            </h3>
            <small style={{ color: '#64748b' }}>
              {viewMode === 'active'
                ? 'Shows patients scheduled, checked in, or currently serving'
                : 'Permanent record of completed, cancelled, and past consultations'}
            </small>
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
              onClick={() => fetchAppointments()}
              style={{ padding: '6px 10px', background: '#f1f5f9', border: '1px solid #cbd5e1', borderRadius: 4, cursor: 'pointer', fontSize: 12 }}
            >
              🔄
            </button>
          </div>
        </div>

        {loadingAppointments ? (
          <p style={{ color: '#64748b', fontSize: 13 }}>Loading...</p>
        ) : appointments.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '16px 0', color: '#64748b', fontSize: 13 }}>
            {viewMode === 'active'
              ? '🎉 All consultations completed! Active queue is clear.'
              : 'No archived consultations found.'}
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 12 }}>
            {appointments.map((app) => {
              const isSelected = selectedApp?.appointment_id === app.appointment_id;
              let badgeColor = '#b45309';
              let badgeBg = '#fef3c7';

              if (app.status === 'serving') {
                badgeColor = '#0369a1';
                badgeBg = '#e0f2fe';
              } else if (app.status === 'completed') {
                badgeColor = '#15803d';
                badgeBg = '#dcfce7';
              } else if (app.status === 'cancelled' || app.status === 'no_show') {
                badgeColor = '#b91c1c';
                badgeBg = '#fee2e2';
              }

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
                    boxShadow: isSelected ? '0 2px 4px rgba(2, 132, 199, 0.15)' : 'none',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 'bold', color: '#0284c7', fontSize: 13 }}>
                      📅 {app.date_str} • ⏰ {app.time_slot}
                    </span>
                    <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 4, background: badgeBg, color: badgeColor, fontWeight: 'bold', textTransform: 'uppercase' }}>
                      {app.status}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 2px', fontWeight: 'bold', fontSize: 14, color: '#1e293b' }}>
                    {app.first_name} {app.last_name}
                  </p>
                  <div style={{ fontSize: 12, color: '#64748b' }}>{app.appointment_type}</div>
                  {app.cancelled_reason && (
                    <div style={{ fontSize: 11, color: '#b91c1c', marginTop: 4, fontStyle: 'italic' }}>
                      Reason: {app.cancelled_reason}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------- */}
      {/* 2. PATIENT SAFETY STRIP: ALLERGIES & INTAKE VITALS             */}
      {/* ------------------------------------------------------------- */}
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
                {selectedApp.first_name} {selectedApp.last_name} ({selectedApp.student_no || 'ID: Staff/Faculty'})
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
              <span><b>Chronic:</b> {selectedApp.chronic_conditions || 'None'}</span>
              <span><b>Height/Weight:</b> {selectedApp.height || '162'} cm / {selectedApp.weight || '54'} kg</span>
            </div>
          </div>

          <div style={{ display: 'flex', gap: 8 }}>
            {selectedApp.status === 'scheduled' || selectedApp.status === 'checked_in' ? (
              <>
                <button
                  type="button"
                  onClick={handleStartConsultation}
                  style={{ padding: '8px 16px', background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
                >
                  ▶ Begin Consultation
                </button>
                <button
                  type="button"
                  onClick={handleMarkNoShow}
                  style={{ padding: '8px 12px', background: '#fee2e2', color: '#b91c1c', border: '1px solid #fca5a5', borderRadius: 6, cursor: 'pointer', fontSize: 12, fontWeight: 'bold' }}
                >
                  Mark No-Show
                </button>
              </>
            ) : selectedApp.status === 'serving' ? (
              <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '6px 14px', borderRadius: 6, fontWeight: 'bold', fontSize: 13 }}>
                🩺 In Consultation Room
              </span>
            ) : (
              <span style={{ background: '#dcfce7', color: '#15803d', padding: '6px 14px', borderRadius: 6, fontWeight: 'bold', fontSize: 13 }}>
                Archived Record ({selectedApp.status})
              </span>
            )}
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------- */}
      {/* 3. MAIN WORKSPACE: EMR (LEFT) + ISSUANCE (RIGHT)              */}
      {/* ------------------------------------------------------------- */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 1fr', gap: 20 }}>
        {/* LEFT: EMR Form */}
        <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <h3 style={{ margin: 0, color: '#0284c7', fontSize: 16 }}>🩺 Clinical Consultation & Diagnosis</h3>
            <span style={{ fontSize: 12, color: '#64748b' }}>Feature 6: Electronic Medical Records</span>
          </div>

          <form onSubmit={handleFinishConsultation}>
            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Chief Complaint / Symptoms:
              </label>
              <textarea
                rows={2}
                disabled={viewMode === 'history'}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#ffffff' }}
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
                disabled={viewMode === 'history'}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#ffffff' }}
                value={diagnosis}
                placeholder="e.g. Fit for OJT Practicum / Upper Respiratory Infection"
                onChange={(e) => setDiagnosis(e.target.value)}
                required
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Treatment Plan & Rx:
              </label>
              <textarea
                rows={3}
                disabled={viewMode === 'history'}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#ffffff' }}
                value={treatmentPlan}
                placeholder="Prescribed medicine regimen, home care, rest recommendations..."
                onChange={(e) => setTreatmentPlan(e.target.value)}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                Follow-up / Confidential Notes:
              </label>
              <input
                disabled={viewMode === 'history'}
                style={{ width: '100%', boxSizing: 'border-box', padding: 8, border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#ffffff' }}
                value={clinicalNotes}
                placeholder="Optional internal medical note"
                onChange={(e) => setClinicalNotes(e.target.value)}
              />
            </div>

            {viewMode === 'active' ? (
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
            ) : (
              <div style={{ padding: 10, background: '#f1f5f9', borderRadius: 6, textAlign: 'center', color: '#64748b', fontSize: 13, fontWeight: 'bold' }}>
                📁 Historical Record (Read-Only)
              </div>
            )}

            {feedbackMsg && (
              <p
                style={{
                  color: feedbackMsg.type === 'success' ? '#16a34a' : '#dc2626',
                  fontSize: 13,
                  fontWeight: 'bold',
                  textAlign: 'center',
                  marginTop: 10,
                }}
              >
                {feedbackMsg.text}
              </p>
            )}
          </form>
        </section>

        {/* RIGHT: Document Issuance */}
        <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff' }}>
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
              verifiedPatient={{
                first_name: selectedApp?.first_name || 'Daniella',
                last_name: selectedApp?.last_name || 'Movida',
                student_no: selectedApp?.student_no || '22-LN-0123',
                course: selectedApp?.course || 'BS Information Technology',
                allergies: selectedApp?.allergies || 'Penicillin',
              }}
              scannedToken={`SECURE-RX-${selectedApp?.appointment_id || '2026'}-VALETUDO`}
            />
          ) : (
            <div>
              <div style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                  Clearance Purpose:
                </label>
                <select
                  value={clearancePurpose}
                  onChange={(e) => setClearancePurpose(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, background: '#fff', color: '#0f172a' }}
                >
                  <option value="On-the-Job Training (OJT) Medical Clearance">On-the-Job Training (OJT) Medical Clearance</option>
                  <option value="SCUAA / Sports Athletic Meet Participation">SCUAA / Sports Athletic Meet Participation</option>
                  <option value="Academic Readmission / Excuse Certificate">Academic Readmission / Excuse Certificate</option>
                  <option value="Annual Campus Physical Examination">Annual Campus Physical Examination</option>
                </select>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 13, fontWeight: 'bold', color: '#334155', display: 'block', marginBottom: 4 }}>
                  Clinical Fitness Statement:
                </label>
                <textarea
                  rows={4}
                  value={clearanceRemarks}
                  onChange={(e) => setClearanceRemarks(e.target.value)}
                  style={{ width: '100%', boxSizing: 'border-box', padding: 8, borderRadius: 6, border: '1px solid #cbd5e1', fontSize: 13, color: '#0f172a', background: '#fff' }}
                />
              </div>

              <button
                type="button"
                onClick={handlePrintClearance}
                disabled={!selectedApp}
                style={{ width: '100%', padding: 10, background: '#0284c7', color: '#fff', border: 'none', borderRadius: 6, cursor: !selectedApp ? 'not-allowed' : 'pointer', fontWeight: 'bold', fontSize: 14 }}
              >
                🖨️ Generate & Print Medical Clearance
              </button>
              <small style={{ display: 'block', marginTop: 8, color: '#64748b', textAlign: 'center' }}>
                Generates a printable PDF with official PSU Infirmary authorization headers.
              </small>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}