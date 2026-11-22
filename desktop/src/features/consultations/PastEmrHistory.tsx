import Dialog from '../../shared/ui/Dialog';
import { T } from '../../theme';
import Icon from '../../shared/ui/Icon';
import HistoryPageControls from './HistoryPageControls';
import type { usePatientHistory } from './usePatientHistory';
import type { AppointmentItem } from './DoctorConsole';

interface PastEmrHistoryProps {
  setShowHistoryModal: (show: boolean) => void;
  selectedApp: AppointmentItem;
  loadingHistory: boolean;
  patientHistory: ReturnType<typeof usePatientHistory>['records'];
  historyPage: ReturnType<typeof usePatientHistory>;
  handleOpenAttachment: (attachmentId: number, fileName: string, mimeType?: string) => Promise<void>;
  openingAttachmentId: number | null;
}

export default function PastEmrHistory({ setShowHistoryModal, selectedApp, loadingHistory, patientHistory, historyPage, handleOpenAttachment, openingAttachmentId }: PastEmrHistoryProps) {
  return (
    <Dialog label="Past EMR history" size="wide" backdropDismiss onDismiss={() => setShowHistoryModal(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: 780 }}
      >
        <div className="dialog-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            borderBottom: `1px solid ${T.border}`,
            paddingBottom: 14,
            marginBottom: 18,
          }}
        >
          <h3 tabIndex={-1} data-dialog-initial
            id="past-emr-history-title"
            style={{
              margin: 0,
              color: T.info,
              fontSize: 17,
              fontWeight: 800,
            }}
          >
            <Icon name="article" size={14} /> Medical history: {selectedApp?.first_name}{' '}
            {selectedApp?.last_name}
          </h3>
          <button
            type="button"
            onClick={() => setShowHistoryModal(false)}
            aria-label="Close medical history"
            style={{
              background: 'none',
              border: 'none',
              fontSize: 20,
              cursor: 'pointer',
              color: T.textSub,
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </div>

        {loadingHistory && patientHistory.length === 0 ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textSub,
            }}
          >
            Loading records…
          </div>
        ) : patientHistory.length === 0 ? (
          !historyPage.error && <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textMuted,
            }}
          >
            No prior encounters recorded.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {patientHistory.map((item) => (
              <div
                key={item.emr_id}
                style={{
                  border: `1px solid ${T.border}`,
                  borderRadius: T.radius.md,
                  padding: 16,
                  background: T.sage50,
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    marginBottom: 8,
                  }}
                >
                  <b style={{ color: T.primary, fontSize: 13.5 }}>
                    {new Date(item.encounter_date).toLocaleDateString()}
                  </b>
                  <small style={{ color: T.textSub }}>
                    Attending: Dr. {item.doctor_last_name} ({item.doctor_license})
                  </small>
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>Diagnosis:</b> {item.diagnosis}
                </div>
                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  <b>Complaint:</b> {item.chief_complaint}
                </div>
                {item.treatment_plan && (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.textSub,
                      marginBottom: 4,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    <b>Treatment:</b> {item.treatment_plan}
                  </div>
                )}
                {item.notes && (
                  <div
                    style={{
                      fontSize: 13,
                      color: T.textSub,
                      marginBottom: 4,
                    }}
                  >
                    <b>Clinical notes:</b> {item.notes}
                  </div>
                )}
                {item.prescriptions?.filter((rx: any) => rx.notes).map((rx: any) => (
                  <div key={rx.prescription_id}
                    style={{
                      fontSize: 13,
                      color: T.primary,
                      marginBottom: 4,
                    }}
                  >
                    <b>Rx #{rx.prescription_id} notes:</b>{' '}
                    {rx.notes}
                  </div>
                ))}

                {item.attachments && item.attachments.length > 0 && (
                  <div
                    style={{
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px dashed ${T.border}`,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 10.5,
                        fontWeight: 800,
                        letterSpacing: 1.2,
                        color: T.primary,
                        textTransform: 'uppercase',
                        marginBottom: 8,
                      }}
                    >
                      <Icon name="attach_file" size={14} /> Diagnostic lab attachments
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {item.attachments.map((att: any) => (
                        <button
                          key={att.attachment_id}
                          type="button"
                          onClick={() =>
                            handleOpenAttachment(att.attachment_id, att.file_name)
                          }
                          disabled={openingAttachmentId === att.attachment_id}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 6,
                            padding: '5px 12px',
                            background: T.infoSoft,
                            color: T.info,
                            borderRadius: T.radius.xs,
                            fontSize: 11.5,
                            fontWeight: 700,
                            border: `1px solid ${T.infoBorder}`,
                            cursor: 'pointer',
                          }}
                        >
                          <Icon name="draft" size={14} /> {att.file_name} (
                          {(att.file_size / 1024).toFixed(0)} KB){' '}
                          {openingAttachmentId === att.attachment_id ? '⏳' : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        <HistoryPageControls page={historyPage} />
      </div>
    </Dialog>
  );
}
