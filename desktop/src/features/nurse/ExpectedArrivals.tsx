import Dialog from '../../shared/ui/Dialog';
import { T, softBadge } from '../../theme';
import Icon from '../../shared/ui/Icon';
import { NURSE_CSS, ConsoleHeader, SkeletonRows, EmptyState, dayLabel, isOverdue, allergyIsReal, card, microLabel, mono, iconChip, smallButton } from './nursePresentation';
import type { ExpectedItem, ActiveTicket } from './nurseTypes';
import type { ReactNode } from 'react';

interface ExpectedArrivalsProps {
  todayLabel: string;
  expected: ExpectedItem[];
  overdueCount: number;
  loadingExpected: boolean;
  lastSync: Date | null;
  activeSosCount: number;
  fetchExpected: () => Promise<void>;
  sosBand: ReactNode;
  noticeBanner: ReactNode;
  expectedQuery: string;
  setExpectedQuery: React.Dispatch<React.SetStateAction<string>>;
  expectedFeedback: { text: string; ok: boolean } | null;
  filteredExpected: ExpectedItem[];
  checkingInId: number | null;
  openCheckInConfirm: (item: ExpectedItem) => Promise<void>;
  confirmCheckIn: ExpectedItem | null;
  confirmTicketCheck: { loading: boolean; hasTicket: boolean; ticket: ActiveTicket | null; };
  setConfirmCheckIn: (item: ExpectedItem | null) => void;
  executeCheckInExpected: (item: ExpectedItem) => Promise<void>;
  sosConfirmModal: ReactNode;
}

