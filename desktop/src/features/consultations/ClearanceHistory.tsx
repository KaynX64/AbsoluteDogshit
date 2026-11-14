import { T, btnGhost } from '../../theme';
import Icon from '../../shared/ui/Icon';

export interface ClearanceHistoryRow {
  clearance_id: number;
  issued_at: string;
  expires_at: string;
  status: string;
  purpose: string;
  remarks?: string | null;
  revoked_at?: string | null;
  revocation_reason?: string | null;
}

interface ClearanceHistoryProps {
  setShowClrHistoryModal: (show: boolean) => void;
  clrHistoryPatientName: string;
  clrHistoryError: string;
  loadingClrHistory: boolean;
  clrHistory: ClearanceHistoryRow[];
  handleDownloadPdf: (kind: 'prescriptions' | 'clearances', id: number, onError?: (message: string) => void) => Promise<void>;
  setClrHistoryError: (message: string) => void;
}

export default function ClearanceHistory({ setShowClrHistoryModal, clrHistoryPatientName, clrHistoryError, loadingClrHistory, clrHistory, handleDownloadPdf, setClrHistoryError }: ClearanceHistoryProps) {
  return (
    <div className="modal-backdrop" onClick={() => setShowClrHistoryModal(false)}>
      <div
        className="modal-card"
        style={{ maxWidth: 780 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
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
            <h3
              style={{
                margin: 0,
                color: T.primary,
                fontSize: 17,
                fontWeight: 800,
              }}
            >
              <Icon name="description" size={14} /> Clearances you issued: {clrHistoryPatientName}
            </h3>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: T.textSub }}>
              Only clearances issued by you to this patient are shown.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowClrHistoryModal(false)}
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

        {clrHistoryError && (
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
            {clrHistoryError}
          </div>
        )}

        {loadingClrHistory ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textSub,
            }}
          >
            Loading clearances…
          </div>
        ) : clrHistory.length === 0 && !clrHistoryError ? (
          <div
            style={{
              padding: '40px 20px',
              textAlign: 'center',
              color: T.textMuted,
            }}
          >
            You have not issued any clearances to this patient.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {clrHistory.map((c) => {
              const isPastExpiry =
                c.expires_at &&
                new Date(c.expires_at).getTime() < new Date().setHours(0, 0, 0, 0);
              const shownStatus =
                c.status === 'approved' && isPastExpiry ? 'expired' : c.status;
              const tone =
                shownStatus === 'approved'
                  ? { bg: T.successSoft, fg: T.success, bd: T.successBorder }
                  : shownStatus === 'revoked' || shownStatus === 'rejected'
                  ? { bg: T.dangerSoft, fg: T.danger, bd: T.dangerBorder }
                  : { bg: T.warningSoft, fg: T.warning, bd: T.warningBorder };
              return (
                <div
                  key={c.clearance_id}
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
                      {new Date(c.issued_at).toLocaleString()}{' '}
                      <span style={{ color: T.textSub, fontWeight: 600 }}>
                        · Clearance #{c.clearance_id}
                      </span>
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
                      {shownStatus}
                    </span>
                  </div>

                  <div style={{ fontSize: 13, marginBottom: 6 }}>
                    <b>{c.purpose}</b>
                  </div>
                  <div style={{ fontSize: 13, color: T.textSub, marginBottom: 6 }}>
                    <b>Valid until:</b> {new Date(c.expires_at).toLocaleDateString()}
                  </div>

                  {c.remarks && (
                    <div
                      style={{
                        fontSize: 13,
                        color: T.textSub,
                        whiteSpace: 'pre-wrap',
                        marginBottom: 6,
                      }}
                    >
                      <b>Remarks:</b> {c.remarks}
                    </div>
                  )}

                  {c.status === 'revoked' && (
                    <div style={{ fontSize: 13, color: T.danger, marginBottom: 6 }}>
                      <b>Revoked</b>
                      {c.revoked_at
                        ? ` on ${new Date(c.revoked_at).toLocaleDateString()}`
                        : ''}
                      {c.revocation_reason ? `: ${c.revocation_reason}` : ''}
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() =>
                      handleDownloadPdf('clearances', c.clearance_id, setClrHistoryError)
                    }
                    style={{
                      ...btnGhost,
                      marginTop: 6,
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
      </div>
    </div>
  );
}
