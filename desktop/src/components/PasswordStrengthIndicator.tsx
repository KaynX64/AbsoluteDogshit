// desktop/src/components/PasswordStrengthIndicator.tsx
import React from 'react';
import { T } from '../theme';

interface Props {
  password: string;
}

export function evaluatePassword(pwd: string): {
  score: number;
  label: string;
  color: string;
} {
  if (!pwd) return { score: 0, label: '', color: T.textMuted };

  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;

  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd);

  const variety = (hasLower ? 1 : 0) + (hasUpper ? 1 : 0) + (hasDigit ? 1 : 0) + (hasSpecial ? 1 : 0);
  if (variety >= 3) score++;
  if (pwd.length >= 14 && variety === 4) score++;

  score = Math.min(score, 4);

  switch (score) {
    case 1:
      return { score: 1, label: 'Weak', color: '#DC2626' };
    case 2:
      return { score: 2, label: 'Fair', color: '#D97706' };
    case 3:
      return { score: 3, label: 'Strong', color: '#2563EB' };
    case 4:
      return { score: 4, label: 'Very Strong', color: '#15803D' };
    default:
      return { score: 0, label: 'Too Short', color: '#DC2626' };
  }
}

export default function PasswordStrengthIndicator({ password }: Props) {
  if (!password) return null;

  const { score, label, color } = evaluatePassword(password);

  return (
    <div style={{ marginTop: 8 }}>
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
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
        <span style={{ fontWeight: 700, color }}>Strength: {label}</span>
        <span style={{ color: T.textSub }}>All symbols & spaces allowed</span>
      </div>
    </div>
  );
}