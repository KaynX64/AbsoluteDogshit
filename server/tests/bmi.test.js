// server/tests/bmi.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { getBmiCategory } from '../src/utils/bmi.js';

test('classifies adult BMI thresholds', () => {
  assert.equal(getBmiCategory(18.49), 'Underweight');
  assert.equal(getBmiCategory(18.5), 'Normal');
  assert.equal(getBmiCategory(24.99), 'Normal');
  assert.equal(getBmiCategory(25), 'Overweight');
  assert.equal(getBmiCategory(29.99), 'Overweight');
  assert.equal(getBmiCategory(30), 'Obese');
});

test('returns no category for missing or invalid BMI', () => {
  assert.equal(getBmiCategory(null), null);
  assert.equal(getBmiCategory(''), null);
  assert.equal(getBmiCategory('invalid'), null);
  assert.equal(getBmiCategory(-1), null);
});
