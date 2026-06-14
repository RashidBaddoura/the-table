import { SCORING, STAGE_ORDER } from './config.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function normalize(str) {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip combining diacritical marks
    .replace(/\band\b/g, '')            // "Bosnia and Herzegovina" → "bosniaherzegovina"
    .replace(/[^a-z0-9]/g, '');        // strip non-alphanumeric
}

// Maps dataset round names → SCORING.progression keys.
// Dataset knockout rounds: "Round of 32", "Round of 16",
// "Quarter-final", "Semi-final", "Match for third place", "Final"
function getKnockoutStage(round) {
  const r = round.toLowerCase();
  if (r.includes('round of 32'))                       return 'Round of 32';
  if (r.includes('round of 16'))                       return 'Round of 16';
  if (r.includes('quarter'))                           return 'Quarterfinals';
  if (r.includes('semi'))                              return 'Semifinals';
  if (r.includes('third') || r.includes('3rd'))        return null; // skip 3rd place
  if (r.includes('final'))                             return 'Final';
  return null;
}

// Parse "HH:MM UTC±N" → UTC Date object.
export function parseMatchTime(date, timeStr) {
  const m = timeStr.match(/^(\d{1,2}):(\d{2})\s+UTC([+-])(\d+)/);
  if (!m) return null;
  const [, h, min, sign, off] = m;
  const localMin  = parseInt(h) * 60 + parseInt(min);
  const offsetMin = parseInt(off) * 60 * (sign === '+' ? 1 : -1);
  const utcMin    = ((localMin - offsetMin) % 1440 + 1440) % 1440;
  const utcH = Math.floor(utcMin / 60);
  const utcM = utcMin % 60;
  return new Date(
    `${date}T${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}:00Z`
  );
}

// Determine match winner from available score fields.
// Returns 1 (team1 wins), 2 (team2 wins), or 0 (no result / draw).
function getMatchWinner(match) {
  for (const key of ['p', 'et', 'ft']) {
    const s = match.score?.[key];
    if (s) {
      if (s[0] > s[1]) return 1;
      if (s[1] > s[0]) return 2;
    }
  }
  return 0;
}

// ─── Core computation ─────────────────────────────────────────────────────────

