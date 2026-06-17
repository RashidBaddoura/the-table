import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isLocked, msUntilLock, formatCountdown } from '../js/lock.js';

// is_locked mirror: locked once now >= kickoff - lock_minutes.
const KICK = '2026-06-20T18:00:00.000Z';
const LOCK = 60; // minutes
const lockAt = Date.parse('2026-06-20T17:00:00.000Z');

test('not locked just before the lock window', () => {
  assert.equal(isLocked(KICK, LOCK, lockAt - 60_000), false); // 61 min before kickoff
});

test('locked exactly at the lock moment (>=)', () => {
  assert.equal(isLocked(KICK, LOCK, lockAt), true);
});

test('locked after the lock moment', () => {
  assert.equal(isLocked(KICK, LOCK, lockAt + 60_000), true); // 59 min before kickoff
});

test('msUntilLock counts down to the lock moment, not kickoff', () => {
  assert.equal(msUntilLock(KICK, LOCK, lockAt - 5 * 60_000), 5 * 60_000);
  assert.ok(msUntilLock(KICK, LOCK, lockAt + 1000) < 0);
});

test('formatCountdown shapes', () => {
  assert.equal(formatCountdown(-1), 'locked');
  assert.equal(formatCountdown(2 * 86400_000 + 4 * 3600_000), '2d 4h');
  assert.equal(formatCountdown(3 * 3600_000 + 12 * 60_000), '3h 12m');
  assert.equal(formatCountdown(8 * 60_000 + 4_000), '8m 04s');
});
