// desktop/src/components/DentalChart.tsx
import React, { useState } from 'react';
import { T } from '../theme';

export type ToothCondition = 'sound' | 'caries' | 'filled' | 'missing' | 'extraction_needed' | 'prophylaxis';

export interface ToothRecord {
  number: number;
  condition: ToothCondition;
  notes?: string;
}

interface DentalChartProps {
  value?: Record<number, ToothRecord>;
  onChange?: (chart: Record<number, ToothRecord>) => void;
  readOnly?: boolean;
}

const CONDITION_COLORS: Record<ToothCondition, { bg: string; text: string; label: string }> = {
  sound: { bg: '#EEF3EC', text: '#2E5C43', label: 'Sound' },
  caries: { bg: '#FDE8E8', text: '#7A2E26', label: 'Caries (Decay)' },
  filled: { bg: '#E0F2FE', text: '#0369A1', label: 'Restored / Filled' },
  missing: { bg: '#F3F4F6', text: '#6B7280', label: 'Missing / Extracted' },
  extraction_needed: { bg: '#FEF3C7', text: '#92400E', label: 'Indicated for Extraction' },
  prophylaxis: { bg: '#F0FDFA', text: '#0F766E', label: 'Calculus / Prophylaxis' },
};

// Adult Universal Numbering System: Upper (1-16) and Lower (32-17)
const UPPER_TEETH = Array.from({ length: 16 }, (_, i) => i + 1);
const LOWER_TEETH = Array.from({ length: 16 }, (_, i) => 32 - i);

export default function DentalChart({ value = {}, onChange, readOnly = false }: DentalChartProps) {
  const [chart, setChart] = useState<Record<number, ToothRecord>>(value);
  const [selectedTooth, setSelectedTooth] = useState<number | null>(null);

  const handleToothClick = (toothNo: number) => {
    if (readOnly) return;
    setSelectedTooth(toothNo);
  };

  const handleSetCondition = (condition: ToothCondition) => {
    if (!selectedTooth) return;
    const updated = {
      ...chart,
      [selectedTooth]: {
        number: selectedTooth,
        condition,
        notes: chart[selectedTooth]?.notes || '',
      },
    };
    setChart(updated);
    onChange?.(updated);
  };

  const renderToothRow = (teeth: number[], label: string) => (
    <div style={{ marginBottom: 12 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: T.textSub, marginBottom: 6, textTransform: 'uppercase' }}>
        {label}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(16, 1fr)', gap: 4 }}>
        {teeth.map((tNum) => {
          const toothData = chart[tNum] || { number: tNum, condition: 'sound' };
          const styleConfig = CONDITION_COLORS[toothData.condition];
          const isSelected = selectedTooth === tNum;

          return (
            <button
              key={tNum}
              type="button"
              onClick={() => handleToothClick(tNum)}
              title={`Tooth #${tNum} (${styleConfig.label})`}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '6px 2px',
                borderRadius: T.radius.xs,
                border: isSelected ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
                background: styleConfig.bg,
                cursor: readOnly ? 'default' : 'pointer',
                fontFamily: T.mono,
                transition: 'all 120ms ease',
              }}
            >
              <span style={{ fontSize: 11, fontWeight: 800, color: isSelected ? T.primaryDark : styleConfig.text }}>
                {tNum}
              </span>
              <span style={{ fontSize: 8, fontWeight: 700, color: styleConfig.text, textTransform: 'uppercase' }}>
                {toothData.condition[0].toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ background: T.sage50, padding: 14, borderRadius: T.radius.md, border: `1px solid ${T.borderSoft}` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 12, fontWeight: 800, color: T.primary, textTransform: 'uppercase' }}>
          🦷 Interactive Odontogram (Universal Numbering 1–32)
        </span>
        {selectedTooth && !readOnly && (
          <span style={{ fontSize: 12, fontWeight: 700, color: T.info }}>
            Selected: Tooth #{selectedTooth} ({CONDITION_COLORS[chart[selectedTooth]?.condition || 'sound'].label})
          </span>
        )}
      </div>

      {renderToothRow(UPPER_TEETH, 'Maxillary Arch (Upper Teeth 1–16)')}
      {renderToothRow(LOWER_TEETH, 'Mandibular Arch (Lower Teeth 32–17)')}

      {/* Condition Selector */}
      {!readOnly && selectedTooth && (
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px dashed ${T.border}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: T.textSub, marginBottom: 6 }}>
            Set Clinical Status for Tooth #{selectedTooth}:
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {(Object.keys(CONDITION_COLORS) as ToothCondition[]).map((cond) => {
              const current = chart[selectedTooth]?.condition === cond;
              const conf = CONDITION_COLORS[cond];
              return (
                <button
                  key={cond}
                  type="button"
                  onClick={() => handleSetCondition(cond)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: T.radius.pill,
                    border: current ? `2px solid ${T.primary}` : `1px solid ${T.border}`,
                    background: conf.bg,
                    color: conf.text,
                    fontSize: 11,
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
    </div>
  );
}