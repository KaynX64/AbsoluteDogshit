import { useEffect, useState } from 'react';
import { API_BASE_URL } from '../../config/api';
import { btnGhost, T } from '../../theme';
import { PrescriptionHistoryContent, type PrescriptionHistoryRow } from './PrescriptionHistory';
import { ClearanceHistoryContent, type ClearanceHistoryRow } from './ClearanceHistory';

type DocumentKind = 'prescriptions' | 'clearances';
type DocumentRow = PrescriptionHistoryRow | ClearanceHistoryRow;

interface ConsultationDocumentsProps {
  patientId: number;
  appointmentId: number;
  kind: DocumentKind;
  active: boolean;
  onViewPdf: (kind: DocumentKind, id: number, onError?: (message: string) => void) => Promise<boolean>;
  onDownloadPdf: (kind: DocumentKind, id: number, onError?: (message: string) => void) => Promise<void>;
}

export default function ConsultationDocuments({ patientId, appointmentId, kind, active,
  onViewPdf, onDownloadPdf }: ConsultationDocumentsProps) {
  const [result, setResult] = useState<{ key: string; rows: DocumentRow[] } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  const key = `${patientId}:${appointmentId}:${kind}`;

  useEffect(() => {
    if (!active) return;
    const abort = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    void (async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/api/documents/${kind}/patient/${patientId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('valetudo_token')}` },
          cache: 'no-store', signal: abort.signal,
        });
        const rows = await response.json();
        if (!response.ok || !Array.isArray(rows)) throw new Error(rows?.error || `HTTP ${response.status}`);
        if (!abort.signal.aborted) setResult({ key, rows });
      } catch (problem) {
        if (!abort.signal.aborted) setError(problem instanceof Error ? problem.message : 'Unable to load documents.');
      } finally {
        if (!abort.signal.aborted) setLoading(false);
      }
    })();
    return () => abort.abort();
  }, [active, key, kind, patientId, retry]);

  const rows = result?.key === key ? result.rows : [];
  const linked = rows.filter(row => Number(row.appointment_id) === appointmentId);
  const unlinked = rows.filter(row => row.appointment_id == null);
  const noun = kind === 'prescriptions' ? 'prescription' : 'clearance';
  const renderRecords = (records: DocumentRow[], emptyMessage: string, pending = false, message = '') => {
    const shared = {
      handleDownloadPdf: onDownloadPdf,
      onViewPdf: (documentKind: DocumentKind, id: number) => { void onViewPdf(documentKind, id, setError); },
      emptyMessage,
    };
    return kind === 'prescriptions'
      ? <PrescriptionHistoryContent {...shared} rxHistory={records as PrescriptionHistoryRow[]}
          loadingRxHistory={pending} rxHistoryError={message} setRxHistoryError={setError} />
      : <ClearanceHistoryContent {...shared} clrHistory={records as ClearanceHistoryRow[]}
          loadingClrHistory={pending} clrHistoryError={message} setClrHistoryError={setError} />;
  };

  return <div aria-label={`Consultation ${kind}`}>
    <p style={{ color: T.textSub, fontSize: 13 }}>Read-only documents you issued for this consultation.</p>
    {renderRecords(linked, `No ${noun} issued for this consultation.`, loading, error)}
    {error && <button type="button" style={btnGhost} onClick={() => setRetry(value => value + 1)}>Retry loading documents</button>}
    {!loading && unlinked.length > 0 && <details style={{ marginTop: 16 }}>
      <summary>Other {kind} without a consultation link ({unlinked.length})</summary>
      <p style={{ color: T.textSub, fontSize: 13 }}>
        These documents were issued by you to this patient, but their consultation was not recorded.
      </p>
      {renderRecords(unlinked, '')}
    </details>}
  </div>;
}
