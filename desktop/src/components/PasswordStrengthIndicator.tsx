// desktop/src/components/PasswordStrengthIndicator.tsx
import React from 'react';
import { T } from '../theme';

export interface Requirement {
  id: string;
  label: string;
  met: boolean;
}

export interface PasswordEvaluation {
  score: number;          // 0–4
  label: string;          // 'Very Weak' | 'Weak' | 'Medium' | 'Strong' | 'Very Strong'
  color: string;
  requirements: Requirement[];
  isAcceptable: boolean;  // true when score >= 2 AND all requirements met
}

/**
 * Evaluate a candidate password against the clinic security policy.
 * A password is acceptable only when it satisfies ALL base requirements
 * AND scores at least "Medium".
 */
export function evaluatePassword(pwd: string): PasswordEvaluation {
  const base: PasswordEvaluation = {
    score: 0,
    label: '',
    color: T.textMuted,
    requirements: [],
    isAcceptable: false,
  };
  if (!pwd) return base;

  const hasMinLength = pwd.length >= 8;
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);
  const variety = [hasLower, hasUpper, hasDigit, hasSpecial].filter(Boolean).length;

  let score = 0;
  if (hasMinLength) score++;
  if (pwd.length >= 12) score++;
  if (variety >= 3) score++;
  if (pwd.length >= 14 && variety === 4) score++;

  // Fail-closed: a password that misses the base bar can never exceed Weak.
  if (!hasMinLength || variety < 3) score = Math.min(score, 1);
  score = Math.min(score, 4);

  const requirements: Requirement[] = [
    { id: 'length', label: 'At least 8 characters', met: hasMinLength },
    { id: 'upper', label: 'One uppercase letter (A–Z)', met: hasUpper },
    { id: 'lower', label: 'One lowercase letter (a–z)', met: hasLower },
    { id: 'digit', label: 'One number (0–9)', met: hasDigit },
    { id: 'special', label: 'One symbol (!@#$%^&*…)', met: hasSpecial },
  ];

  const color =
    score >= 4 ? '#15803D'
    : score === 3 ? '#2563EB'
    : score === 2 ? '#D97706'
    : '#DC2626';

  const label =
    score === 4 ? 'Very Strong'
    : score === 3 ? 'Strong'
    : score === 2 ? 'Medium'
    : score === 1 ? 'Weak'
    : 'Very Weak';

  const isAcceptable = score >= 2 && requirements.every((r) => r.met);

  return { score, label, color, requirements, isAcceptable };
}

interface Props {
  password: string;
  /** Optional: hide the checklist if you only want the bar (unused for now). */
  showChecklist?: boolean;
}

export default function PasswordStrengthIndicator({ password, showChecklist = true }: Props) {
  if (!password) return null;
  const { score, label, color, requirements, isAcceptable } = evaluatePassword(password);

  return (
    <div style={{ marginTop: 8, marginBottom: 4 }}>
      {/* Segmented strength bar */}
      <div style={{ display: 'flex', gap: 4, height: 4, marginBottom: 6 }}>
        {[1, 2, 3, 4].map((step) => (
          <div
            key={step}
            style={{
              flex: 1,
              height: '100%',
              borderRadius: 2,
              background: step <= score ? color : '#E2EBE1',
              transition: 'background 180ms ease',
            }}
          />
        ))}
      </div>

      {/* Label row */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'baseline',
          fontSize: 11,
          marginBottom: 10,
          gap: 8,
        }}
      >
        <span style={{ fontWeight: 700, color }}>
          Strength: {label}
        </span>
        <span
          style={{
            fontWeight: 700,
            color: isAcceptable ? T.success : T.danger,
            fontSize: 10.5,
            letterSpacing: 0.2,
          }}
        >
          {isAcceptable ? '✓ Meets requirements' : '✕ Must be Medium or better'}
        </span>
      </div>

      {/* Requirements checklist */}
      {showChecklist && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '6px 14px',
            padding: '10px 12px',
            background: T.sage50,
            borderRadius: T.radius.md,
            border: `1px solid ${T.borderSoft}`,
          }}
        >
          {requirements.map((r) => (
            <div
              key={r.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 11.5,
                fontWeight: 600,
                color: r.met ? T.success : T.textMuted,
                transition: 'color 120ms ease',
              }}
            >
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: '50%',
                  display: 'grid',
                  placeItems: 'center',
                  background: r.met ? T.successSoft : T.sage100,
                  color: r.met ? T.success : T.textMuted,
                  fontSize: 9,
                  fontWeight: 900,
                  border: `1px solid ${r.met ? T.successBorder : T.border}`,
                  flexShrink: 0,
                }}
              >
                {r.met ? '✓' : ''}
              </span>
              {r.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}