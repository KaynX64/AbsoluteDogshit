// desktop/src/components/QrIntakeScanner.tsx
import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';

interface QrIntakeScannerProps {
  onPatientVerified: (patient: any, token: string) => void;
}

export default function QrIntakeScanner({ onPatientVerified }: QrIntakeScannerProps) {
  const [scanMode, setScanMode] = useState<'camera' | 'search' | 'manual'>('camera');
  const [searchQuery, setSearchQuery] = useState('22-LN-0123'); // Default test student
  const [manualToken, setManualToken] = useState('');
  const [verifiedPatient, setVerifiedPatient] = useState<any>(null);
  const [scanStatus, setScanStatus] = useState('');

  // Scheduled appointment detected for this patient
  const [pendingAppointment, setPendingAppointment] = useState<any>(null);
  const [checkInSuccess, setCheckInSuccess] = useState<string | null>(null);

  // Triage vitals intake
  const [bp, setBp] = useState('120/80');
  const [temp, setTemp] = useState('36.6');
  const [pulse, setPulse] = useState('78');

  // Camera stream refs
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  // 1. Verify QR Token
  const verifyToken = async (tokenToVerify: string) => {
    if (!tokenToVerify || tokenToVerify.trim().length === 0) return;

    setScanStatus('🔍 Verifying cryptographic QR pass signature...');
    setVerifiedPatient(null);
    setPendingAppointment(null);
    setCheckInSuccess(null);

    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch('http://localhost:5000/api/health-pass/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({ qrToken: tokenToVerify.trim() }),
      });

      const data = await res.json();
      if (res.ok && data.verified) {
        setVerifiedPatient(data.patient);
        onPatientVerified(data.patient, tokenToVerify.trim());
        setScanStatus('✅ Patient identity verified.');
        stopCamera();
        // Check if patient has any appointment to check in
        checkPatientAppointments(data.patient.user_id);
      } else {
        setScanStatus('❌ Verification Failed: ' + (data.error || 'Invalid or Expired QR Pass'));
      }
    } catch (err: any) {
      setScanStatus('❌ Connection Error: ' + err.message);
    }
  };

  // 2. Search Patient by Student ID / Name (Manual Fallback)
  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;

    setScanStatus('🔍 Searching student records...');
    setCheckInSuccess(null);
    const jwt = localStorage.getItem('valetudo_token');

    try {
      const res = await fetch(`http://localhost:5000/api/appointments/lookup?query=${encodeURIComponent(searchQuery.trim())}`, {
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
        });
        setPendingAppointment(app);
        setScanStatus(`✅ Patient record located: ${app.first_name} ${app.last_name}`);
      } else {
        setScanStatus('❌ No scheduled appointments found matching that query.');
      }
    } catch (err: any) {
      setScanStatus('❌ Search error: ' + err.message);
    }
  };

  // Check if verified patient has a booking
  const checkPatientAppointments = async (userId: number) => {
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`http://localhost:5000/api/appointments/lookup?userId=${userId}`, {
        headers: { Authorization: `Bearer ${jwt}` },
      });
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        setPendingAppointment(data[0]);
      } else {
        setPendingAppointment(null);
      }
    } catch (_) {}
  };

  // 3. Confirm Arrival & Admit to Queue
  const handleConfirmArrival = async () => {
    if (!pendingAppointment) return;

    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`http://localhost:5000/api/appointments/${pendingAppointment.appointment_id}/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify({
          blood_pressure: bp,
          temperature: temp,
          pulse: pulse,
        }),
      });

      const data = await res.json();
      if (res.ok) {
        setCheckInSuccess(`✅ Arrival Confirmed! Ticket ${data.queueTicket} assigned at ${data.arrivalTime}.`);
        setPendingAppointment({ ...pendingAppointment, status: 'checked_in' });
      } else {
        alert(data.error || 'Failed to check in patient.');
      }
    } catch (err: any) {
      alert('Error during check-in: ' + err.message);
    }
  };

  // Webcam Controls
  const startCamera = async () => {
    setCameraError('');
    setIsCameraActive(true);
    setScanStatus('📷 Webcam active. Center the student QR code.');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.play();
        requestAnimationFrame(tickScan);
      }
    } catch (err: any) {
      setCameraError('Cannot access webcam: ' + err.message);
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((t) => t.stop());
      videoRef.current.srcObject = null;
    }
    if (animationFrameId.current) {
      cancelAnimationFrame(animationFrameId.current);
      animationFrameId.current = null;
    }
    setIsCameraActive(false);
  };

  const tickScan = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;

    if (video && video.readyState === video.HAVE_ENOUGH_DATA && canvas) {
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });

      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const code = jsQR(imageData.data, imageData.width, imageData.height, {
          inversionAttempts: 'attemptBoth',
        });

        if (code && code.data && code.data.length > 20) {
          verifyToken(code.data);
          return;
        }
      }
    }
    animationFrameId.current = requestAnimationFrame(tickScan);
  };

  useEffect(() => () => stopCamera(), []);

  return (
    <section style={{ padding: 18, border: '1px solid #cbd5e1', borderRadius: 8, background: '#ffffff' }}>
      {/* Header & Mode Selector */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <h3 style={{ margin: 0, color: '#0f766e', fontSize: 16 }}>1. Patient Intake & Triage Check-in</h3>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => { setScanMode('camera'); setScanStatus(''); }}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #0f766e',
              background: scanMode === 'camera' ? '#0f766e' : '#ffffff',
              color: scanMode === 'camera' ? '#ffffff' : '#0f766e',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            📷 Scan QR
          </button>
          <button
            type="button"
            onClick={() => { setScanMode('search'); stopCamera(); setScanStatus(''); }}
            style={{
              padding: '4px 10px',
              fontSize: 12,
              borderRadius: 4,
              border: '1px solid #0f766e',
              background: scanMode === 'search' ? '#0f766e' : '#ffffff',
              color: scanMode === 'search' ? '#ffffff' : '#0f766e',
              cursor: 'pointer',
              fontWeight: 'bold',
            }}
          >
            🔍 Search ID
          </button>
        </div>
      </div>

      {/* MODE A: QR CAMERA */}
      {scanMode === 'camera' && (
        <div>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 10 }}>
            {!isCameraActive ? (
              <button
                type="button"
                onClick={startCamera}
                style={{ padding: '8px 14px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
              >
                ▶ Turn On Webcam
              </button>
            ) : (
              <button
                type="button"
                onClick={stopCamera}
                style={{ padding: '8px 14px', background: '#dc2626', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontWeight: 'bold', fontSize: 12 }}
              >
                ⏹ Stop Camera
              </button>
            )}
            <small style={{ color: '#64748b' }}>Scan student dynamic pass upon physical arrival.</small>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: 360, height: 200, background: '#0f172a', borderRadius: 8, overflow: 'hidden', margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video ref={videoRef} style={{ width: '100%', height: '100%', objectFit: 'cover', display: isCameraActive ? 'block' : 'none' }} />
            <canvas ref={canvasRef} style={{ display: 'none' }} />
            {!isCameraActive && <p style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center' }}>Webcam off.<br/>Click "Turn On Webcam" to scan.</p>}
          </div>
        </div>
      )}

      {/* MODE B: MANUAL STUDENT ID SEARCH */}
      {scanMode === 'search' && (
        <form onSubmit={handleManualSearch} style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
          <input
            style={{ flex: 1, padding: '8px 12px', border: '1px solid #cbd5e1', borderRadius: 6, fontSize: 13, color: '#0f172a', background: '#ffffff' }}
            placeholder="Enter Student ID (e.g. 22-LN-0123) or Last Name"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <button
            type="submit"
            style={{ padding: '8px 16px', background: '#0f766e', color: '#fff', border: 'none', borderRadius: 6, fontWeight: 'bold', cursor: 'pointer', fontSize: 13 }}
          >
            Find Booking
          </button>
        </form>
      )}

      {scanStatus && (
        <p style={{ fontSize: 13, margin: '10px 0', fontWeight: 'bold', color: scanStatus.includes('✅') ? '#16a34a' : '#dc2626' }}>
          {scanStatus}
        </p>
      )}

      {/* VERIFIED PATIENT & SCHEDULED APPOINTMENT CARD */}
      {verifiedPatient && (
        <div style={{ marginTop: 14, padding: 14, background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h4 style={{ margin: 0, color: '#0f766e', fontSize: 15 }}>
              👤 {verifiedPatient.first_name} {verifiedPatient.last_name} ({verifiedPatient.student_no || 'Staff'})
            </h4>
            <span style={{ fontSize: 12, color: '#64748b' }}>{verifiedPatient.course}</span>
          </div>

          <p style={{ margin: '6px 0', fontSize: 13 }}>
            <b>Allergies:</b> <span style={{ color: verifiedPatient.allergies ? '#dc2626' : '#16a34a', fontWeight: 'bold' }}>{verifiedPatient.allergies || 'None reported'}</span> &nbsp;|&nbsp;
            <b>Blood:</b> {verifiedPatient.blood_type || 'O+'}
          </p>

          {/* If patient has an active appointment */}
          {pendingAppointment ? (
            <div style={{ marginTop: 12, padding: 12, background: '#f0fdfa', border: '1px solid #99f6e4', borderRadius: 6 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <b style={{ color: '#0f766e', fontSize: 13 }}>📅 Scheduled Booking Detected:</b>
                <span style={{ fontSize: 11, padding: '2px 6px', borderRadius: 4, background: pendingAppointment.status === 'checked_in' ? '#dcfce7' : '#fef3c7', color: pendingAppointment.status === 'checked_in' ? '#15803d' : '#b45309', fontWeight: 'bold', textTransform: 'uppercase' }}>
                  {pendingAppointment.status}
                </span>
              </div>
              <p style={{ margin: '4px 0', fontSize: 13 }}>
                <b>Time:</b> {pendingAppointment.formatted_schedule || pendingAppointment.date_time}
              </p>
              <p style={{ margin: '2px 0 10px', fontSize: 13 }}>
                <b>Purpose:</b> {pendingAppointment.appointment_type} (Attending: Dr. {pendingAppointment.doc_last_name || 'Mata'})
              </p>

              {/* Triage Vitals Input by Nurse */}
              {pendingAppointment.status !== 'checked_in' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginBottom: 12 }}>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569' }}>Blood Pressure:</label>
                    <input style={{ width: '100%', padding: 4, fontSize: 12, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', color: '#0f172a' }} value={bp} onChange={(e) => setBp(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569' }}>Temp (°C):</label>
                    <input style={{ width: '100%', padding: 4, fontSize: 12, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', color: '#0f172a' }} value={temp} onChange={(e) => setTemp(e.target.value)} />
                  </div>
                  <div>
                    <label style={{ fontSize: 11, fontWeight: 'bold', color: '#475569' }}>Pulse (bpm):</label>
                    <input style={{ width: '100%', padding: 4, fontSize: 12, boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 4, background: '#fff', color: '#0f172a' }} value={pulse} onChange={(e) => setPulse(e.target.value)} />
                  </div>
                </div>
              )}

              {/* Check-In Confirm Button */}
              {pendingAppointment.status === 'checked_in' ? (
                <div style={{ color: '#16a34a', fontWeight: 'bold', fontSize: 13, textAlign: 'center' }}>
                  {checkInSuccess || '✅ Patient is checked in and waiting in queue.'}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleConfirmArrival}
                  style={{
                    width: '100%',
                    padding: '10px',
                    background: '#0f766e',
                    color: '#fff',
                    border: 'none',
                    borderRadius: 6,
                    fontWeight: 'bold',
                    cursor: 'pointer',
                    fontSize: 13,
                  }}
                >
                  📍 Confirm Arrival & Check-in Patient
                </button>
              )}
            </div>
          ) : (
            <p style={{ fontSize: 12, color: '#64748b', fontStyle: 'italic', marginTop: 8 }}>
              No scheduled appointment found. Student can be treated as a regular walk-in.
            </p>
          )}
        </div>
      )}
    </section>
  );
}