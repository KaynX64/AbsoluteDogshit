import { T, btnGhost } from '../../theme';
import Icon from '../../shared/ui/Icon';
import type { Dispatch, SetStateAction } from 'react';

export type ToothCondition =
  | 'sound'
  | 'caries'
  | 'filled'
  | 'missing'
  | 'extraction_needed'
  | 'prophylaxis';

export interface ToothRecord {
  number: number;
  condition: ToothCondition;
  notes?: string;
}

const CONDITION_COLORS: Record<
  ToothCondition,
  { bg: string; text: string; label: string; border: string }
> = {
  sound: {
    bg: T.sage100,
    text: T.primaryMid,
    border: T.sage300,
    label: 'Sound',
  },
  caries: {
    bg: T.dangerSoft,
    text: T.danger,
    border: T.dangerBorder,
    label: 'Caries (Decay)',
  },
  filled: {
    bg: T.infoSoft,
    text: T.info,
    border: T.infoBorder,
    label: 'Restored / Filled',
  },
  missing: {
    bg: T.surface2,
    text: T.textSub,
    border: T.border,
    label: 'Missing / Extracted',
  },
  extraction_needed: {
    bg: T.warningSoft,
    text: T.warning,
    border: T.warningBorder,
    label: 'Needs Extraction',
  },
  prophylaxis: {
    bg: T.tonalTealBg,
    text: T.tonalTealFg,
    border: '#9FD9CB',
    label: 'Calculus / Prophylaxis',
  },
};

const UPPER_TEETH = Array.from({ length: 16 }, (_, i) => i + 1); // 1-16
const LOWER_TEETH = Array.from({ length: 16 }, (_, i) => 32 - i); // 32-17


interface OdontogramProps {
  activeWorkspacePanel: 'encounter' | 'documents' | 'dental';
  dentalChartData: Record<number, ToothRecord>;
  isArchivedMode: boolean;
  setDentalChartData: Dispatch<SetStateAction<Record<number, ToothRecord>>>;
  selectedTooth: number | null;
  setSelectedTooth: (tooth: number) => void;
  handleToothConditionChange: (condition: ToothCondition) => void;
}

export default function Odontogram({ activeWorkspacePanel, dentalChartData, isArchivedMode, setDentalChartData, selectedTooth, setSelectedTooth, handleToothConditionChange }: OdontogramProps) {
  return (
    <section data-workspace-view id="doctor-dental-panel" role="tabpanel" aria-labelledby="doctor-tab-dental" tabIndex={0}
      hidden={activeWorkspacePanel !== 'dental'}
      style={{
        background: T.surface,
        border: `1.5px solid ${T.tonalTealFg}`,
        borderRadius: T.radius.lg,
        padding: '18px 22px',
        marginBottom: 20,
        boxShadow: T.shadow.sm,
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 12,
          flexWrap: 'wrap',
          gap: 10,
        }}
      >
        <div>
          <h3 id="doctor-dental-title"
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 800,
              color: T.tonalTealFg,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Icon name="dentistry" size={14} /> Adult Dental Chart (Odontogram) · Universal Numbering System
          </h3>
          <p style={{ margin: '3px 0 0', fontSize: 12, color: T.textSub }}>
            Click a tooth (Upper 1–16, Lower 32–17) to record or update findings.
            Automatically appended to the clinical plan upon discharge.
          </p>
        </div>

        {Object.values(dentalChartData).filter(
          (t) => t.condition !== 'sound'
        ).length > 0 &&
          !isArchivedMode && (
            <button
              type="button"
              onClick={() => setDentalChartData({})}
              style={{
                ...btnGhost,
                padding: '4px 10px',
                fontSize: 11,
                color: T.danger,
                borderColor: T.dangerBorder,
              }}
            >
              Reset Chart
            </button>
          )}
      </div>

      <div
        style={{
          background: T.sage50,
          padding: 12,
          borderRadius: T.radius.md,
          border: `1px solid ${T.borderSoft}`,
        }}
      >
        {/* Upper teeth */}
        <div style={{ marginBottom: 10 }}>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: T.textMuted,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Maxillary Arch (Upper Teeth 1–16)
          </div>
          <div className="doctor-dental-arch">
            {UPPER_TEETH.map((tNum) => {
              const tData = dentalChartData[tNum] || {
                number: tNum,
                condition: 'sound' as ToothCondition,
              };
              const conf = CONDITION_COLORS[tData.condition];
              const isSel = selectedTooth === tNum;
              return (
                <button
                  key={tNum}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelectedTooth(tNum)}
                  title={`Tooth #${tNum} (${conf.label})`}
                  style={{
                    padding: '6px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRadius: T.radius.xs,
                    border: isSel
                      ? `2px solid ${T.primary}`
                      : `1px solid ${conf.border}`,
                    background: conf.bg,
                    cursor: isArchivedMode ? 'default' : 'pointer',
                    fontFamily: T.mono,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: conf.text,
                    }}
                  >
                    {tNum}
                  </span>
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: conf.text,
                    }}
                  >
                    {tData.condition[0].toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Lower teeth */}
        <div>
          <div
            style={{
              fontSize: 10.5,
              fontWeight: 800,
              color: T.textMuted,
              marginBottom: 4,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
            }}
          >
            Mandibular Arch (Lower Teeth 32–17)
          </div>
          <div className="doctor-dental-arch">
            {LOWER_TEETH.map((tNum) => {
              const tData = dentalChartData[tNum] || {
                number: tNum,
                condition: 'sound' as ToothCondition,
              };
              const conf = CONDITION_COLORS[tData.condition];
              const isSel = selectedTooth === tNum;
              return (
                <button
                  key={tNum}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelectedTooth(tNum)}
                  title={`Tooth #${tNum} (${conf.label})`}
                  style={{
                    padding: '6px 2px',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    borderRadius: T.radius.xs,
                    border: isSel
                      ? `2px solid ${T.primary}`
                      : `1px solid ${conf.border}`,
                    background: conf.bg,
                    cursor: isArchivedMode ? 'default' : 'pointer',
                    fontFamily: T.mono,
                  }}
                >
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 800,
                      color: conf.text,
                    }}
                  >
                    {tNum}
                  </span>
                  <span
                    style={{
                      fontSize: 8.5,
                      fontWeight: 800,
                      color: conf.text,
                    }}
                  >
                    {tData.condition[0].toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {!isArchivedMode && selectedTooth && (
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px dashed ${T.border}`,
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 8,
              flexWrap: 'wrap',
              gap: 6,
            }}
          >
            <span
              style={{
                fontSize: 12,
                fontWeight: 800,
                color: T.primary,
              }}
            >
              Set Finding for Tooth #{selectedTooth}:
            </span>
            <span style={{ fontSize: 11, color: T.textMuted }}>
              Current:{' '}
              {
                CONDITION_COLORS[
                  dentalChartData[selectedTooth]?.condition || 'sound'
                ].label
              }
            </span>
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(CONDITION_COLORS) as ToothCondition[]).map((cond) => {
              const current =
                (dentalChartData[selectedTooth]?.condition || 'sound') === cond;
              const conf = CONDITION_COLORS[cond];
              return (
                <button
                  key={cond}
                  type="button"
                  onClick={() => handleToothConditionChange(cond)}
                  style={{
                    padding: '4px 12px',
                    borderRadius: T.radius.pill,
                    border: current
                      ? `2px solid ${T.primary}`
                      : `1px solid ${conf.border}`,
                    background: conf.bg,
                    color: conf.text,
                    fontSize: 11.5,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {conf.label}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}
