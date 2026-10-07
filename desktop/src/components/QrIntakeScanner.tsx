// desktop/src/components/QrIntakeScanner.tsx
import React, { useState, useEffect, useRef } from 'react';
import jsQR from 'jsqr';
import { API_BASE_URL } from '../config/api';

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
  const [searchQuery, setSearchQuery] = useState('22-LN-0123');
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

  const [bp, setBp] = useState('120/80');
  const [temp, setTemp] = useState('36.6');
  const [pulse, setPulse] = useState('78');
  const [height, setHeight] = useState('');
  const [weight, setWeight] = useState('');
  const [lastVerifiedAt, setLastVerifiedAt] = useState<string>('');

  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameId = useRef<number | null>(null);

  /* ── Palette (self-contained hex) ─────────────────────────── */
  const C = {
    primary:     '#1F4A34',
    primaryDark: '#153627',
    primaryTint: '#E2EBE1',
    surface:     '#FFFFFF',
    sage50:      '#F7F9F6',
    sage100:     '#EEF3EC',
    sage200:     '#E2EBE1',
    sage300:     '#C9D9C7',
    sage400:     '#A3B3A1',
    border:      '#DCE4DA',
    borderSoft:  '#E8EDE6',
    text:        '#191C1A',
    textSub:     '#5A635B',
    textMuted:   '#94A396',
    danger:      '#7A2E26',
    dangerSoft:  '#FDE8E8',
    dangerBorder:'#F8B4B4',
    warning:     '#8C6826',
    warningSoft: '#FEF3C7',
    warningBorder:'#FDE68A',
    success:     '#15803D',
    successSoft: '#DCFCE7',
    successBorder:'#BBF7D0',
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

  /* ── Verify QR token ─────────────────────────────────────── */
  const verifyToken = async (tokenToVerify: string) => {
    if (!tokenToVerify || tokenToVerify.trim().length === 0) return;
    setScanStatus('🔍 Verifying cryptographic QR pass signature...');
    setVerifiedPatient(null);
    setPendingAppointment(null);
    setCheckInSuccess(null);
    setWalkInSuccess(null);
    setActiveTicket(null);

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
        onPatientVerified(data.patient, tokenToVerify.trim());
        setScanStatus('✅ Patient identity verified.');
        setHeight(data.patient?.height ? String(data.patient.height) : '');
        setWeight(data.patient?.weight ? String(data.patient.weight) : '');
        setLastVerifiedAt(data.patient?.health_profile_updated_at || '');
        stopCamera();
        // Fetch active ticket + pending appointment in parallel
        await Promise.all([
          checkActiveTicket(data.patient.user_id),
          checkPatientAppointments(data.patient.user_id),
        ]);
      } else {
        setScanStatus('❌ Verification failed: ' + (data.error || 'Invalid or expired QR pass'));
      }
    } catch (err: any) {
      setScanStatus('❌ Connection error: ' + err.message);
    }
  };

  const handleManualSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setScanStatus('🔍 Searching student records...');
    setCheckInSuccess(null);
    setWalkInSuccess(null);
    setActiveTicket(null);

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
        });
        setPendingAppointment(app);
        setScanStatus(`✅ Patient record located: ${app.first_name} ${app.last_name}`);
        setHeight(app.height ? String(app.height) : '');
        setWeight(app.weight ? String(app.weight) : '');
        setLastVerifiedAt(app.health_profile_updated_at || '');
        await checkActiveTicket(app.user_id);
      } else {
        setScanStatus('❌ No scheduled appointments found matching that query.');
      }
    } catch (err: any) {
      setScanStatus('❌ Search error: ' + err.message);
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
        if (data[0]?.height && !height) setHeight(String(data[0].height));
        if (data[0]?.weight && !weight) setWeight(String(data[0].weight));
      } else {
        setPendingAppointment(null);
      }
    } catch (_) {}
  };

  const handleConfirmArrival = async () => {
    if (!pendingAppointment) return;
    const jwt = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/appointments/${pendingAppointment.appointment_id}/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${jwt}` },
        body: JSON.stringify({
          blood_pressure: bp,
          temperature: temp,
          pulse: pulse,
          height: height || null,
          weight: weight || null,
        }),
      });

      const data = await res.json();

      // Race-condition path: server rejected because patient is already in queue
      if (res.status === 409) {
        setScanStatus('⚠️ ' + data.error);
        if (verifiedPatient) await checkActiveTicket(verifiedPatient.user_id);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to check in patient.');

      setCheckInSuccess(`✅ Arrival confirmed! Ticket ${data.queueTicket} assigned at ${data.arrivalTime}.`);
      setPendingAppointment({ ...pendingAppointment, status: 'checked_in' });
      if (verifiedPatient) await checkActiveTicket(verifiedPatient.user_id);
    } catch (err: any) {
      setScanStatus('❌ ' + err.message);
    }
  };

  /* ── Register as walk-in ─────────────────────────────────── */
  const handleRegisterWalkIn = async () => {
    if (!verifiedPatient) return;
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
          notes: `Walk-in triage vitals · BP ${bp}, Temp ${temp}°C, Pulse ${pulse} bpm`,
          vitals: {
            height: height || null,
            weight: weight || null,
          },
        }),
      });
      const data = await res.json();

      // Race-condition path: server rejected because patient is already in queue
      if (res.status === 409) {
        setScanStatus('⚠️ ' + data.error);
        await checkActiveTicket(verifiedPatient.user_id);
        return;
      }

      if (!res.ok) throw new Error(data.error || 'Failed to register walk-in patient.');

      setWalkInSuccess(`✅ Walk-in registered! Ticket ${data.queueTicket} at ${data.arrivalTime}.`);
      await checkActiveTicket(verifiedPatient.user_id);
    } catch (err: any) {
      setScanStatus('❌ ' + err.message);
    } finally {
      setIsRegisteringWalkIn(false);
    }
  };

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

  const handleQrFileUpload = (file: File) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, img.width, img.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height);
      if (code && code.data) verifyToken(code.data);
      else setScanStatus('❌ No QR code found in the uploaded image.');
    };
    img.src = URL.createObjectURL(file);
  };

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
  const statusIsOk = scanStatus.includes('✅');
  const statusIsErr = scanStatus.includes('❌');
  const statusIsWarn = scanStatus.includes('⚠️');

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
                  if (tab.id !== 'camera') stopCamera();
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
              color: '#FFFFFF',
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
              color: '#FFFFFF',
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
              color: '#FFFFFF',
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
                value: verifiedPatient.blood_type || 'O+',
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
                  <span style={{ fontSize: 16 }}>⚠️</span>
                  Patient already in today's queue
                </b>
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '3px 10px',
                    borderRadius: 999,
                    background: C.warning,
                    color: '#FFFFFF',
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
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: 8,
                      marginBottom: 14,
                    }}
                  >
                    {[
                      { label: 'Blood pressure', value: bp, set: setBp, placeholder: '120/80' },
                      { label: 'Temp (°C)', value: temp, set: setTemp, placeholder: '36.6' },
                      { label: 'Pulse (bpm)', value: pulse, set: setPulse, placeholder: '78' },
                      { label: 'Height (cm)', value: height, set: setHeight, placeholder: '162.5' },
                      { label: 'Weight (kg)', value: weight, set: setWeight, placeholder: '54.0' },
                    ].map((f) => (
                      <div key={f.label}>
                        <label
                          style={{
                            fontSize: 10.5,
                            color: C.textSub,
                            fontWeight: 600,
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          {f.label}
                        </label>
                        <input
                          type="text"
                          placeholder={f.placeholder}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            fontSize: 12,
                            color: C.text,
                            background: C.surface,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            outline: 'none',
                            fontFamily: 'inherit',
                          }}
                          value={f.value}
                          onChange={(e) => f.set(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>
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
                <button
                  type="button"
                  onClick={handleConfirmArrival}
                  style={{
                    width: '100%',
                    padding: 12,
                    borderRadius: 999,
                    background: C.primary,
                    color: '#FFFFFF',
                    border: 'none',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                  }}
                >
                  Confirm arrival & check-in patient
                </button>
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
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(5, 1fr)',
                      gap: 8,
                      marginBottom: 14,
                    }}
                  >
                    {[
                      { label: 'Blood pressure', value: bp, set: setBp, placeholder: '120/80' },
                      { label: 'Temp (°C)', value: temp, set: setTemp, placeholder: '36.6' },
                      { label: 'Pulse (bpm)', value: pulse, set: setPulse, placeholder: '78' },
                      { label: 'Height (cm)', value: height, set: setHeight, placeholder: '162.5' },
                      { label: 'Weight (kg)', value: weight, set: setWeight, placeholder: '54.0' },
                    ].map((f) => (
                      <div key={f.label}>
                        <label
                          style={{
                            fontSize: 10.5,
                            color: C.textSub,
                            fontWeight: 600,
                            display: 'block',
                            marginBottom: 4,
                          }}
                        >
                          {f.label}
                        </label>
                        <input
                          type="text"
                          placeholder={f.placeholder}
                          style={{
                            width: '100%',
                            boxSizing: 'border-box',
                            padding: '8px 10px',
                            fontSize: 12,
                            color: C.text,
                            background: C.surface,
                            border: `1px solid ${C.border}`,
                            borderRadius: 8,
                            outline: 'none',
                            fontFamily: 'inherit',
                          }}
                          value={f.value}
                          onChange={(e) => f.set(e.target.value)}
                        />
                      </div>
                    ))}
                  </div>

                  <button
                    type="button"
                    onClick={handleRegisterWalkIn}
                    disabled={isRegisteringWalkIn}
                    style={{
                      width: '100%',
                      padding: 12,
                      borderRadius: 999,
                      background: isRegisteringWalkIn ? C.sage400 : C.primary,
                      color: '#FFFFFF',
                      border: 'none',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: isRegisteringWalkIn ? 'not-allowed' : 'pointer',
                      fontFamily: 'inherit',
                      boxShadow: '0 4px 12px rgba(31,74,52,0.16)',
                      transition: 'background 120ms ease',
                    }}
                  >
                    {isRegisteringWalkIn
                      ? 'Registering walk-in…'
                      : '✓ Register as walk-in patient'}
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}