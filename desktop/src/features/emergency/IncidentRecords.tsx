import { navigateTabs } from '../../shared/ui/tabKeyboard';
import { useTabMotion } from '../../shared/ui/selectionMotion';
import { useActionFeedback } from '../../shared/ui/feedback';
import Dialog from '../../shared/ui/Dialog';
// desktop/src/features/emergency/IncidentRecords.tsx
//
// Dedicated view for reviewing, saving, and printing official Emergency Incident Records.
// All resolved incident reports are documented, generated as official A4 PDFs,
// and archived into the MinIO file server.

import { useEffect, useState, useRef, useMemo } from 'react';
import { subscribeToDesktopEvents, useDesktopSocket } from '../../platform/realtime/desktopRealtime';
import { API_BASE_URL } from '../../config/api';
import { T, btnPrimary, btnGhost, btnSubtle } from '../../theme';
import Icon from '../../shared/ui/Icon';

export interface IncidentRecord {
  reportId: number;
  alertId: number;
  resolvedAt: string;
  createdAt: string;
  incidentDetails: string;
  treatmentNotes: string | null;
  pdfAvailable: boolean;
  pdfS3Key: string | null;
  patient: {
    userId: number;
    name: string;
    studentNo: string;
    phone: string;
    roleLabel: string;
    affiliation: string;
  };
  alert: {
    createdAt: string;
    acknowledgedAt: string | null;
    resolvedAt: string | null;
    responseTimeSeconds: number | null;
    notes: string | null;
    latitude: number | null;
    longitude: number | null;
  };
  documentedByName: string;
  responderName: string | null;
}

