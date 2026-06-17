import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scorePrediction, makeMatchKey, slug } from '../supabase/functions/_shared/scoring.js';

const CFG = { exact_score: 5, correct_gd: 3, correct_outcome: 2, wrong_outcome: 0 };
const score = (p1, p2, a1, a2) => scorePrediction(p1, p2, a1, a2, CFG);

test('§6 example cases', () => {
  assert.equal(score(2, 1, 2, 1), 5, 'exact');
  assert.equal(score(1, 0, 2, 1), 3, 'correct GD, non-draw');
  assert.equal(score(2, 0, 1, 0), 2, 'correct outcome only');
  assert.equal(score(1, 1, 2, 2), 2, 'draw, not exact -> outcome only');
  assert.equal(score(1, 1, 1, 1), 5, 'exact draw');
  assert.equal(score(0, 1, 2, 0), 0, 'wrong outcome');
});

test('draw never reaches the GD tier', () => {
  // predicted draw, actual draw, different scoreline -> outcome only (not GD)
  assert.equal(score(0, 0, 3, 3), 2);
});

test('away-win GD and outcome tiers', () => {
  assert.equal(score(0, 2, 0, 2), 5);  // exact away win
  assert.equal(score(1, 3, 0, 2), 3);  // away win, GD 2 == 2
  assert.equal(score(0, 1, 0, 3), 2);  // away win, GD differs
});

test('config values are respected (tunable)', () => {
  const alt = { exact_score: 10, correct_gd: 6, correct_outcome: 4, wrong_outcome: -1 };
  assert.equal(scorePrediction(2, 1, 2, 1, alt), 10);
  assert.equal(scorePrediction(0, 1, 2, 0, alt), -1);
});

test('makeMatchKey is deterministic and accent/space-insensitive', () => {
  assert.equal(makeMatchKey('2026-06-11', 'Mexico', 'South Africa'),
    '20260611__mexico__southafrica');
  assert.equal(makeMatchKey('2026-06-21', 'Curaçao', 'Côte d’Ivoire'),
    makeMatchKey('2026-06-21', 'Curacao', 'Cote dIvoire'));
  assert.equal(slug('Bosnia & Herzegovina'), 'bosniaherzegovina');
});
