#!/usr/bin/env node
const data = require('../data/worldcup.json');

const ROSTER = {
  sudais:  ['South Korea', 'Bosnia & Herzegovina', 'Spain'],
  zeina:   ['Ecuador', 'Australia', 'Netherlands'],
  aboud:   ['Brazil', 'Egypt', 'Ivory Coast'],
  AK:      ['USA', 'Czech Republic', 'Argentina'],
  Rashid:  ['Mexico', 'Tunisia', 'Jordan'],
  enoch:   ['South Africa', 'Colombia', 'New Zealand'],
  imron:   ['Paraguay', 'Switzerland', 'Turkey'],
  jana:    ['Canada', 'France', 'Panama'],
  malak:   ['Algeria', 'Belgium', 'Senegal'],
  mikal:   ['Uruguay', 'Germany', 'Qatar'],
  maryam:  ['Uzbekistan', 'Morocco', 'Iran'],
  saja:    ['Japan', 'Curaçao', 'England'],
  sheen:   ['Saudi Arabia', 'Portugal', 'Haiti'],
  ren:     ['Croatia', 'Norway', 'Iraq'],
};
const SCORING = {
  group: { win: 3, draw: 1, loss: 0 },
  progression: { 'Round of 32': 4, 'Round of 16': 6, 'Quarterfinals': 9, 'Semifinals': 13, 'Final': 18, 'Champion': 25 },
};

function norm(s) {
  return s.toLowerCase().normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\band\b/g, '')
    .replace(/[^a-z0-9]/g, '');
}
function getKOStage(r) {
  const s = r.toLowerCase();
  if (s.includes('round of 32')) return 'Round of 32';
  if (s.includes('round of 16')) return 'Round of 16';
  if (s.includes('quarter'))     return 'Quarterfinals';
  if (s.includes('semi'))        return 'Semifinals';
  if (s.includes('third') || s.includes('3rd')) return null;
  if (s.includes('final'))       return 'Final';
  return null;
}
function matchWinner(m) {
  for (const k of ['p', 'et', 'ft']) {
    const s = m.score?.[k];
    if (s) { if (s[0] > s[1]) return 1; if (s[1] > s[0]) return 2; }
  }
  return 0;
}

const matches = data.matches;

// Collect real team names from group stage
const real = new Set();
for (const m of matches) if (m.group !== undefined) { real.add(m.team1); real.add(m.team2); }
const normMap = new Map();
for (const n of real) normMap.set(norm(n), n);

// Init stats
const stats = new Map();
for (const n of real) stats.set(n, { name: n, gw: 0, gd: 0, gl: 0, gf: 0, ga: 0, stages: new Set(), champ: false, elim: false });
function gs(t) { return stats.get(t) || stats.get(normMap.get(norm(t))); }

// Group stage results
for (const m of matches) {
  if (m.group === undefined || !m.score?.ft) continue;
  const [g1, g2] = m.score.ft;
  const s1 = gs(m.team1), s2 = gs(m.team2);
  if (!s1 || !s2) continue;
  s1.gf += g1; s1.ga += g2; s2.gf += g2; s2.ga += g1;
  if (g1 > g2)      { s1.gw++; s2.gl++; }
  else if (g1 < g2) { s1.gl++; s2.gw++; }
  else              { s1.gd++; s2.gd++; }
}

// Knockout
for (const m of matches) {
  if (m.group !== undefined) continue;
  const stage = getKOStage(m.round);
  if (!stage) continue;
  for (const t of [m.team1, m.team2]) { if (real.has(t)) { const s = gs(t); if (s) s.stages.add(stage); } }
  if (m.score?.ft) {
    const w = matchWinner(m);
    const loser = w === 1 ? m.team2 : w === 2 ? m.team1 : null;
    if (loser && real.has(loser)) { const s = gs(loser); if (s) s.elim = true; }
    if (stage === 'Final') {
      const champ = w === 1 ? m.team1 : w === 2 ? m.team2 : null;
      if (champ && real.has(champ)) { const s = gs(champ); if (s) s.champ = true; }
    }
  }
}

// Group-stage elimination (if R32 has started)
const r32 = new Set();
for (const m of matches) if (getKOStage(m.round) === 'Round of 32') { if (real.has(m.team1)) r32.add(m.team1); if (real.has(m.team2)) r32.add(m.team2); }
if (r32.size > 0) {
  for (const [n, s] of stats) if (!r32.has(n) && s.stages.size === 0) s.elim = true;
}

// Point totals
for (const s of stats.values()) {
  s.grpPts  = s.gw * SCORING.group.win + s.gd * SCORING.group.draw + s.gl * SCORING.group.loss;
  s.progPts = [...s.stages].reduce((a, k) => a + (SCORING.progression[k] || 0), 0);
  if (s.champ) s.progPts += SCORING.progression.Champion;
  s.total = s.grpPts + s.progPts;
}

// Leaderboard
const lb = Object.entries(ROSTER).map(([person, teams]) => {
  const ts = teams.map((t) => {
    const canonical = normMap.get(norm(t));
    return (canonical && stats.get(canonical)) || { name: t, gw:0,gd:0,gl:0,gf:0,ga:0,stages:new Set(),champ:false,elim:false,grpPts:0,progPts:0,total:0 };
  });
  return {
    person, teams: ts,
    pts:   ts.reduce((a, t) => a + t.total, 0),
    gf:    ts.reduce((a, t) => a + t.gf, 0),
    gd:    ts.reduce((a, t) => a + (t.gf - t.ga), 0),
    alive: ts.filter((t) => !t.elim).length,
  };
}).sort((a, b) => b.pts - a.pts || b.gf - a.gf || b.gd - a.gd || b.alive - a.alive);

console.log('\n=== THE TABLE — Current Standings ===\n');
console.log('  #  Player    Pts   GF   GD  Alive  Teams');
console.log('-'.repeat(80));
lb.forEach(({ person, pts, gf, gd, alive, teams }, i) => {
  const gdStr = gd >= 0 ? '+' + gd : String(gd);
  const teamStr = teams.map((t) => {
    const status = t.champ ? '🏆' : t.elim ? '✗' : '✓';
    const stage  = t.stages.size ? ' [' + [...t.stages].join('/') + ']' : '';
    return t.name + '(' + t.total + ' ' + status + stage + ')';
  }).join(', ');
  console.log(
    String(i + 1).padStart(3) + '. ' +
    person.padEnd(10) +
    String(pts).padStart(4) + '  ' +
    String(gf).padStart(4) + ' ' +
    gdStr.padStart(5) + '   ' +
    alive + '/3  ' +
    teamStr
  );
});

// Show played matches
const played = matches.filter((m) => m.score?.ft);
console.log('\n=== Played matches (' + played.length + ') ===');
for (const m of played) {
  const s = m.score.ft;
  const grp = m.group || m.round;
  console.log('  [' + grp + '] ' + m.date + '  ' + m.team1 + ' ' + s[0] + '-' + s[1] + ' ' + m.team2);
}

// Check roster mismatches
console.log('\n=== Roster check ===');
let ok = true;
for (const [person, teams] of Object.entries(ROSTER)) {
  for (const t of teams) {
    if (!normMap.has(norm(t))) {
      console.warn('  MISMATCH: ' + person + ' -> "' + t + '" not in dataset');
      ok = false;
    }
  }
}
if (ok) console.log('  All roster names match the dataset. ✓');
