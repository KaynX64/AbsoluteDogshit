// Classifies a valid BMI value for display and handles missing or invalid values.
// server/src/utils/bmi.js
export function getBmiCategory(bmi) {
  const value = Number(bmi);
  if (!Number.isFinite(value) || value <= 0) return null;
  if (value < 18.5) return 'Underweight';
  if (value < 25) return 'Normal';
  if (value < 30) return 'Overweight';
  return 'Obese';
}