export default function IncidentRecords() {
  const { notify, notice } = useActionFeedback();
  const [records, setRecords] = useState<IncidentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedRecord, setSelectedRecord] = useState<IncidentRecord | null>(null);

  // PDF Preview & Print states
  const [previewPdfUrl, setPreviewPdfUrl] = useState<string | null>(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const [pdfError, setPdfError] = useState<string | null>(null);
  const [actionInProgressId, setActionInProgressId] = useState<number | null>(null);
  const [activeModalTab, setActiveModalTab] = useState<'preview' | 'details'>('preview');
  useTabMotion(activeModalTab, ['preview', 'details'], tab => `incident-panel-${tab}`);

  const printIframeRef = useRef<HTMLIFrameElement | null>(null);

  // ── Fetch records ──────────────────────────────────────────────────────────
  const fetchRecords = async (query = '') => {
    setLoading(true);
    setError(null);
    const token = localStorage.getItem('valetudo_token');
    try {
      const url = new URL(`${API_BASE_URL}/api/emergency/incident-reports`);
      if (query.trim()) {
        url.searchParams.set('search', query.trim());
      }
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to fetch incident records (HTTP ${res.status})`);
      }
      const data = await res.json();
      setRecords(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('[IncidentRecords] Fetch error:', err);
      setError(err.message || 'Error loading records');
    } finally {
      setLoading(false);
    }
  };

  const socket = useDesktopSocket();
  useEffect(() => {
    fetchRecords(search);

    const unsubscribe = subscribeToDesktopEvents(socket, (on) => {
      on('emergency:incident_reported', () => {
        fetchRecords(search);
      });

      on('reconnect', () => fetchRecords(search));
    });

    return () => {
      unsubscribe();
    };
  }, [socket]);

  // ── PDF Blob Fetcher ───────────────────────────────────────────────────────
  const fetchPdfBlob = async (reportId: number): Promise<Blob> => {
    const token = localStorage.getItem('valetudo_token');
    const res = await fetch(`${API_BASE_URL}/api/emergency/incident-reports/${reportId}/pdf`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Server returned HTTP ${res.status}`);
    }
    return await res.blob();
  };

  // ── View & Preview Modal ───────────────────────────────────────────────────
  const handleView = async (record: IncidentRecord) => {
    setSelectedRecord(record);
    setActiveModalTab('preview');
    setLoadingPdf(true);
    setPdfError(null);

    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }

    try {
      const blob = await fetchPdfBlob(record.reportId);
      const url = URL.createObjectURL(blob);
      setPreviewPdfUrl(url);
    } catch (err: any) {
      console.error('[IncidentRecords] Error fetching PDF preview:', err);
      setPdfError(err.message || 'Unable to open PDF preview.');
    } finally {
      setLoadingPdf(false);
    }
  };

  const handleCloseModal = () => {
    if (previewPdfUrl) {
      URL.revokeObjectURL(previewPdfUrl);
      setPreviewPdfUrl(null);
    }
    setSelectedRecord(null);
    setPdfError(null);
  };

  // ── Save (Download) PDF ────────────────────────────────────────────────────
  const handleSavePdf = async (record: IncidentRecord) => {
    if (actionInProgressId !== null) return;
    setActionInProgressId(record.reportId);
    try {
      let url = previewPdfUrl;
      let shouldRevoke = false;

      if (!url || selectedRecord?.reportId !== record.reportId) {
        const blob = await fetchPdfBlob(record.reportId);
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }

      const a = document.createElement('a');
      a.href = url;
      a.download = `incident-report-IR${String(record.reportId).padStart(4, '0')}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      notify('PDF download requested.');

      if (shouldRevoke) {
        setTimeout(() => URL.revokeObjectURL(url!), 60_000);
      }
    } catch (err: any) {
      notify(`Download failed. ${err.message} Use Save PDF to retry.`, true);
    } finally {
      setActionInProgressId(null);
    }
  };

  // ── Print PDF ──────────────────────────────────────────────────────────────
  const handlePrintPdf = async (record: IncidentRecord) => {
    if (actionInProgressId !== null) return;
    setActionInProgressId(record.reportId);
    try {
      let url = previewPdfUrl;
      let shouldRevoke = false;

      if (!url || selectedRecord?.reportId !== record.reportId) {
        const blob = await fetchPdfBlob(record.reportId);
        url = URL.createObjectURL(blob);
        shouldRevoke = true;
      }

      // If viewing in modal and iframe is ready, trigger print directly
      if (activeModalTab === 'preview' && selectedRecord?.reportId === record.reportId && printIframeRef.current?.contentWindow) {
        printIframeRef.current.contentWindow.focus();
        printIframeRef.current.contentWindow.print();
      } else {
        // Create hidden print iframe to initiate print dialog
        const hiddenIframe = document.createElement('iframe');
        hiddenIframe.style.position = 'fixed';
        hiddenIframe.style.right = '0';
        hiddenIframe.style.bottom = '0';
        hiddenIframe.style.width = '0';
        hiddenIframe.style.height = '0';
        hiddenIframe.style.border = '0';
        hiddenIframe.src = url;

        hiddenIframe.onload = () => {
          setTimeout(() => {
            try {
              hiddenIframe.contentWindow?.focus();
              hiddenIframe.contentWindow?.print();
            } catch (pErr) {
              console.warn('Iframe print failed, falling back to window open:', pErr);
              window.open(url, '_blank');
            }
          }, 300);
        };

        document.body.appendChild(hiddenIframe);

        setTimeout(() => {
          hiddenIframe.remove();
          if (shouldRevoke) URL.revokeObjectURL(url!);
        }, 120_000);
      }
      notify('Print requested.');
    } catch (err: any) {
      notify(`Print failed. ${err.message} Use Print to retry.`, true);
    } finally {
      setActionInProgressId(null);
    }
  };

  // ── Summary statistics ─────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const total = records.length;
    const archivedMinIO = records.filter((r) => r.pdfAvailable || r.pdfS3Key).length;
    const withTreatment = records.filter((r) => r.treatmentNotes && r.treatmentNotes.trim().length > 0).length;
    let avgRespSec = 0;
    const responseTimes = records
      .map((r) => r.alert.responseTimeSeconds)
      .filter((s): s is number => typeof s === 'number' && s > 0);
    if (responseTimes.length > 0) {
      avgRespSec = Math.round(responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length);
    }
    return { total, archivedMinIO, withTreatment, avgRespSec };
  }, [records]);

  // Format response duration
  const formatDuration = (seconds: number | null) => {
    if (seconds == null || seconds <= 0) return 'Immediate / Documented';
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden', background: T.sage50 }}>
      {!selectedRecord && notice}
      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: '20px 28px',
          background: T.surface,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: 16,
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: T.radius.md,
                background: T.primaryTint,
                display: 'grid',
                placeItems: 'center',
                color: T.primary,
              }}
            >
              <Icon name="assignment" size={22} />
            </div>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: T.ink, letterSpacing: -0.3 }}>
                Emergency Incident Records
              </h1>
              <p style={{ margin: 0, fontSize: 12.5, color: T.textSub, marginTop: 2 }}>
                Documented campus SOS incidents archived into official PDFs on the MinIO file server.
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            type="button"
            onClick={() => fetchRecords(search)}
            disabled={loading}
            style={{
              ...btnSubtle,
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '8px 14px',
              fontSize: 12.5,
              fontWeight: 600,
            }}
          >
            <Icon name="refresh" size={16} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* ── Stats Ribbon ────────────────────────────────────────────────────── */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, 1fr)',
          gap: 14,
          padding: '16px 28px',
          background: T.surfaceMuted,
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div style={{ padding: '12px 16px', background: T.surface, borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Total Incidents Documented
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.primary, marginTop: 4 }}>
            {stats.total}
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: T.surface, borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 6 }}>
            <span>Archived in MinIO</span>
            <span style={{ fontSize: 9.5, padding: '1px 6px', background: T.successSoft, color: T.success, borderRadius: T.radius.pill, fontWeight: 700 }}>
              S3 VAULT
            </span>
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.success, marginTop: 4 }}>
            {stats.archivedMinIO} <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>/ {stats.total} verified</span>
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: T.surface, borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Clinical Intervention Provided
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.info, marginTop: 4 }}>
            {stats.withTreatment} <span style={{ fontSize: 12, fontWeight: 500, color: T.textMuted }}>cases treated</span>
          </div>
        </div>

        <div style={{ padding: '12px 16px', background: T.surface, borderRadius: T.radius.md, border: `1px solid ${T.border}` }}>
          <div style={{ fontSize: 11.5, fontWeight: 600, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Avg Response Time
          </div>
          <div style={{ fontSize: 22, fontWeight: 800, color: T.ink, marginTop: 4 }}>
            {stats.avgRespSec > 0 ? formatDuration(stats.avgRespSec) : 'N/A'}
          </div>
        </div>
      </div>

      {/* ── Search & Filter Bar ─────────────────────────────────────────────── */}
      <div
        style={{
          padding: '14px 28px',
          background: T.surface,
          borderBottom: `1px solid ${T.border}`,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
        }}
      >
        <div style={{ position: 'relative', flex: 1, maxWidth: 420 }}>
          <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted }}>
            <Icon name="search" size={16} />
          </div>
          <input
            type="text"
            value={search}
            placeholder="Search by patient name, ID, report #, details..."
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') fetchRecords(search);
            }}
            style={{
              width: '100%',
              padding: '8px 12px 8px 36px',
              borderRadius: T.radius.md,
              border: `1px solid ${T.border}`,
              fontSize: 13,
              background: T.surfaceMuted,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                fetchRecords('');
              }}
              style={{
                position: 'absolute',
                right: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                color: T.textMuted,
                padding: 4,
              }}
            >
              <Icon name="close" size={14} />
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => fetchRecords(search)}
          style={{
            ...btnPrimary,
            padding: '8px 18px',
            fontSize: 12.5,
            fontWeight: 600,
          }}
        >
          Search Records
        </button>
      </div>

      {/* ── Content Body ────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 28px' }}>
        {loading && records.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 20px', color: T.textSub }}>
            <Icon name="progress_activity" size={32} />
            <p style={{ marginTop: 12, fontSize: 14 }}>Loading incident records from server...</p>
          </div>
        ) : error ? (
          <div
            style={{
              padding: 20,
              background: T.dangerSoft,
              border: `1px solid ${T.dangerBorder}`,
              borderRadius: T.radius.md,
              color: T.danger,
              textAlign: 'center',
            }}
          >
            <Icon name="error" size={28} />
            <p style={{ margin: '8px 0 0', fontWeight: 600 }}>{error}</p>
            <button
              type="button"
              onClick={() => fetchRecords(search)}
              style={{ ...btnSubtle, marginTop: 12, fontSize: 12 }}
            >
              Try Again
            </button>
          </div>
        ) : records.length === 0 ? (
          <div
            style={{
              padding: '80px 20px',
              textAlign: 'center',
              background: T.surface,
              borderRadius: T.radius.lg,
              border: `1px solid ${T.border}`,
              color: T.textSub,
            }}
          >
            <div
              style={{
                width: 64,
                height: 64,
                margin: '0 auto 16px',
                borderRadius: '50%',
                background: T.sage100,
                display: 'grid',
                placeItems: 'center',
                color: T.primaryMid,
              }}
            >
              <Icon name="assignment_turned_in" size={36} />
            </div>
            <h3 style={{ margin: 0, fontSize: 17, fontWeight: 700, color: T.ink }}>No Incident Records Found</h3>
            <p style={{ margin: '6px auto 0', maxWidth: 420, fontSize: 13, color: T.textSub, lineHeight: 1.5 }}>
              {search
                ? `No records matched your search "${search}". Try clearing filters or searching another keyword.`
                : 'Whenever an Emergency SOS alert is resolved and documented, its official PDF record is saved in MinIO and will appear here.'}
            </p>
            {search && (
              <button
                type="button"
                onClick={() => {
                  setSearch('');
                  fetchRecords('');
                }}
                style={{ ...btnSubtle, marginTop: 16, fontSize: 12.5 }}
              >
                Clear Search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {records.map((r) => {
              const isWorking = actionInProgressId === r.reportId;
              const hasMinIO = r.pdfAvailable || Boolean(r.pdfS3Key);

              return (
                <div
                  key={r.reportId}
                  style={{
                    background: T.surface,
                    borderRadius: T.radius.lg,
                    border: `1px solid ${T.border}`,
                    padding: '18px 22px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 14,
                    boxShadow: T.shadow.xs,
                    transition: 'all 0.15s ease',
                  }}
                >
                  {/* Card top row */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                      <span
                        style={{
                          padding: '4px 10px',
                          background: T.primary100,
                          color: T.primary,
                          borderRadius: T.radius.pill,
                          fontSize: 12,
                          fontWeight: 700,
                          letterSpacing: 0.3,
                        }}
                      >
                        IR-#{String(r.reportId).padStart(4, '0')}
                      </span>

                      <span
                        style={{
                          padding: '4px 10px',
                          background: T.sage200,
                          color: T.ink,
                          borderRadius: T.radius.pill,
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        SOS-#{String(r.alertId).padStart(4, '0')}
                      </span>

                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          padding: '3px 8px',
                          background: hasMinIO ? T.successSoft : T.infoSoft,
                          color: hasMinIO ? T.success : T.info,
                          borderRadius: T.radius.pill,
                          fontSize: 11,
                          fontWeight: 700,
                        }}
                      >
                        <Icon name={hasMinIO ? 'cloud_done' : 'cloud_upload'} size={14} />
                        {hasMinIO ? 'Archived in MinIO' : 'MinIO Ready'}
                      </span>

                      <span style={{ fontSize: 12, color: T.textMuted }}>
                        Resolved {new Date(r.resolvedAt).toLocaleString('en-PH')}
                      </span>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <button
                        type="button"
                        onClick={() => handleView(r)}
                        disabled={isWorking}
                        title="View Incident Record and PDF preview"
                        style={{
                          ...btnSubtle,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.primary,
                        }}
                      >
                        <Icon name="visibility" size={15} />
                        <span>View</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleSavePdf(r)}
                        disabled={isWorking}
                        title="Download official PDF to your computer"
                        style={{
                          ...btnGhost,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.ink,
                          border: `1px solid ${T.border}`,
                          borderRadius: T.radius.md,
                        }}
                      >
                        <Icon name="download" size={15} />
                        <span>Save PDF</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handlePrintPdf(r)}
                        disabled={isWorking}
                        title="Print the official PDF report"
                        style={{
                          ...btnGhost,
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 5,
                          padding: '6px 12px',
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.ink,
                          border: `1px solid ${T.border}`,
                          borderRadius: T.radius.md,
                        }}
                      >
                        <Icon name="print" size={15} />
                        <span>Print</span>
                      </button>
                    </div>
                  </div>

                  {/* Card patient & details row */}
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '280px 1fr 220px',
                      gap: 18,
                      alignItems: 'start',
                      background: T.surfaceMuted,
                      padding: '12px 16px',
                      borderRadius: T.radius.md,
                    }}
                  >
                    {/* Patient col */}
                    <div>
                      <div style={{ fontSize: 13.5, fontWeight: 700, color: T.ink }}>
                        {r.patient.name}
                      </div>
                      <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>
                        ID: <span style={{ fontFamily: 'monospace', fontWeight: 600 }}>{r.patient.studentNo}</span> · {r.patient.roleLabel}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>
                        {r.patient.affiliation}
                      </div>
                      {r.patient.phone && (
                        <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>
                          Contact: {r.patient.phone}
                        </div>
                      )}
                    </div>

                    {/* Incident narrative preview */}
                    <div>
                      <div style={{ fontSize: 11.5, fontWeight: 700, color: T.textSub, textTransform: 'uppercase', letterSpacing: 0.4 }}>
                        Incident Narrative
                      </div>
                      <div
                        style={{
                          fontSize: 12.5,
                          color: T.ink,
                          marginTop: 4,
                          lineHeight: 1.5,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {r.incidentDetails}
                      </div>
                      {r.treatmentNotes && (
                        <div style={{ marginTop: 4, fontSize: 11.5, color: T.primaryMid }}>
                          <strong>Treatment:</strong> {r.treatmentNotes}
                        </div>
                      )}
                    </div>

                    {/* Operational meta */}
                    <div style={{ borderLeft: `1px solid ${T.border}`, paddingLeft: 14 }}>
                      <div style={{ fontSize: 11.5, color: T.textSub }}>
                        <strong>Documented by:</strong> {r.documentedByName}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.textSub, marginTop: 2 }}>
                        <strong>Responder:</strong> {r.responderName || 'Campus Unit'}
                      </div>
                      <div style={{ fontSize: 11.5, color: T.textMuted, marginTop: 2 }}>
                        <strong>Response:</strong> {formatDuration(r.alert.responseTimeSeconds)}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── View / Preview & Print Modal ──────────────────────────────────────── */}
      {selectedRecord && (
        <Dialog label="Incident record" size="wide" backdropDismiss onDismiss={handleCloseModal}>
          <div className="modal-card"
            style={{
              background: T.surface,
              borderRadius: T.radius.xl,
              width: '92vw',
              maxWidth: 1040,
              height: '90vh',
              maxHeight: 880,
              display: 'flex',
              flexDirection: 'column',
              boxShadow: T.shadow.xl,
              overflow: 'hidden',
              border: `1px solid ${T.border}`,
            }}
          >
            {/* Modal Header */}
            <div
              style={{
                padding: '16px 24px',
                background: T.surface,
                borderBottom: `1px solid ${T.border}`,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 16,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span
                  style={{
                    padding: '4px 10px',
                    background: T.primaryTint,
                    color: T.primary,
                    borderRadius: T.radius.pill,
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  IR-#{String(selectedRecord.reportId).padStart(4, '0')}
                </span>
                <div>
                  <h2 tabIndex={-1} data-dialog-initial style={{ margin: 0, fontSize: 16, fontWeight: 700, color: T.ink }}>
                    Incident Record · {selectedRecord.patient.name}
                  </h2>
                  <div style={{ fontSize: 12, color: T.textSub, marginTop: 2 }}>
                    Resolved {new Date(selectedRecord.resolvedAt).toLocaleString('en-PH')} · Documented by {selectedRecord.documentedByName}
                  </div>
                </div>
              </div>

              {/* Modal toolbar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {/* Tab switchers */}
                <div role="tablist" aria-label="Incident record views" onKeyDown={event => navigateTabs(event, true)}
                  style={{ display: 'flex', background: T.sage200, padding: 3, borderRadius: T.radius.md, marginRight: 8 }}>
                  <button
                    type="button"
                    role="tab" id="incident-tab-preview" aria-controls="incident-panel-preview"
                    aria-selected={activeModalTab === 'preview'} tabIndex={activeModalTab === 'preview' ? 0 : -1}
                    onClick={() => setActiveModalTab('preview')}
                    style={{
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: T.radius.sm,
                      cursor: 'pointer',
                      background: activeModalTab === 'preview' ? T.surface : 'transparent',
                      color: activeModalTab === 'preview' ? T.primary : T.textSub,
                      boxShadow: activeModalTab === 'preview' ? T.shadow.xs : 'none',
                    }}
                  >
                    PDF Document
                  </button>
                  <button
                    type="button"
                    role="tab" id="incident-tab-details" aria-controls="incident-panel-details"
                    aria-selected={activeModalTab === 'details'} tabIndex={activeModalTab === 'details' ? 0 : -1}
                    onClick={() => setActiveModalTab('details')}
                    style={{
                      padding: '5px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      border: 'none',
                      borderRadius: T.radius.sm,
                      cursor: 'pointer',
                      background: activeModalTab === 'details' ? T.surface : 'transparent',
                      color: activeModalTab === 'details' ? T.primary : T.textSub,
                      boxShadow: activeModalTab === 'details' ? T.shadow.xs : 'none',
                    }}
                  >
                    Incident Summary
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleSavePdf(selectedRecord)}
                  disabled={loadingPdf || actionInProgressId !== null}
                  style={{
                    ...btnGhost,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 14px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.radius.md,
                  }}
                >
                  <Icon name="download" size={15} />
                  <span>Save PDF</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePrintPdf(selectedRecord)}
                  disabled={loadingPdf || actionInProgressId !== null}
                  style={{
                    ...btnPrimary,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '6px 16px',
                    fontSize: 12.5,
                    fontWeight: 600,
                  }}
                >
                  <Icon name="print" size={15} />
                  <span>Print</span>
                </button>

                <button
                  type="button"
                  onClick={handleCloseModal}
                  style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: T.textSub,
                    padding: 6,
                    borderRadius: '50%',
                    display: 'grid',
                    placeItems: 'center',
                    marginLeft: 6,
                  }}
                >
                  <Icon name="close" size={20} />
                </button>
              </div>
            </div>

            {notice}
            {/* Modal Body */}
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <div id="incident-panel-preview" role="tabpanel" aria-labelledby="incident-tab-preview"
                tabIndex={0} hidden={activeModalTab !== 'preview'}
                style={{ flex: 1, position: 'relative', background: '#454946', display: 'flex', flexDirection: 'column' }}>
                  {activeModalTab !== 'preview' ? null : loadingPdf ? (
                    <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: '#FFFFFF' }}>
                      <div style={{ textAlign: 'center' }}>
                        <Icon name="progress_activity" size={36} />
                        <p style={{ marginTop: 12, fontSize: 13.5 }}>Retrieving official PDF from MinIO...</p>
                      </div>
                    </div>
                  ) : pdfError ? (
                    <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 24 }}>
                      <div style={{ background: T.surface, padding: 24, borderRadius: T.radius.lg, maxWidth: 440, textAlign: 'center' }}>
                        <Icon name="warning" size={32} tone="danger" />
                        <h4 style={{ margin: '12px 0 6px', color: T.ink }}>PDF Preview Error</h4>
                        <p style={{ fontSize: 13, color: T.textSub, margin: 0 }}>{pdfError}</p>
                        <button
                          type="button"
                          onClick={() => handleView(selectedRecord)}
                          style={{ ...btnPrimary, marginTop: 16, fontSize: 12 }}
                        >
                          Retry PDF Retrieval
                        </button>
                      </div>
                    </div>
                  ) : previewPdfUrl ? (
                    <iframe
                      ref={printIframeRef}
                      src={previewPdfUrl}
                      title={`Incident Report IR-${selectedRecord.reportId}`}
                      style={{ width: '100%', height: '100%', border: 'none' }}
                    />
                  ) : null}
              </div>
              <div id="incident-panel-details" role="tabpanel" aria-labelledby="incident-tab-details"
                tabIndex={0} hidden={activeModalTab !== 'details'} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
                  <div style={{ maxWidth: 840, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
                    {/* Patient details block */}
                    <div style={{ background: T.surfaceMuted, padding: 18, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Patient Identification
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                        <div><strong>Full Name:</strong> {selectedRecord.patient.name}</div>
                        <div><strong>Institutional ID:</strong> {selectedRecord.patient.studentNo}</div>
                        <div><strong>Affiliation:</strong> {selectedRecord.patient.affiliation}</div>
                        <div><strong>Role / Status:</strong> {selectedRecord.patient.roleLabel}</div>
                        <div><strong>Phone:</strong> {selectedRecord.patient.phone || 'N/A'}</div>
                        <div><strong>Patient User ID:</strong> #{selectedRecord.patient.userId}</div>
                      </div>
                    </div>

                    {/* Timeline block */}
                    <div style={{ background: T.surfaceMuted, padding: 18, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                      <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Dispatch & Resolution Timeline
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12, fontSize: 13 }}>
                        <div><strong>SOS Triggered:</strong> {new Date(selectedRecord.alert.createdAt).toLocaleString('en-PH')}</div>
                        <div><strong>Acknowledged:</strong> {selectedRecord.alert.acknowledgedAt ? new Date(selectedRecord.alert.acknowledgedAt).toLocaleString('en-PH') : 'Immediate'}</div>
                        <div><strong>Resolved At:</strong> {new Date(selectedRecord.resolvedAt).toLocaleString('en-PH')}</div>
                        <div><strong>Response Duration:</strong> {formatDuration(selectedRecord.alert.responseTimeSeconds)}</div>
                        <div><strong>Documented By:</strong> {selectedRecord.documentedByName}</div>
                        <div><strong>Assigned Responder:</strong> {selectedRecord.responderName || 'Campus Response Unit'}</div>
                        {selectedRecord.alert.latitude && selectedRecord.alert.longitude && (
                          <div style={{ gridColumn: 'span 2' }}>
                            <strong>GPS Location:</strong> {selectedRecord.alert.latitude.toFixed(6)}, {selectedRecord.alert.longitude.toFixed(6)}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Narrative block */}
                    <div style={{ background: T.surfaceMuted, padding: 18, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Incident Narrative & Findings
                      </h3>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.ink, whiteSpace: 'pre-wrap' }}>
                        {selectedRecord.incidentDetails}
                      </p>
                    </div>

                    {/* Treatment block */}
                    <div style={{ background: T.surfaceMuted, padding: 18, borderRadius: T.radius.lg, border: `1px solid ${T.border}` }}>
                      <h3 style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: T.primary, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                        Actions Taken & Medical Treatment
                      </h3>
                      <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: T.ink, whiteSpace: 'pre-wrap' }}>
                        {selectedRecord.treatmentNotes || 'No specific clinical medications or external hospital transfer required.'}
                      </p>
                    </div>
                  </div>
              </div>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
