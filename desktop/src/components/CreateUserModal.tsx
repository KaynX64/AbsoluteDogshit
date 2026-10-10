// desktop/src/components/CreateUserModal.tsx
import React, { useState, useEffect } from 'react';
import { T, inputStyle, btnPrimary, btnGhost } from '../theme';
import { API_BASE_URL } from '../config/api';

interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreated: () => void;
}

const ROLE_OPTIONS = [
  { code: 'STUDENT',             label: 'Student' },
  { code: 'FACULTY',             label: 'Faculty' },
  { code: 'NON_TEACHING',        label: 'Non-Teaching / Support Staff' },
  { code: 'DOCTOR',              label: 'Doctor' },
  { code: 'DENTIST',             label: 'Dentist' },
  { code: 'NURSE',               label: 'Nurse' },
  { code: 'EMERGENCY_RESPONDER', label: 'Emergency Responder' },
  { code: 'ADMIN',               label: 'Administrator' },
];

function generateSecurePassword(length = 12): string {
  const upper  = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower  = 'abcdefghijkmnpqrstuvwxyz';
  const digits = '23456789';
  const symbols = '!@#$%^&*';
  const all = upper + lower + digits + symbols;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  const core = [pick(upper), pick(lower), pick(digits), pick(symbols)];
  while (core.length < length) core.push(pick(all));
  for (let i = core.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [core[i], core[j]] = [core[j], core[i]];
  }
  return core.join('');
}

