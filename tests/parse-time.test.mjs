import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseKickoffUtc } from '../supabase/functions/_shared/parse-time.js';

const iso = (d, t) => parseKickoffUtc(d, t).toISOString();

test('basic UTC-6 conversion', () => {
  assert.equal(iso('2026-06-11', '13:00 UTC-6'), '2026-06-11T19:00:00.000Z');
});

test('crosses midnight forward (UTC-6 late kickoff)', () => {
  // 20:00 local UTC-6 -> 02:00 next-day UTC
  assert.equal(iso('2026-06-25', '20:00 UTC-6'), '2026-06-26T02:00:00.000Z');
});

test('crosses midnight backward (UTC+ large offset, early kickoff)', () => {
  // 01:00 local UTC+13 -> 12:00 PREVIOUS day UTC
  assert.equal(iso('2026-06-10', '01:00 UTC+13'), '2026-06-09T12:00:00.000Z');
});

test('UTC+3 (no day change)', () => {
  assert.equal(iso('2026-07-01', '18:30 UTC+3'), '2026-07-01T15:30:00.000Z');
});

test('UTC-7 knockout sample', () => {
  assert.equal(iso('2026-06-28', '12:00 UTC-7'), '2026-06-28T19:00:00.000Z');
});

test('malformed time returns null', () => {
  assert.equal(parseKickoffUtc('2026-06-11', 'TBD'), null);
  assert.equal(parseKickoffUtc('2026-06-11', '13:00'), null);
});
