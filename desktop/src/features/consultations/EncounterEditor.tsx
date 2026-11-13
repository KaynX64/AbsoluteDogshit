import type { FormEventHandler, RefObject } from 'react';
import { T, btnPrimary, inputStyle } from '../../theme';
import Icon from '../../shared/ui/Icon';

interface EncounterEditorProps {
  appointmentId: number;
  isArchivedMode: boolean;
  chiefComplaint: string;
  setChiefComplaint: (value: string) => void;
  diagnosis: string;
  setDiagnosis: (value: string) => void;
  treatmentPlan: string;
  setTreatmentPlan: (value: string) => void;
  clinicalNotes: string;
  setClinicalNotes: (value: string) => void;
  encounterFileInput: RefObject<HTMLInputElement | null>;
  attachedFile: File | null;
  setAttachedFile: (file: File | null) => void;
  isSubmittingEMR: boolean;
  onSubmit: FormEventHandler<HTMLFormElement>;
}

export default function EncounterEditor({
  appointmentId,
  isArchivedMode,
  chiefComplaint,
  setChiefComplaint,
  diagnosis,
  setDiagnosis,
  treatmentPlan,
  setTreatmentPlan,
  clinicalNotes,
  setClinicalNotes,
  encounterFileInput,
  attachedFile,
  setAttachedFile,
  isSubmittingEMR,
  onSubmit,
}: EncounterEditorProps) {
  return (
    <form className="doctor-encounter-form" onSubmit={onSubmit}>
      <div className="doctor-writing-grid">
        <div className="doctor-writing-field">
          <label htmlFor="encounter-complaint"
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
            id="encounter-complaint" value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}

          />
        </div>

        <div className="doctor-writing-field">
          <label htmlFor="encounter-diagnosis"
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
            id="encounter-diagnosis" value={diagnosis}

            onChange={(e) => setDiagnosis(e.target.value)}
          />
        </div>

        <div className="doctor-writing-field">
          <label htmlFor="encounter-plan"
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
            id="encounter-plan" value={treatmentPlan}

            onChange={(e) => setTreatmentPlan(e.target.value)}
          />
        </div>

        <div className="doctor-writing-field">
          <label htmlFor="encounter-notes" className="doctor-notes-label">
            Clinical notes
          </label>
          <textarea id="encounter-notes" value={clinicalNotes} rows={3} readOnly={isArchivedMode}
            style={inputStyle} onChange={(event) => setClinicalNotes(event.target.value)} />
        </div>
      </div>

      {!isArchivedMode && (
        <div className="doctor-encounter-actions">
          <div className="doctor-encounter-attachment">
            <input
              key={appointmentId}
              ref={encounterFileInput}
              type="file"
              accept=".pdf,image/png,image/jpeg,.jpg"
              hidden
              onChange={(event) => setAttachedFile(event.currentTarget.files?.[0] ?? null)}
            />
            <button type="button" className="doctor-record-action" onClick={() => encounterFileInput.current?.click()}>
              <Icon name="attach_file" size={16} /> {attachedFile ? 'Replace lab result' : 'Attach lab result'}
            </button>
            {attachedFile && (
              <div className="doctor-attached-file">
                <span>{attachedFile.name}</span>
                <button type="button" className="doctor-record-action" aria-label="Remove lab result"
                  onClick={() => {
                    setAttachedFile(null);
                    if (encounterFileInput.current) encounterFileInput.current.value = '';
                  }}>
                  <Icon name="close" size={16} />
                </button>
              </div>
            )}
          </div>
          <button type="submit" disabled={isSubmittingEMR} style={btnPrimary}>
            {isSubmittingEMR ? 'Finalizing encounter…' : 'Finish consultation & discharge'}
          </button>
        </div>
      )}
    </form>
  );
}