export default function ExpectedArrivals({
  todayLabel,
  expected,
  overdueCount,
  loadingExpected,
  lastSync,
  activeSosCount,
  fetchExpected,
  sosBand,
  noticeBanner,
  expectedQuery,
  setExpectedQuery,
  expectedFeedback,
  filteredExpected,
  checkingInId,
  openCheckInConfirm,
  confirmCheckIn,
  confirmTicketCheck,
  setConfirmCheckIn,
  executeCheckInExpected,
  sosConfirmModal,
}: ExpectedArrivalsProps) {
  return (
    <div className="nc-root" style={{ display: 'flex', flexDirection: 'column', gap: T.sp[5] }}>
      <style>{NURSE_CSS}</style>

      <ConsoleHeader
        eyebrow="Nurse station"
        title="Expected arrivals"
        subtitle={
          <>
            {todayLabel} · <b>{expected.length}</b> scheduled, not checked in
            {overdueCount > 0 && (
              <>
                {' '}
                · <b style={{ color: T.warning }}>{overdueCount}</b> past their slot
              </>
            )}
          </>
        }
        loading={loadingExpected}
        lastSync={lastSync}
        sosCount={activeSosCount}
        onRefresh={fetchExpected}
      />

      {sosBand}

      {noticeBanner}

      <section data-workspace-view style={{ ...card, padding: T.sp[5], display: 'flex', flexDirection: 'column', gap: T.sp[4] }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3], flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: T.sp[3], flex: 1, minWidth: 200 }}>
            <span style={iconChip(T.primaryTint, T.primary, 40)}>
              <Icon name="event_available" size={20} />
            </span>
            <div>
              <h2 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                Today's bookings
              </h2>
              <p style={{ margin: '2px 0 0', fontSize: T.fs.meta, color: T.textSub }}>
                Sorted by slot · check-in issues a queue ticket
              </p>
            </div>
          </div>

          <div style={{ position: 'relative', flex: '1 1 220px', maxWidth: 300 }}>
            <Icon
              name="search"
              size={16}
              style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: T.textMuted, pointerEvents: 'none' }}
            />
            <input
              value={expectedQuery}
              onChange={(e) => setExpectedQuery(e.target.value)}
              placeholder="Search name, ID or doctor"
              aria-label="Search expected arrivals"
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '9px 14px 9px 36px',
                borderRadius: T.radius.pill,
                border: `1px solid ${T.border}`,
                background: T.sage50,
                fontSize: T.fs.meta,
                fontFamily: T.font,
                color: T.text,
                outline: 'none',
              }}
            />
          </div>
        </div>

        {expectedFeedback && !confirmCheckIn && (
          <div
            role="status"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 14px',
              borderRadius: T.radius.md,
              fontSize: T.fs.body,
              fontWeight: T.fw.semibold,
              background: expectedFeedback.ok ? T.successSoft : T.dangerSoft,
              color: expectedFeedback.ok ? T.success : T.danger,
              border: `1px solid ${expectedFeedback.ok ? T.successBorder : T.dangerBorder}`,
            }}
          >
            <Icon name={expectedFeedback.ok ? 'check_circle' : 'error'} size={16} />
            {expectedFeedback.text}
          </div>
        )}

        {loadingExpected ? (
          <SkeletonRows count={4} />
        ) : expected.length === 0 ? (
          <EmptyState
            icon="event_available"
            title="Every booking is accounted for"
            body="No scheduled patient is still waiting to check in today. Walk-ins are registered from the Triage tab's scanner."
          />
        ) : filteredExpected.length === 0 ? (
          <EmptyState
            icon="search_off"
            title="No match"
            body={`No booking matches “${expectedQuery.trim()}”. Clear the search to see all ${expected.length}.`}
          />
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {filteredExpected.map((item) => {
              const overdue = isOverdue(item.date_time);
              const allergy = allergyIsReal(item.allergies);
              const busy = checkingInId === item.appointment_id;

              return (
                <li
                  key={item.appointment_id}
                  className="nc-row"
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '76px 1fr auto',
                    gap: T.sp[3],
                    alignItems: 'center',
                    padding: '14px 16px',
                    borderRadius: T.radius.lg,
                    background: T.sage50,
                    border: `1px solid ${overdue ? T.warningBorder : T.borderSoft}`,
                    borderLeft: `3px solid ${overdue ? T.warning : T.sage300}`,
                  }}
                >
                  <div>
                    <div style={{ ...mono, fontSize: T.fs.bodyLg, fontWeight: T.fw.extrabold, color: overdue ? T.warning : T.primary }}>
                      {item.time_slot}
                    </div>
                    <div style={{ ...microLabel, marginTop: 3, color: overdue ? T.warning : T.textMuted }}>
                      {overdue ? 'Overdue' : dayLabel(item.date_str)}
                    </div>
                  </div>

                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <strong style={{ fontSize: T.fs.bodyLg, fontWeight: T.fw.bold, color: T.text }}>
                        {item.first_name} {item.last_name}
                      </strong>
                      <span style={{ ...mono, fontSize: T.fs.meta, color: T.textMuted }}>{item.student_no}</span>
                    </div>

                    <div
                      style={{
                        marginTop: 6,
                        display: 'flex',
                        alignItems: 'center',
                        gap: 6,
                        flexWrap: 'wrap',
                        fontSize: T.fs.meta,
                        color: T.textSub,
                      }}
                    >
                      <span style={softBadge(T.sage100, T.textSub, T.border)}>{item.appointment_type}</span>
                      <span style={softBadge(T.sage100, T.textSub, T.border)}>
                        <Icon name="medical_services" size={12} /> Dr. {item.doctor_first_name} {item.doctor_last_name}
                      </span>
                      {item.blood_type && (
                        <span style={softBadge(T.dangerSoft, T.danger, T.dangerBorder)}>
                          <Icon name="bloodtype" size={12} /> {item.blood_type}
                        </span>
                      )}
                      {allergy && (
                        <span style={softBadge(T.dangerSoft, T.danger, T.dangerBorder)}>
                          <Icon name="warning" size={12} /> {item.allergies}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openCheckInConfirm(item)}
                    disabled={busy}
                    style={{
                      padding: '9px 18px',
                      borderRadius: T.radius.pill,
                      background: busy ? T.sage400 : T.primary,
                      color: busy ? T.textSub : T.textOnPrimary,
                      border: 'none',
                      fontSize: T.fs.body,
                      fontWeight: T.fw.bold,
                      fontFamily: T.font,
                      cursor: busy ? 'not-allowed' : 'pointer',
                      boxShadow: busy ? 'none' : T.shadow.glowPrimary,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {busy ? 'Checking in…' : 'Check in'}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
            padding: '12px 14px',
            borderRadius: T.radius.md,
            background: T.infoSoft,
            border: `1px solid ${T.infoBorder}`,
            color: T.info,
            fontSize: T.fs.meta,
            lineHeight: T.lh.normal,
          }}
        >
          <Icon name="qr_code_scanner" size={16} style={{ marginTop: 1 }} />
          <span>
            <b>Walk-in?</b> Switch to <b>Triage</b> and scan the student's QR pass — the intake scanner
            registers them as a walk-in automatically.
          </span>
        </div>
      </section>

      {/* ── Check-in modal ─────────────────────────────────── */}
      {confirmCheckIn && (
        <Dialog label="Confirm patient check-in" size="compact" busy={checkingInId !== null} onDismiss={() => setConfirmCheckIn(null)}>
          <div className="modal-card" style={{ maxWidth: 480 }}>
            {confirmTicketCheck.loading ? (
              <div style={{ padding: '36px 20px', textAlign: 'center' }}>
                <div
                  style={{
                    width: 36,
                    height: 36,
                    margin: '0 auto 14px',
                    border: `3px solid ${T.primaryTint}`,
                    borderTopColor: T.primary,
                    borderRadius: '50%',
                  }}
                  className="nc-spin"
                />
                <p style={{ margin: 0, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.text }}>
                  Checking this patient's queue status…
                </p>
              </div>
            ) : confirmTicketCheck.hasTicket ? (
              <>
                <div className="dialog-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                  <span style={iconChip(T.warningSoft, T.warning, 40)}>
                    <Icon name="warning" size={20} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                      Already in today's queue
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: T.fs.body, color: T.textSub }}>
                      {confirmCheckIn.first_name} {confirmCheckIn.last_name} checked in earlier — no new ticket
                      was issued.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 14,
                    padding: '16px 18px',
                    background: T.warningSoft,
                    border: `1px solid ${T.warningBorder}`,
                    borderRadius: T.radius.md,
                    marginBottom: 18,
                  }}
                >
                  <div>
                    <div style={{ ...microLabel, color: T.warning }}>Queue ticket</div>
                    <div style={{ ...mono, fontSize: T.fs.h2, fontWeight: T.fw.extrabold, color: T.warning }}>
                      {confirmTicketCheck.ticket?.ticket_no || '—'}
                    </div>
                  </div>
                  <div>
                    <div style={{ ...microLabel, color: T.warning }}>Status</div>
                    <div style={{ marginTop: 4 }}>
                      <span style={softBadge(T.warningSoft, T.warning, T.warningBorder)}>
                        {confirmTicketCheck.ticket?.status?.replace('-', ' ') || '—'}
                      </span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTop: `1px solid ${T.borderSoft}` }}>
                  <button type="button" onClick={() => setConfirmCheckIn(null)} style={smallButton(true, T.primary)}>
                    Got it
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="dialog-header" style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 18 }}>
                  <span style={iconChip(T.primaryTint, T.primary, 40)}>
                    <Icon name="check" size={20} />
                  </span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ margin: 0, fontSize: T.fs.title, fontWeight: T.fw.extrabold, color: T.text }}>
                      Confirm check-in
                    </h3>
                    <p style={{ margin: '4px 0 0', fontSize: T.fs.body, color: T.textSub }}>
                      Issues a queue ticket and adds the patient to today's live triage queue.
                    </p>
                  </div>
                </div>

                <div
                  style={{
                    padding: '16px 18px',
                    background: T.sage50,
                    border: `1px solid ${T.border}`,
                    borderRadius: T.radius.md,
                    marginBottom: 18,
                  }}
                >
                  <div style={{ fontSize: T.fs.subtitle, fontWeight: T.fw.extrabold, color: T.text }}>
                    {confirmCheckIn.first_name} {confirmCheckIn.last_name}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginTop: 12 }}>
                    <div>
                      <div style={microLabel}>Student ID</div>
                      <div style={{ ...mono, marginTop: 3, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.text }}>
                        {confirmCheckIn.student_no}
                      </div>
                    </div>
                    <div>
                      <div style={microLabel}>Scheduled</div>
                      <div style={{ ...mono, marginTop: 3, fontSize: T.fs.body, fontWeight: T.fw.bold, color: T.primary }}>
                        {confirmCheckIn.time_slot}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="dialog-footer">
                  {expectedFeedback && !expectedFeedback.ok && <p role="alert" className="dialog-error">{expectedFeedback.text}</p>}
                  <button
                    type="button"
                    data-dialog-initial
                    disabled={checkingInId !== null}
                    onClick={() => setConfirmCheckIn(null)}
                    style={smallButton(false, T.textSub)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={checkingInId !== null}
                    onClick={() => executeCheckInExpected(confirmCheckIn)}
                    style={{
                      ...smallButton(true, T.primary),
                      padding: '9px 20px',
                      fontSize: T.fs.body,
                      boxShadow: T.shadow.glowPrimary,
                    }}
                  >
                    <Icon name="check" size={15} /> {checkingInId !== null ? "Checking in…" : "Confirm check-in"}
                  </button>
                </div>
              </>
            )}
          </div>
        </Dialog>
      )}

      {sosConfirmModal}
    </div>
  );
}
