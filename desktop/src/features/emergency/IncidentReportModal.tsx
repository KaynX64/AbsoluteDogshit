import { useRef } from 'react';
import Dialog from '../../shared/ui/Dialog';
import { useIncidentReports } from './IncidentReportContext';
import { ReportEditor, type ReportEditorHandle } from './ReportEditor';

/** One shell editor shared by live resolution and the persistent worklist. */
export default function IncidentReportModal() {
  const { openId, closeReport } = useIncidentReports();
  const editor = useRef<ReportEditorHandle>(null);
  if (openId === null) return null;
  return <Dialog label="Incident documentation" urgent onDismiss={() => editor.current?.close()}>
    <ReportEditor key={openId} ref={editor} alertId={openId} onClose={closeReport} />
  </Dialog>;
}
