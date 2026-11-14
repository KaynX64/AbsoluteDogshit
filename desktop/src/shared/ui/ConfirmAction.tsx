import { useEffect, useRef, useState } from 'react';
import { btnGhost, btnPrimary, T } from '../../theme';
import Dialog from './Dialog';

export function useConfirmAction() {
  const [request, setRequest] = useState<{ title: string; detail: string } | null>(null);
  const resolve = useRef<((accepted: boolean) => void) | null>(null);
  useEffect(() => () => resolve.current?.(false), []);
  function finish(accepted: boolean) {
    const callback = resolve.current;
    resolve.current = null;
    setRequest(null);
    callback?.(accepted);
  }
  function confirmAction(title: string, detail: string) {
    if (resolve.current) return Promise.resolve(false);
    return new Promise<boolean>(complete => {
      resolve.current = complete;
      setRequest({ title, detail });
    });
  }
  const confirmation = request && <Dialog label={request.title} size="compact" onDismiss={() => finish(false)}>
    <div className="modal-card">
      <header className="dialog-header"><h2>{request.title}?</h2></header>
      <div className="dialog-body"><p>{request.detail}</p></div>
      <footer className="dialog-footer">
        <button type="button" style={btnGhost} data-dialog-initial onClick={() => finish(false)}>Cancel</button>
        <button type="button" style={{ ...btnPrimary, background: T.danger, color: T.textOnDanger }}
          onClick={() => finish(true)}>{request.title}</button>
      </footer>
    </div>
  </Dialog>;
  return { confirmAction, confirmation };
}
