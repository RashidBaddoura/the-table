import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildMatchRows, stageOf, matchKeyFor } from '../supabase/functions/_shared/ingest.js';

const data = JSON.parse(readFileSync(new URL('../data/worldcup.json', import.meta.url), 'utf8'));

test('builds a row per timed fixture with valid keys & kickoffs', () => {
  const rows = buildMatchRows(data.matches);
  assert.ok(rows.length >= 100, `expected ~104 rows, got ${rows.length}`);
  // keys unique
  assert.equal(new Set(rows.map((r) => r.match_key)).size, rows.length);
  // every row has a parseable ISO kickoff
  for (const r of rows) assert.ok(!Number.isNaN(Date.parse(r.kickoff_utc)));
});

test('stage mapping', () => {
  assert.equal(stageOf('Matchday 3'), 'group');
  assert.equal(stageOf('Round of 32'), 'r32');
  assert.equal(stageOf('Round of 16'), 'r16');
  assert.equal(stageOf('Quarter-final'), 'qf');
  assert.equal(stageOf('Semi-final'), 'sf');
  assert.equal(stageOf('Match for third place'), 'third_place');
  assert.equal(stageOf('Final'), 'final');
});

test('knockout keyed by num (resolution-stable); group keyed by teams', () => {
  assert.equal(matchKeyFor({ num: 73, date: '2026-06-28', team1: '2A', team2: '2B' }), 'ko73');
  assert.equal(matchKeyFor({ date: '2026-06-11', team1: 'Mexico', team2: 'South Africa' }),
    '20260611__mexico__southafrica');
});

test('group fixtures are predictable; placeholder knockouts are not', () => {
  const rows = buildMatchRows(data.matches);
  const byKey = new Map(rows.map((r) => [r.match_key, r]));
  const mex = byKey.get('20260611__mexico__southafrica');
  assert.ok(mex && mex.predictable, 'group fixture should be predictable');
  const ko = byKey.get('ko73'); // teams are placeholders "2A"/"2B" in the snapshot
  if (ko) assert.equal(ko.predictable, false, 'placeholder knockout not predictable');
});

test('finished fixtures carry ft + finished status', () => {
  const rows = buildMatchRows(data.matches);
  const mex = rows.find((r) => r.match_key === '20260611__mexico__southafrica');
  assert.equal(mex.status, 'finished');
  assert.deepEqual([mex.ft_team1, mex.ft_team2], [2, 0]);
});
