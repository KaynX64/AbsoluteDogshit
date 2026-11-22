import Dialog from '../../shared/ui/Dialog';
import { T, btnGhost } from '../../theme';
import Icon from '../../shared/ui/Icon';

export interface PrescriptionHistoryRow {
  prescription_id: number;
  appointment_id?: number | string | null;
  pdfAvailable?: boolean;
  contract_version?: number;
  issued_at: string;
  expires_at?: string | null;
  status: string;
  notes?: string | null;
  items: {
    item_id: number | string; contract_version?: number; strength?: string; form?: string; quantity_unit?: string; pack_size?: string; review_on?: string; medicine_name: string; generic_name?: string | null;
    is_outside?: boolean | number; dosage: string; frequency: string; route: string;
    duration_days: number | null; quantity_prescribed: number; quantity_dispensed: number;
    instructions?: string | null;
  }[];
}

interface PrescriptionHistoryProps {
  setShowRxHistoryModal: (show: boolean) => void;
  rxHistoryPatientName: string;
  rxHistoryError: string;
  loadingRxHistory: boolean;
  rxHistory: PrescriptionHistoryRow[];
  handleDownloadPdf: (kind: 'prescriptions' | 'clearances', id: number, onError?: (message: string) => void) => Promise<void>;
  setRxHistoryError: (message: string) => void;
}

export default function PrescriptionHistory({ setShowRxHistoryModal, rxHistoryPatientName, rxHistoryError, loadingRxHistory, rxHistory, handleDownloadPdf, setRxHistoryError }: PrescriptionHistoryProps) {
  return (
    <Dialog label="Issued prescriptions" size="wide" backdropDismiss onDismiss={() => setShowRxHistoryModal(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: 780 }}
      >
        <div className="dialog-header"
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            borderBottom: `1px solid ${T.border}`,
            paddingBottom: 14,
            marginBottom: 18,
          }}
        >
          <div>
            <h3 tabIndex={-1} data-dialog-initial
              style={{
                margin: 0,
                color: T.primary,
                fontSize: 17,
                fontWeight: 800,
              }}
            >
              <Icon name="medication" size={14} /> Prescriptions you issued: {rxHistoryPatientName}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
              Only prescriptions issued by you to this patient are shown.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowRxHistoryModal(false)}
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

        <PrescriptionHistoryContent rxHistoryError={rxHistoryError} loadingRxHistory={loadingRxHistory} rxHistory={rxHistory} handleDownloadPdf={handleDownloadPdf} setRxHistoryError={setRxHistoryError} />
      </div>
    </Dialog>
  );
}


type PrescriptionHistoryContentProps = Pick<PrescriptionHistoryProps, 'rxHistoryError' | 'loadingRxHistory' | 'rxHistory' | 'handleDownloadPdf' | 'setRxHistoryError'> & {
  emptyMessage?: string;
  onViewPdf?: (kind: 'prescriptions' | 'clearances', id: number) => void;
};

