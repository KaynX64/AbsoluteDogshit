// desktop/src/components/InteractionWarning.tsx
//
// Displays drug-drug interaction warnings inside the prescription form.
// Shows a color-coded card for each interaction found.

import React from 'react';
import { T } from '../theme';
import Icon from './Icon';
import { SEVERITY_CONFIG, type DrugInteraction } from '../services/interactionService';

interface InteractionWarningProps {
  interactions: DrugInteraction[];
  blocking: boolean;
  onDismiss?: () => void;
}

export default function InteractionWarning({
  interactions,
  blocking,
  onDismiss,
}: InteractionWarningProps) {
  if (!interactions || interactions.length === 0) return null;

  return (
    <div
      style={{
        marginTop: 14,
        borderRadius: T.radius.md,
        border: `2px solid ${blocking ? T.dangerBorder : T.warningBorder}`,
        overflow: 'hidden',
      }}
    >
      {/* Header bar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          padding: '12px 18px',
          background: blocking ? T.danger : T.warning,
          color: blocking ? T.textOnDanger : T.textOnWarning,
        }}
      >
        <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: 0.3, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {blocking
            ? (<><Icon name="block" size={18} fill /> CONTRAINDICATED — Cannot issue this prescription</>)
            : (<><Icon name="warning" size={18} fill /> {interactions.length} Drug Interaction{interactions.length > 1 ? 's' : ''} Detected</>)}
        </span>
        {onDismiss && !blocking && (
          <button
            type="button"
            onClick={onDismiss}
            style={{
              background: 'rgba(15,30,23,0.12)',
              border: '1px solid rgba(15,30,23,0.24)',
              color: 'inherit',
              borderRadius: T.radius.pill,
              padding: '4px 12px',
              fontSize: 11,
              cursor: 'pointer',
              fontWeight: 700,
              transition: `background ${T.durBase} ${T.ease}`,
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(15,30,23,0.20)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'rgba(15,30,23,0.12)')}
          >
            Dismiss
          </button>
        )}
      </div>

      {/* Interaction cards */}
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {interactions.map((interaction) => {
          const severity = interaction.severity;
          const baseCfg = SEVERITY_CONFIG[severity] || SEVERITY_CONFIG.mild;
          const cfg = {
            ...baseCfg,
            ...(severity === 'contraindicated' || severity === 'severe'
              ? { bg: T.dangerSoft, color: T.danger, border: T.dangerBorder, onColor: T.textOnDanger }
              : severity === 'moderate'
              ? { bg: T.warningSoft, color: T.warning, border: T.warningBorder, onColor: T.textOnWarning }
              : { bg: T.infoSoft, color: T.info, border: T.infoBorder, onColor: T.textOnInfo }),
          };
          return (
            <div
              key={interaction.interaction_id}
              style={{
                padding: '14px 16px',
                background: cfg.bg,
                borderBottom: `1px solid ${cfg.border}`,
              }}
            >
              {/* Drug pair + severity badge */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 13,
                    fontWeight: 800,
                    color: cfg.color,
                  }}
                >
                  <Icon name={cfg.icon} size={16} fill /> {interaction.medicine_a.name} ↔{' '}
                  {interaction.medicine_b.name}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: 0.5,
                    padding: '2px 8px',
                    borderRadius: T.radius.pill,
                    background: cfg.color,
                    color: cfg.onColor,
                    textTransform: 'uppercase',
                  }}
                >
                  {cfg.label}
                </span>
              </div>

              {/* Description */}
              <p
                style={{
                  margin: '0 0 8px',
                  fontSize: 12,
                  color: cfg.color,
                  lineHeight: 1.5,
                }}
              >
                {interaction.description}
              </p>

              {/* Recommendation */}
              {interaction.recommendation && (
                <div
                  style={{
                    padding: '8px 12px',
                    background: 'rgba(255,255,255,0.6)',
                    borderRadius: T.radius.xs,
                    fontSize: 11.5,
                    color: cfg.color,
                    lineHeight: 1.45,
                  }}
                >
                  <b>Recommendation:</b> {interaction.recommendation}
                </div>
              )}

              {/* Source */}
              {interaction.source && (
                <div
                  style={{
                    marginTop: 6,
                    fontSize: 10,
                    color: cfg.color,
                    opacity: 0.7,
                    fontStyle: 'italic',
                  }}
                >
                  Source: {interaction.source}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}