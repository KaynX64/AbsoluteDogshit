import Dialog from '../../shared/ui/Dialog';
import { T, btnGhost, btnPrimary } from '../../theme';

export type ReviewField = { label: string; value: string; input?: string; error?: string };

export default function ClinicalReview({ title, patient, fields, action, busy, error, onClose, onConfirm }: {
  title: string;
  patient: string;
  fields: ReviewField[];
  action: string;
  busy?: boolean;
  error?: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog label={title} busy={busy} onDismiss={onClose}>
      <div className="modal-card">
      <header className="dialog-header">
      <h3 tabIndex={-1} data-dialog-initial style={{ margin: '0 0 8px', color: T.primary }}>{title}</h3>
      <p style={{ margin: '0 0 12px', color: T.textSub }}>{patient}</p>
      </header>
      <dl className="dialog-body" style={{ margin: '0 0 16px' }}>
        {fields.map(({ label, value, input, error }) => (
          <div key={label} style={{ borderTop: `1px solid ${T.border}`, padding: '8px 0' }}>
            <dt style={{ fontWeight: 700 }}>{label}</dt>
            <dd style={{ margin: 0, display: 'flex', alignItems: 'start', gap: 12 }}>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: error ? T.danger : T.textSub }}>
                {error || value || 'Not entered'}
              </span>
              {input && <button type="button" style={btnGhost} aria-label={`Edit ${label}`} disabled={busy} onClick={() => {
                onClose();
                requestAnimationFrame(() => document.getElementById(input)?.focus());
              }}>Edit</button>}
            </dd>
          </div>
        ))}
      </dl>
      <footer className="dialog-footer">
        {error && <p role="alert" className="dialog-error">{error}</p>}
        <button type="button" style={btnGhost} disabled={busy} onClick={onClose}>Return to form</button>
        <button type="button" style={btnPrimary} disabled={busy || fields.some(({ error }) => Boolean(error))}
          onClick={onConfirm}>{busy ? 'Saving…' : action}</button>
      </footer>
      </div>
    </Dialog>
  );
}
