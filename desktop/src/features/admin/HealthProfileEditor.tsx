import type { CSSProperties } from 'react';
import { T, inputStyle, liveObject } from '../../theme';
import Icon from '../../shared/ui/Icon';

export interface HealthProfileDraft {
  blood_type?: string | null;
  sex?: string | null;
  date_of_birth?: string | null;
  height?: string | number | null;
  weight?: string | number | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  allergies?: string | null;
  chronic_conditions?: string | null;
  bmi?: number | string | null;
  hp_version?: number | null;
  hp_updated_at?: string | null;
}

const advLabel: CSSProperties = liveObject(() => ({
  fontSize: 12, fontWeight: 700, color: T.textSub, display: 'block', marginBottom: 6,
}));
const advTextarea: CSSProperties = liveObject(() => ({
  ...inputStyle, minHeight: 64, resize: 'vertical', lineHeight: 1.5,
}));

interface HealthProfileEditorProps {
  editingProtectedAdmin: boolean;
  editHealthExists: boolean;
  editHealthLoading: boolean;
  editHealth: HealthProfileDraft | null;
  setEditHealth: (draft: HealthProfileDraft) => void;
  todayIso: string;
  previewBmi: string | null;
}

export default function HealthProfileEditor({
  editingProtectedAdmin,
  editHealthExists,
  editHealthLoading,
  editHealth,
  setEditHealth,
  todayIso,
  previewBmi,
}: HealthProfileEditorProps) {
  return (
    <div style={{
      marginTop: 24, padding: 16,
      borderRadius: T.radius.md,
      background: '#F0F7F1', border: '1px solid #CDE4D2',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4, gap: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800, color: T.primary }}>
          <Icon name="health_and_safety" size={14} /> Health record — HEALTH_PROFILES
        </span>
        <span style={{ fontSize: 11, color: T.textMuted, fontWeight: 600 }}>
          <Icon name="lock" size={14} /> AES-256-GCM encrypted at rest
        </span>
      </div>
      <p style={{ fontSize: 11.5, color: T.textSub, margin: '0 0 14px', lineHeight: 1.55 }}>
        {editingProtectedAdmin
          ? 'Read-only view: only a Super Admin can access another administrator’s health record.'
          : editHealthExists
            ? 'Full clinic-staff editing: sex and date of birth are editable here — patients cannot change these themselves on the mobile app.'
            : 'No health record on file yet — saving in Advanced mode creates the HEALTH_PROFILES row.'}
      </p>

      {editHealthLoading ? (
        <div style={{ fontSize: 12.5, color: T.textMuted, fontStyle: 'italic', padding: '14px 0' }}>
          Loading health record…
        </div>
      ) : editHealth && (
        <>
          {/* Demographics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={advLabel}>Blood type</label>
              <select style={inputStyle} value={editHealth.blood_type || ''}
                      onChange={(e) => setEditHealth({ ...editHealth, blood_type: e.target.value })}>
                <option value="">— Not recorded —</option>
                {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={advLabel}>Sex</label>
              <select style={inputStyle} value={editHealth.sex || ''}
                      onChange={(e) => setEditHealth({ ...editHealth, sex: e.target.value })}>
                <option value="">— Not recorded —</option>
                <option value="MALE">MALE</option>
                <option value="FEMALE">FEMALE</option>
              </select>
            </div>
            <div>
              <label style={advLabel}>Date of birth</label>
              <input type="date" style={inputStyle} max={todayIso} value={editHealth.date_of_birth || ''}
                     onChange={(e) => setEditHealth({ ...editHealth, date_of_birth: e.target.value })} />
            </div>
          </div>

          {/* Body metrics (BMI is a generated column — read-only) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 190px), 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={advLabel}>Height (cm)</label>
              <input type="number" style={inputStyle} min={30} max={300} step={0.1} placeholder="170"
                     value={editHealth.height ?? ''}
                     onChange={(e) => setEditHealth({ ...editHealth, height: e.target.value })} />
            </div>
            <div>
              <label style={advLabel}>Weight (kg)</label>
              <input type="number" style={inputStyle} min={1} max={500} step={0.1} placeholder="60"
                     value={editHealth.weight ?? ''}
                     onChange={(e) => setEditHealth({ ...editHealth, weight: e.target.value })} />
            </div>
            <div>
              <label style={advLabel}>BMI (auto-generated)</label>
              <input style={{ ...inputStyle, background: '#F5F8F3' }} readOnly value={previewBmi ?? '—'}
                     title="MySQL generated column: ROUND(weight / POW(height/100, 2), 2) — recomputed on save" />
              <div style={{ fontSize: 10.5, color: T.textMuted, marginTop: 5, fontStyle: 'italic' }}>
                Computed column — recalculated from height &amp; weight.
              </div>
            </div>
          </div>

          {/* Emergency contact */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 200px), 1fr))', gap: 14, marginBottom: 14 }}>
            <div>
              <label style={advLabel}>Emergency contact name</label>
              <input style={inputStyle} placeholder="Contact person" value={editHealth.emergency_contact_name || ''}
                     onChange={(e) => setEditHealth({ ...editHealth, emergency_contact_name: e.target.value })} />
            </div>
            <div>
              <label style={advLabel}>Emergency contact phone</label>
              <input style={inputStyle} placeholder="+63 900 000 0000" value={editHealth.emergency_contact_phone || ''}
                     onChange={(e) => setEditHealth({ ...editHealth, emergency_contact_phone: e.target.value })} />
            </div>
          </div>

          {/* Encrypted clinical free text */}
          <div style={{ marginBottom: 14 }}>
            <label style={advLabel}>Allergies</label>
            <textarea style={advTextarea} placeholder="None recorded" value={editHealth.allergies || ''}
                      onChange={(e) => setEditHealth({ ...editHealth, allergies: e.target.value })} />
          </div>
          <div>
            <label style={advLabel}>Chronic conditions</label>
            <textarea style={advTextarea} placeholder="None recorded" value={editHealth.chronic_conditions || ''}
                      onChange={(e) => setEditHealth({ ...editHealth, chronic_conditions: e.target.value })} />
          </div>
        </>
      )}
    </div>
  );
}
