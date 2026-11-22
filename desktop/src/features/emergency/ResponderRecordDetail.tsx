import { useEffect, useRef, useState } from 'react';
import Dialog from '../../shared/ui/Dialog';
import Icon from '../../shared/ui/Icon';
import { usePreviewResource } from '../../shared/ui/usePreviewResource';
import { useIncidentReports } from './IncidentReportContext';
import { reportRequest, reportedDate, outcomeLabel, type HistoryRecord, type FiledReport } from './reportApi';

export default function ResponderRecordDetail({ record, filed, onClose }: { record: HistoryRecord; filed: boolean; onClose: () => void }) {
  const [detail, setDetail] = useState<HistoryRecord | null>(null);
  const [report, setReport] = useState<FiledReport | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pdf, setPdf] = useState<string | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const { openReport, summary } = useIncidentReports();
  const preview = usePreviewResource();
  const frame = useRef<HTMLIFrameElement>(null);
  useEffect(() => { if (filed && !summary?.canViewFiled) { preview.clear(); setPdf(null); setReport(null); } }, [filed, summary?.canViewFiled]);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError('');
    void (async () => {
      try {
        const data = await reportRequest<HistoryRecord>(`/history/${record.alertId}`, { signal: controller.signal });
        if (!controller.signal.aborted) setDetail(data);
        if (filed && record.reportId) {
          const data = await reportRequest<FiledReport>(`/reports/${record.reportId}`, { signal: controller.signal });
          if (!controller.signal.aborted) setReport(data);
        }
      } catch (err: any) { if (!controller.signal.aborted) setError(err.message); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => { controller.abort(); };
  }, [record.alertId, record.reportId, filed, attempt]);
  const loadPdf = async () => {
    if (!record.reportId || pdfLoading) return;
    const signal = preview.begin(); setPdfLoading(true); setError('');
    try {
      const blob = await reportRequest<Blob>(`/reports/${record.reportId}/pdf`, { signal }, true);
      const url = preview.publish(blob, signal); if (url) setPdf(url);
    } catch (err: any) { if (!signal.aborted) setError(err.message); }
    finally { if (!signal.aborted) setPdfLoading(false); }
  };
  return <Dialog label={filed ? 'Filed incident report' : 'Incident history'} size="wide" onDismiss={onClose}>
    <div className="rh-modal">
      <div className="dialog-header"><div><span className="rh-eyebrow">SOS-{record.alertId}{record.reportId ? ` · IR-${record.reportId}` : ''}</span>
        <h2 tabIndex={-1} data-dialog-initial>{record.patient.name}</h2></div><button className="rh-button" onClick={onClose} aria-label="Close incident details"><Icon name="close" size={18} /></button></div>
      {filed && !summary?.canViewFiled ? <p role="alert">Incident archive access is unavailable.</p> : <>
      {loading && <p role="status">Loading recorded details…</p>}
      {error && <div className="rh-alert" role="alert">{error} <button className="rh-button" onClick={() => { if (pdf || report) void loadPdf(); else setAttempt(value => value + 1); }}>Retry</button></div>}
      {detail && <>
        <span className="rh-badge">{outcomeLabel(detail.status)}</span>
        <dl className="rh-detail-grid"><div><dt>Patient identifier</dt><dd>{detail.patient.identifier}</dd></div><div><dt>Reported location</dt><dd>{detail.location || 'Not recorded'}</dd></div>
          <div><dt>Reported</dt><dd>{reportedDate(detail.createdAt)}</dd></div><div><dt>Closed</dt><dd>{reportedDate(detail.resolvedAt)}</dd></div></dl>
        {detail.latitude !== null && detail.longitude !== null && <a className="rh-button" href={`https://www.google.com/maps?q=${detail.latitude},${detail.longitude}`} target="_blank" rel="noreferrer"><Icon name="map" size={18} />Open reported location</a>}
        <h3>Recorded activity</h3><ol className="rh-timeline">{detail.timeline?.map((event, index) => <li key={index}><strong>{outcomeLabel(event.status)}</strong><small>{reportedDate(event.at)}{event.actor ? ` · ${event.actor}` : ''}</small></li>)}</ol>
        {detail.needsReport && <div className="rh-alert"><p>This resolved incident still needs a report.</p><button className="rh-button rh-button--primary" onClick={() => { onClose(); openReport(detail.alertId); }}>{detail.hasDraft ? 'Resume my draft' : 'Write report'}</button></div>}
      </>}
      {report && <><h3>Filed report · read-only</h3><p className="rh-muted">{reportedDate(report.filedAt)} · {report.documentedByName}</p>
        <h4>Incident details</h4><p className="rh-narrative">{report.incidentDetails}</p><h4>Treatment / handover notes</h4><p className="rh-narrative">{report.treatmentNotes || 'No additional notes recorded.'}</p>
        <div className="rh-actions"><button className="rh-button" disabled={pdfLoading} onClick={() => void loadPdf()}><Icon name="picture_as_pdf" size={18} />{pdfLoading ? 'Loading PDF…' : 'Preview PDF'}</button>
          {pdf && <><a className="rh-button" href={pdf} download={`incident-report-${report.reportId}.pdf`}>Download PDF</a><button className="rh-button" onClick={() => { try { frame.current?.contentWindow?.focus(); frame.current?.contentWindow?.print(); } catch { setError('Open the PDF preview and use its print control.'); } }}>Print</button></>}
        </div>{!report.pdfAvailable && <p className="rh-muted">The report is filed. If its PDF is still being generated, retry the preview shortly.</p>}
        {pdf && <iframe className="rh-pdf" ref={frame} title="Official incident report PDF" src={pdf} />}
      </>}
      </>}
    </div>
  </Dialog>;
}
