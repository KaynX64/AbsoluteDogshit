import { useLayoutEffect, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

type DialogProps = {
  children: ReactNode;
  label: string;
  onDismiss: () => void;
  className?: string;
  size?: 'compact' | 'standard' | 'wide';
  backdropDismiss?: boolean;
  busy?: boolean;
  urgent?: boolean;
  fallbackFocusId?: string;
};

export default function Dialog({
  children, label, onDismiss, className, size = 'standard', backdropDismiss, busy, urgent, fallbackFocusId,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const backdropPressed = useRef(false);
  useLayoutEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const trigger = document.activeElement;
    dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-dialog-initial]')?.focus({ preventScroll: true });
    return () => {
      dialog.close();
      if (trigger instanceof HTMLElement && trigger !== document.body && trigger.isConnected) {
        trigger.focus({ preventScroll: true });
      }
      if (document.activeElement === document.body) {
        document.getElementById(fallbackFocusId ?? 'desktop-workspace')?.focus({ preventScroll: true });
      }
    };
  }, [fallbackFocusId]);
  return createPortal(
    <dialog ref={ref} aria-label={label} aria-busy={busy || undefined}
      className={['desktop-dialog', 'desktop-dialog--' + size, className].filter(Boolean).join(' ')}
      data-urgent={urgent || undefined}
      onKeyDown={event => {
        if (event.key !== 'Tab' || event.defaultPrevented || !event.currentTarget.contains(event.target as Node)) return;
        const controls = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(
          'button, input, select, textarea, a[href], iframe, summary, [tabindex]',
        )).filter(control => control.tabIndex >= 0 && !control.matches(':disabled') && control.getClientRects().length);
        const first = controls[0];
        const last = controls.at(-1);
        const focused = document.activeElement;
        if (!first || !last) {
          event.preventDefault();
        } else if (event.shiftKey ? focused === first || !controls.includes(focused as HTMLElement) : focused === last) {
          event.preventDefault();
          (event.shiftKey ? last : first).focus();
        }
      }}
      onCancel={event => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        if (!busy) onDismiss();
      }}
      onPointerDown={event => { backdropPressed.current = event.target === event.currentTarget; }}
      onClick={event => {
        if (backdropDismiss && !busy && backdropPressed.current && event.target === event.currentTarget) onDismiss();
        backdropPressed.current = false;
      }}>
      {children}
    </dialog>,
    document.body,
  );
}
