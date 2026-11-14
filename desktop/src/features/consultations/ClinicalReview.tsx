import { useEffect, useId, useRef } from 'react';
import { T, btnGhost, btnPrimary } from '../../theme';

export type ReviewField = { label: string; value: string; input?: string; error?: string };

export default function ClinicalReview({ title, patient, fields, action, onClose, onConfirm }: {
  title: string;
  patient: string;
  fields: ReviewField[];
  action: string;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const element = dialog.current;
    element?.showModal();
    return () => element?.close();
  }, []);

  return (
    <dialog ref={dialog} aria-labelledby={titleId} className="modal-card"
      style={{ margin: 'auto', width: 'min(560px, calc(100% - 32px))', maxHeight: '85vh' }}
      onCancel={(event) => { event.preventDefault(); onClose(); }}>
      <h3 id={titleId} style={{ margin: '0 0 8px', color: T.primary }}>{title}</h3>
      <p style={{ margin: '0 0 12px', color: T.textSub }}>{patient}</p>
      <dl style={{ margin: '0 0 16px' }}>
        {fields.map(({ label, value, input, error }) => (
          <div key={label} style={{ borderTop: `1px solid ${T.border}`, padding: '8px 0' }}>
            <dt style={{ fontWeight: 700 }}>{label}</dt>
            <dd style={{ margin: 0, display: 'flex', alignItems: 'start', gap: 12 }}>
              <span style={{ flex: 1, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', color: error ? T.danger : T.textSub }}>
                {error || value || 'Not entered'}
              </span>
              {input && <button type="button" style={btnGhost} aria-label={`Edit ${label}`} onClick={() => {
                dialog.current?.close();
                onClose();
                requestAnimationFrame(() => document.getElementById(input)?.focus());
              }}>Edit</button>}
            </dd>
          </div>
        ))}
      </dl>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 10 }}>
        <button type="button" style={btnGhost} onClick={onClose}>Return to form</button>
        <button type="button" style={btnPrimary} disabled={fields.some(({ error }) => Boolean(error))}
          onClick={onConfirm}>{action}</button>
      </div>
    </dialog>
  );
}
