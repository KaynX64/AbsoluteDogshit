import { useCallback, useEffect, useRef, useState } from 'react';
import { reportRequest, ReportApiError, type ReportDraft } from './reportApi';
import { useResponderAccess } from './ResponderAccess';

export type DraftFields = Pick<ReportDraft, 'incidentDetails' | 'treatmentNotes' | 'resolvedAt'>;
export interface ReportPrefill {
  patient: { name: string; studentNo: string; phone: string; roleLabel: string };
  alert: { resolvedAt: string; createdAt: string; notes: string | null };
  report: { reportId: number } | null;
}
const blank: DraftFields = { incidentDetails: '', treatmentNotes: '', resolvedAt: null };

export function useReportDraft(alertId: number) {
  const [fields, setFields] = useState<DraftFields>(blank);
  const [saved, setSaved] = useState(JSON.stringify(blank));
  const [prefill, setPrefill] = useState<ReportPrefill | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [conflict, setConflict] = useState(false);
  const [filed, setFiled] = useState(false);
  const [ready, setReady] = useState(false);
  const { refreshAccess } = useResponderAccess();
  const current = useRef(fields), revision = useRef(0), savedRef = useRef(saved);
  const active = useRef(true), loadRequest = useRef<AbortController | null>(null);
  const flight = useRef<Promise<boolean> | null>(null);
  const locked = useRef(false);
  const load = useCallback(async () => {
    loadRequest.current?.abort();
    const controller = new AbortController(); loadRequest.current = controller;
    setLoading(true); setReady(false); setError(''); setConflict(false); locked.current = false;
    try {
      const detail = await reportRequest<ReportPrefill>(`/${alertId}/incident-report`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      setPrefill(detail);
      if (detail.report) { locked.current = true; setFiled(true); return; }
      const draft = await reportRequest<ReportDraft>(`/${alertId}/incident-report-draft`, { signal: controller.signal });
      if (controller.signal.aborted) return;
      const data = { incidentDetails: draft.incidentDetails, treatmentNotes: draft.treatmentNotes, resolvedAt: draft.resolvedAt || detail.alert.resolvedAt };
      revision.current = draft.revision; current.current = data; savedRef.current = JSON.stringify(data);
      setFields(data); setSaved(savedRef.current); setFiled(false); setReady(true);
    } catch (err: any) { if (!controller.signal.aborted) { setError(err.message); locked.current = true; if (err.status === 401 || err.status === 403) void refreshAccess(true); } }
    finally { if (!controller.signal.aborted) setLoading(false); }
  }, [alertId, refreshAccess]);

  useEffect(() => {
    active.current = true; void load();
    return () => { active.current = false; loadRequest.current?.abort(); };
  }, [load]);

  const save = useCallback(async (defer = false): Promise<boolean> => {
    if (flight.current) {
      if (!await flight.current || !active.current) return false;
      return save(defer);
    }
    if (locked.current || loading || !active.current) return false;
    const snapshot = { ...current.current }, key = JSON.stringify(snapshot);
    if (!defer && key === savedRef.current) return true;
    setSaving(true); setError('');
    const operation = (async () => {
      try {
        const result = await reportRequest<{ revision: number }>(`/${alertId}/incident-report-draft`, {
          method: 'PUT', body: JSON.stringify({ ...snapshot, revision: revision.current, defer }),
        });
        if (!active.current) return false;
        revision.current = result.revision; savedRef.current = key; setSaved(key);
        return true;
      } catch (err: any) {
        if (active.current) {
          setError(err.message || 'The draft could not be saved. Your text is still here.');
          if (err instanceof ReportApiError && err.status === 409) {
            locked.current = true;
            setConflict(err.code === 'DRAFT_REVISION_CONFLICT'); setFiled(err.code === 'REPORT_ALREADY_FILED');
          }
          if (err.status === 401 || err.status === 403) void refreshAccess(true);
        }
        return false;
      } finally { if (active.current) setSaving(false); flight.current = null; }
    })();
    flight.current = operation; return operation;
  }, [alertId, loading, refreshAccess]);

  const change = (patch: Partial<DraftFields>) => {
    const data = { ...current.current, ...patch }; current.current = data; setFields(data);
    if (!locked.current) setError('');
  };
  const dirty = JSON.stringify(fields) !== saved;
  useEffect(() => {
    if (!dirty || loading || error || filed || conflict) return;
    const timer = setTimeout(() => { void save(); }, 800);
    return () => clearTimeout(timer);
  }, [fields, dirty, loading, error, filed, conflict, save]);
  useEffect(() => {
    if (!dirty && !saving) return;
    const protect = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', protect);
    return () => window.removeEventListener('beforeunload', protect);
  }, [dirty, saving]);
  return { fields, current, prefill, loading, ready, saving, error, setError, conflict, filed, setFiled, dirty, hasSaved: revision.current > 0, change, save, load, active };
}