export function computeStats(matches) {
  // Collect all real team names from group-stage matches
  // (group-stage matches have a `group` field; knockout ones don't).
  const realTeamNames = new Set();
  for (const m of matches) {
    if (m.group !== undefined) {
      if (m.team1) realTeamNames.add(m.team1);
      if (m.team2) realTeamNames.add(m.team2);
    }
  }

  // Normalised-name → canonical-name lookup (for roster matching).
  const normToName = new Map();
  for (const name of realTeamNames) normToName.set(normalize(name), name);

  // Initialise per-team stat record.
  const stats = new Map();
  for (const name of realTeamNames) {
    stats.set(name, {
      name,
      groupWins: 0, groupDraws: 0, groupLosses: 0,
      goalsFor: 0, goalsAgainst: 0,
      stagesReached: new Set(),
      isChampion: false,
      isEliminated: false,
      groupPoints: 0, progressionPoints: 0, totalPoints: 0,
    });
  }

  function getStat(teamName) {
    if (stats.has(teamName)) return stats.get(teamName);
    const c = normToName.get(normalize(teamName));
    return c ? stats.get(c) : null;
  }

  // ── Group stage ─────────────────────────────────────────────────────────────
  for (const m of matches) {
    if (m.group === undefined || !m.score?.ft) continue;
    const [g1, g2] = m.score.ft;
    const s1 = getStat(m.team1);
    const s2 = getStat(m.team2);
    if (!s1 || !s2) continue;

    s1.goalsFor += g1; s1.goalsAgainst += g2;
    s2.goalsFor += g2; s2.goalsAgainst += g1;

    if (g1 > g2)      { s1.groupWins++;   s2.groupLosses++; }
    else if (g1 < g2) { s1.groupLosses++; s2.groupWins++;   }
    else              { s1.groupDraws++;   s2.groupDraws++;  }
  }

  // ── Knockout stages ──────────────────────────────────────────────────────────
  for (const m of matches) {
    if (m.group !== undefined) continue;  // skip group stage
    const stage = getKnockoutStage(m.round);
    if (!stage) continue;                 // e.g. third-place match

    // Award progression bonus when a real team appears in this round.
    for (const teamName of [m.team1, m.team2]) {
      if (!teamName || !realTeamNames.has(teamName)) continue;
      const s = getStat(teamName);
      if (s) s.stagesReached.add(stage);
    }

    // For completed matches: mark loser eliminated, detect champion.
    if (m.score?.ft) {
      const winner = getMatchWinner(m);
      const loserName = winner === 1 ? m.team2 : winner === 2 ? m.team1 : null;
      if (loserName && realTeamNames.has(loserName)) {
        const s = getStat(loserName);
        if (s) s.isEliminated = true;
      }
      if (stage === 'Final') {
        const champName = winner === 1 ? m.team1 : winner === 2 ? m.team2 : null;
        if (champName && realTeamNames.has(champName)) {
          const s = getStat(champName);
          if (s) s.isChampion = true;
        }
      }
    }
  }

  // ── Group-stage elimination ───────────────────────────────────────────────────
  // Once any Round of 32 match has real team names, teams absent from R32 are out.
  const r32Teams = new Set();
  for (const m of matches) {
    if (getKnockoutStage(m.round) === 'Round of 32') {
      if (realTeamNames.has(m.team1)) r32Teams.add(m.team1);
      if (realTeamNames.has(m.team2)) r32Teams.add(m.team2);
    }
  }
  if (r32Teams.size > 0) {
    for (const [name, s] of stats) {
      if (!r32Teams.has(name) && s.stagesReached.size === 0) {
        s.isEliminated = true;
      }
    }
  }

  // ── Point totals ──────────────────────────────────────────────────────────────
  for (const s of stats.values()) {
    s.groupPoints = s.groupWins  * SCORING.group.win
                  + s.groupDraws * SCORING.group.draw
                  + s.groupLosses * SCORING.group.loss;

    s.progressionPoints = [...s.stagesReached]
      .reduce((sum, stage) => sum + (SCORING.progression[stage] || 0), 0);
    if (s.isChampion) s.progressionPoints += SCORING.progression.Champion;

    s.totalPoints = s.groupPoints + s.progressionPoints;
  }

  return { stats, realTeamNames, normToName };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function computeLeaderboard(matches, roster) {
  const { stats, realTeamNames, normToName } = computeStats(matches);

  // Log name mismatches at load time so they're immediately visible in the console.
  for (const [person, teams] of Object.entries(roster)) {
    for (const teamName of teams) {
      if (!normToName.has(normalize(teamName))) {
        console.warn(
          `[ROSTER MISMATCH] ${person}'s team "${teamName}" not found in dataset`
        );
      }
    }
  }

  const empty = (name) => ({
    name, groupWins: 0, groupDraws: 0, groupLosses: 0,
    goalsFor: 0, goalsAgainst: 0,
    stagesReached: new Set(), isChampion: false, isEliminated: false,
    groupPoints: 0, progressionPoints: 0, totalPoints: 0,
  });

  const leaderboard = Object.entries(roster).map(([person, teams]) => {
    const personTeams = teams.map((teamName) => {
      const canonical = normToName.get(normalize(teamName));
      return (canonical && stats.get(canonical)) || empty(teamName);
    });

    const totalPoints = personTeams.reduce((s, t) => s + t.totalPoints, 0);
    const goalsFor    = personTeams.reduce((s, t) => s + t.goalsFor, 0);
    const goalDiff    = personTeams.reduce((s, t) => s + (t.goalsFor - t.goalsAgainst), 0);
    const teamsAlive  = personTeams.filter((t) => !t.isEliminated).length;

    return { person, teams: personTeams, totalPoints, goalsFor, goalDiff, teamsAlive };
  });

  leaderboard.sort((a, b) => {
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    if (b.goalsFor    !== a.goalsFor)    return b.goalsFor    - a.goalsFor;
    if (b.goalDiff    !== a.goalDiff)    return b.goalDiff    - a.goalDiff;
    return b.teamsAlive - a.teamsAlive;
  });

  return { leaderboard, stats, realTeamNames, normToName };
}

// ─── Owner lookup ─────────────────────────────────────────────────────────────

export function buildOwnerMap(roster) {
  const map = new Map(); // normalised team name → person
  for (const [person, teams] of Object.entries(roster)) {
    for (const t of teams) map.set(normalize(t), person);
  }
  return map;
}
