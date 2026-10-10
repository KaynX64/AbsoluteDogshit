// server/src/utils/passwordPolicy.js

/**
 * Common trivial passwords to block outright.
 */
const COMMON_BLACKLIST = new Set([
  'password',
  'valetudo',
  'valetudo123',
  'psulingayen',
  'infirmary123',
  '12345678',
  '123456789',
  'qwertyuiop',
]);

/**
 * Calculates a score from 0 to 4 and returns feedback.
 */
export function evaluatePasswordStrength(password, userContext = {}) {
  const pwd = String(password || '');
  const issues = [];
  let score = 0;

  if (pwd.length < 8) {
    return {
      score: 0,
      label: 'Too Short',
      isValid: false,
      issues: ['Password must be at least 8 characters long.'],
    };
  }

  // Check against common passwords
  if (COMMON_BLACKLIST.has(pwd.toLowerCase())) {
    return {
      score: 0,
      label: 'Very Weak',
      isValid: false,
      issues: ['This password is too common and easily guessable.'],
    };
  }

  // Check personal identifiers
  const { email, firstName, lastName, studentNo } = userContext;
  const lowerPwd = pwd.toLowerCase();

  if (email) {
    const handle = email.split('@')[0].toLowerCase();
    if (handle.length > 3 && lowerPwd.includes(handle)) {
      issues.push('Password should not contain your email address.');
    }
  }
  if (firstName && firstName.length > 2 && lowerPwd.includes(firstName.toLowerCase())) {
    issues.push('Password should not contain your name.');
  }
  if (lastName && lastName.length > 2 && lowerPwd.includes(lastName.toLowerCase())) {
    issues.push('Password should not contain your name.');
  }
  if (studentNo && lowerPwd.includes(studentNo.toLowerCase())) {
    issues.push('Password should not contain your student/employee ID.');
  }

  // Scoring factors
  const hasLower = /[a-z]/.test(pwd);
  const hasUpper = /[A-Z]/.test(pwd);
  const hasDigit = /[0-9]/.test(pwd);
  const hasSpecial = /[^A-Za-z0-9]/.test(pwd); // Any non-alphanumeric (all symbols/spaces)

  let varietyCount = 0;
  if (hasLower) varietyCount++;
  if (hasUpper) varietyCount++;
  if (hasDigit) varietyCount++;
  if (hasSpecial) varietyCount++;

  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (varietyCount >= 3) score++;
  if (pwd.length >= 14 && varietyCount >= 4) score++;

  if (issues.length > 0) {
    score = Math.min(score, 1);
  }

  const labels = ['Very Weak', 'Weak', 'Fair', 'Strong', 'Very Strong'];

  return {
    score,
    label: labels[score] || 'Fair',
    isValid: score >= 2 && issues.length === 0,
    issues,
  };
}