export function PrescriptionHistoryContent({ rxHistoryError, loadingRxHistory, rxHistory, handleDownloadPdf, setRxHistoryError, onViewPdf,
  emptyMessage = 'You have not issued any prescriptions to this patient.' }: PrescriptionHistoryContentProps) {
  return <>
        {rxHistoryError && (
          <div
            style={{
              background: T.dangerSoft,
              color: T.danger,
              border: `1px solid ${T.dangerBorder}`,
              borderRadius: T.radius.md,
              padding: '10px 14px',
              fontSize: 13,
              marginBottom: 14,
            }}
          >
            {rxHistoryError}
          </div>
        )}

        {loadingRxHistory ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textSub,
            }}
          >
            Loading prescriptions…
          </div>
        ) : rxHistory.length === 0 && !rxHistoryError ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textMuted,
            }}
          >
            {emptyMessage}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {rxHistory.map((rx) => {
              const tone =
                rx.status === 'active'
                  ? { bg: T.successSoft, fg: T.success, bd: T.successBorder }
                  : rx.status === 'cancelled'
                  ? { bg: T.dangerSoft, fg: T.danger, bd: T.dangerBorder }
                  : { bg: T.warningSoft, fg: T.warning, bd: T.warningBorder };
              return (
                <div
                  key={rx.prescription_id}
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
                      alignItems: 'center',
                      marginBottom: 10,
                    }}
                  >
                    <b style={{ color: T.primary, fontSize: 13.5 }}>
                      {new Date(rx.issued_at).toLocaleString()}{' '}
                      <span style={{ color: T.textSub, fontWeight: 600 }}>
                        · Rx #{rx.prescription_id}
                      </span>
                      {rx.expires_at && (
                        <span style={{ color: T.textMuted, fontSize: 11, fontWeight: 500, marginLeft: 8 }}>
                          (Expires: {new Date(rx.expires_at).toLocaleDateString()})
                        </span>
                      )}
                    </b>
                    <span
                      style={{
                        background: tone.bg,
                        color: tone.fg,
                        border: `1px solid ${tone.bd}`,
                        borderRadius: 999,
                        padding: '2px 10px',
                        fontSize: 11,
                        fontWeight: 800,
                        textTransform: 'uppercase',
                        letterSpacing: 0.6,
                      }}
                    >
                      {rx.status}
                    </span>
                  </div>

                  {rx.items.map((it) => (
                    <div
                      key={it.item_id}
                      style={{
                        fontSize: 13,
                        marginBottom: 8,
                        paddingBottom: 8,
                        borderBottom: `1px dashed ${T.border}`,
                      }}
                    >
                      <b>{it.medicine_name}</b>
                      {it.contract_version !== 2 && it.generic_name ? ` (${it.generic_name})` : ''}
                      {it.is_outside && (
                        <span
                          style={{
                            marginLeft: 8,
                            background: T.warningSoft,
                            color: T.warning,
                            border: `1px solid ${T.warningBorder}`,
                            borderRadius: 999,
                            padding: '1px 8px',
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 0.5,
                            verticalAlign: 'middle',
                            whiteSpace: 'nowrap',
                          }}
                          title="Not dispensed by the infirmary — purchased at an external pharmacy"
                        >
                          OUTSIDE Rx
                        </span>
                      )}
                      <div style={{ color: T.textSub, marginTop: 2 }}>
                        {it.contract_version === 2 && <div>Strength: {it.strength} · Form: {it.form}</div>}
                        Dose: {it.dosage || 'Not recorded'} · {it.frequency || 'Not recorded'} · {it.route || 'Not recorded'}
                        <div>{[it.duration_days == null ? '' : `Duration: ${it.duration_days} days`, it.review_on ? `Review on: ${it.review_on}` : ''].filter(Boolean).join(' · ') || 'Duration: Not recorded'} · Supply: {it.quantity_prescribed ?? it.quantity_dispensed ?? 'Not recorded'} {it.quantity_unit || '(unit not recorded)'} {it.pack_size || ''}</div>
                        {it.is_outside ? ' (prescribed)' : it.quantity_dispensed ? ` (dispensed: ${it.quantity_dispensed})` : ''}
                      </div>
                      {(
                        <div style={{ color: T.textSub, marginTop: 2 }}>
                          <b>Instructions:</b> {it.instructions || 'Not recorded'}
                        </div>
                      )}
                    </div>
                  ))}

                  {rx.notes && (
                    <div
                      style={{
                        fontSize: 13,
                        color: T.textSub,
                        whiteSpace: 'pre-wrap',
                        marginBottom: 10,
                      }}
                    >
                      <b>{rx.contract_version === 2 ? 'Patient advice—printed on prescription:' : 'Recorded prescription notes:'}</b> {rx.notes}
                    </div>
                  )}

                  {onViewPdf && <button type="button" style={btnGhost}
                    onClick={() => onViewPdf('prescriptions', rx.prescription_id)}>
                    <Icon name="visibility" size={14} /> View / print PDF
                  </button>}
                  {rx.pdfAvailable === false && <p style={{ color: T.textSub, fontSize: 12 }}>
                    PDF is pending. Recorded document details remain available.
                  </p>}
                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadPdf(
                        'prescriptions',
                        rx.prescription_id,
                        setRxHistoryError
                      )
                    }
                    style={{
                      ...btnGhost,
                      color: T.info,
                      borderColor: T.infoBorder,
                    }}
                  >
                    <Icon name="draft" size={14} /> Download PDF
                  </button>
                </div>
              );
            })}
          </div>
        )}
  </>;
}
