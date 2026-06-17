// Shared openfootball → matches-rows builder. Used by BOTH the ingest Edge
// Function (Deno) and scripts/sync-supabase.mjs (Node/GitHub Action), and
// unit-tested against the committed snapshot. Pure + dependency-free.

import { parseKickoffIso } from './parse-time.js';
import { makeMatchKey, slug } from './scoring.js';

export function stageOf(round) {
  const r = String(round).toLowerCase();
  if (r.startsWith('matchday'))    return 'group';
  if (r.includes('round of 32'))   return 'r32';
  if (r.includes('round of 16'))   return 'r16';
  if (r.includes('quarter'))       return 'qf';
  if (r.includes('semi'))          return 'sf';
  if (r.includes('third') || r.includes('3rd')) return 'third_place';
  if (r.includes('final'))         return 'final';
  return 'group';
}

// Stable PK: group fixtures have fixed teams (team-based key is stable). Knockout
// fixtures change teams as the bracket resolves, so key them by openfootball's
// fixture `num` (73..104), which never changes.
export function matchKeyFor(m) {
  if (m.num != null) return `ko${m.num}`;
  return makeMatchKey(m.date, m.team1, m.team2);
}

// Turn the openfootball `matches` array into rows ready to upsert into
// public.matches. `predictable` = both slots hold one of the 48 real teams.
export function buildMatchRows(matches, now = Date.now()) {
  const real = new Set();
  for (const m of matches) {
    if (m.group !== undefined) { real.add(slug(m.team1)); real.add(slug(m.team2)); }
  }
  const isReal = (name) => name != null && real.has(slug(name));

  return matches.map((m) => {
    const ft = m.score?.ft;
    const finished = Array.isArray(ft);
    const kickoff = parseKickoffIso(m.date, m.time);
    const started = kickoff && Date.parse(kickoff) <= now;
    return {
      match_key:   matchKeyFor(m),
      stage:       stageOf(m.round),
      group_label: m.group ?? null,
      team1:       m.team1,
      team2:       m.team2,
      predictable: isReal(m.team1) && isReal(m.team2),
      kickoff_utc: kickoff,
      status:      finished ? 'finished' : started ? 'live' : 'scheduled',
      ft_team1:    finished ? ft[0] : null,
      ft_team2:    finished ? ft[1] : null,
      updated_at:  new Date().toISOString(),
    };
  }).filter((r) => r.kickoff_utc);
}