export default function CreateUserModal({ isOpen, onClose, onCreated }: CreateUserModalProps) {
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(true);
  const [roleCode, setRoleCode] = useState('STUDENT');
  const [isActive, setIsActive] = useState(true);

  // Role-specific
  const [studentNo, setStudentNo] = useState('');
  const [course, setCourse] = useState('');
  const [yearLevel, setYearLevel] = useState('1');
  const [facultyNo, setFacultyNo] = useState('');
  const [employeeNo, setEmployeeNo] = useState('');
  const [licenseNo, setLicenseNo] = useState('');
  const [adminNo, setAdminNo] = useState('');
  const [specialty, setSpecialty] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');

  const [isSaving, setIsSaving] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; isError: boolean } | null>(null);

  // Fresh state each time the modal reopens
  useEffect(() => {
    if (!isOpen) return;
    setFirstName('');
    setLastName('');
    setEmail('');
    setPhone('');
    setPassword(generateSecurePassword(12));
    setShowPassword(true);
    setRoleCode('STUDENT');
    setIsActive(true);
    setStudentNo('');
    setCourse('');
    setYearLevel('1');
    setFacultyNo('');
    setEmployeeNo('');
    setLicenseNo('');
    setAdminNo('');
    setSpecialty('');
    setDepartment('');
    setPosition('');
    setFeedback(null);
    setIsSaving(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);

    if (password.length < 8) {
      setFeedback({ text: 'Password must be at least 8 characters long.', isError: true });
      return;
    }
    if (roleCode === 'STUDENT' && !studentNo.trim()) {
      setFeedback({ text: 'Student number is required for student accounts.', isError: true });
      return;
    }
    if (roleCode === 'FACULTY' && !facultyNo.trim()) {
      setFeedback({ text: 'Faculty number is required for faculty accounts.', isError: true });
      return;
    }

    setIsSaving(true);
    const token = localStorage.getItem('valetudo_token');
    try {
      const res = await fetch(`${API_BASE_URL}/api/admin/users`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          email: email.trim(),
          phone: phone.trim() || null,
          password,
          role_code: roleCode,
          is_active: isActive,
          student_no: studentNo.trim() || null,
          course: course.trim() || null,
          year_level: Number(yearLevel) || 1,
          faculty_no: facultyNo.trim() || null,
          employee_no: employeeNo.trim() || null,
          license_no: licenseNo.trim() || null,
          admin_no: adminNo.trim() || null,
          specialty: specialty.trim() || null,
          department: department.trim() || null,
          position: position.trim() || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user account.');
      setFeedback({ text: '✅ ' + data.message, isError: false });
      onCreated();
      setTimeout(() => { onClose(); }, 900);
    } catch (err: any) {
      setFeedback({ text: '❌ ' + err.message, isError: true });
    } finally {
      setIsSaving(false);
    }
  };

  const fieldLabel: React.CSSProperties = {
    fontSize: 12, fontWeight: 700, color: T.textSub,
    display: 'block', marginBottom: 6,
  };

  const sectionLabel: React.CSSProperties = {
    marginTop: 22, marginBottom: 8,
    fontSize: 11, fontWeight: 800, letterSpacing: 1.4,
    color: T.textMuted, textTransform: 'uppercase',
  };

  const showStaffFields = ['DOCTOR', 'DENTIST', 'NURSE', 'EMERGENCY_RESPONDER', 'ADMIN'].includes(roleCode);
  const isAdminRole = roleCode === 'ADMIN';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 640, padding: '28px 32px', maxHeight: '90vh', overflowY: 'auto' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, color: T.text, margin: 0, letterSpacing: -0.4 }}>
              Create user account
            </h2>
            <p style={{ fontSize: 13, color: T.textSub, margin: '6px 0 0' }}>
              New institutional account · grants role-based access on first login
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: T.textSub }}
            aria-label="Close"
          >✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          {/* ── Identity ───────────────────────────────────── */}
          <div style={sectionLabel}>Identity & contact</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>First name</label>
              <input style={inputStyle} value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div>
              <label style={fieldLabel}>Last name</label>
              <input style={inputStyle} value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={fieldLabel}>Institutional email</label>
              <input type="email" style={inputStyle} value={email}
                     placeholder="name@psu.edu.ph"
                     onChange={(e) => setEmail(e.target.value)} required />
            </div>
            <div>
              <label style={fieldLabel}>Phone (optional)</label>
              <input style={inputStyle} value={phone} placeholder="+63 900 000 0000"
                     onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>

          {/* ── Credentials ────────────────────────────────── */}
          <div style={sectionLabel}>Initial credentials</div>

          <div style={{ marginBottom: 4 }}>
            <label style={fieldLabel}>Temporary password (min 8 chars)</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type={showPassword ? 'text' : 'password'}
                style={{
                  ...inputStyle,
                  flex: 1,
                  fontFamily: showPassword ? T.mono : T.font,
                  letterSpacing: showPassword ? 0.5 : 0,
                }}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={8}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                style={{ ...btnGhost, padding: '10px 14px', fontSize: 12 }}
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
              <button
                type="button"
                onClick={() => setPassword(generateSecurePassword(12))}
                style={{ ...btnGhost, padding: '10px 14px', fontSize: 12 }}
                title="Generate a strong random password"
              >
                🔄
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.textMuted, marginTop: 6, fontStyle: 'italic' }}>
              Deliver this password via a secure channel. The user can change it after first login.
            </div>
          </div>

          {/* ── Access ─────────────────────────────────────── */}
          <div style={sectionLabel}>Access & account status</div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={fieldLabel}>Assigned RBAC role</label>
              <select style={inputStyle} value={roleCode} onChange={(e) => setRoleCode(e.target.value)}>
                {ROLE_OPTIONS.map((r) => (
                  <option key={r.code} value={r.code}>{r.code} — {r.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={fieldLabel}>Account status</label>
              <select
                style={inputStyle}
                value={isActive ? '1' : '0'}
                onChange={(e) => setIsActive(e.target.value === '1')}
              >
                <option value="1">Active</option>
                <option value="0">Suspended / deactivated</option>
              </select>
            </div>
          </div>

          {/* ── Role-specific ──────────────────────────────── */}
          <div style={sectionLabel}>Role-specific details</div>

          {roleCode === 'STUDENT' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 90px', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Student number</label>
                <input style={inputStyle} value={studentNo} placeholder="22-LN-0451"
                       onChange={(e) => setStudentNo(e.target.value)} required />
              </div>
              <div>
                <label style={fieldLabel}>Course / program</label>
                <input style={inputStyle} value={course} placeholder="BS Information Technology"
                       onChange={(e) => setCourse(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Year</label>
                <input type="number" min="1" max="6" style={inputStyle} value={yearLevel}
                       onChange={(e) => setYearLevel(e.target.value)} />
              </div>
            </div>
          )}

          {roleCode === 'FACULTY' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Faculty number</label>
                <input style={inputStyle} value={facultyNo} placeholder="PSU-FAC-2024-0451"
                       onChange={(e) => setFacultyNo(e.target.value)} required />
              </div>
              <div>
                <label style={fieldLabel}>Department</label>
                <input style={inputStyle} value={department} placeholder="College of Computing Studies"
                       onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Position</label>
                <input style={inputStyle} value={position} placeholder="Assistant Professor"
                       onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
          )}

          {roleCode === 'NON_TEACHING' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.2fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Employee number (optional)</label>
                <input style={inputStyle} value={employeeNo} placeholder="PSU-NT-2024-0187"
                       onChange={(e) => setEmployeeNo(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Department / office</label>
                <input style={inputStyle} value={department} placeholder="Campus Maintenance & Facilities"
                       onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Position</label>
                <input style={inputStyle} value={position} placeholder="Utility Worker"
                       onChange={(e) => setPosition(e.target.value)} />
              </div>
            </div>
          )}

          {showStaffFields && !isAdminRole && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>PRC / staff ID</label>
                <input style={inputStyle} value={licenseNo} placeholder="PRC-MD-098765"
                       onChange={(e) => setLicenseNo(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Specialty</label>
                <input style={inputStyle} value={specialty} placeholder="General Medicine"
                       onChange={(e) => setSpecialty(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Department / unit</label>
                <input style={inputStyle} value={department} placeholder="University Infirmary"
                       onChange={(e) => setDepartment(e.target.value)} />
              </div>
            </div>
          )}

          {isAdminRole && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
              <div>
                <label style={fieldLabel}>Admin number</label>
                <input style={inputStyle} value={adminNo} placeholder="PSU-ADM-2024-0001"
                       onChange={(e) => setAdminNo(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Specialty / scope</label>
                <input style={inputStyle} value={specialty} placeholder="System Administration"
                       onChange={(e) => setSpecialty(e.target.value)} />
              </div>
              <div>
                <label style={fieldLabel}>Department / unit</label>
                <input style={inputStyle} value={department} placeholder="PSU Lingayen Clinic"
                       onChange={(e) => setDepartment(e.target.value)} />
              </div>
            </div>
          )}

          {feedback && (
            <div style={{
              marginTop: 18, padding: '12px 16px', borderRadius: T.radius.md,
              fontSize: 12.5, fontWeight: 600,
              background: feedback.isError ? T.dangerSoft : T.successSoft,
              color: feedback.isError ? T.danger : T.success,
              border: `1px solid ${feedback.isError ? T.dangerBorder : T.successBorder}`,
            }}>
              {feedback.text}
            </div>
          )}

          <div style={{
            display: 'flex', gap: 10, justifyContent: 'flex-end',
            marginTop: 24, paddingTop: 18, borderTop: `1px solid ${T.border}`,
          }}>
            <button type="button" onClick={onClose} style={btnGhost} disabled={isSaving}>
              Cancel
            </button>
            <button
              type="submit"
              style={{
                ...btnPrimary,
                opacity: isSaving ? 0.6 : 1,
                cursor: isSaving ? 'not-allowed' : 'pointer',
              }}
              disabled={isSaving}
            >
              {isSaving ? 'Creating account…' : '✓ Create account'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}