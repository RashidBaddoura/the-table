import { SCORING, STAGE_ORDER, PERSON_COLORS, ROSTER } from './config.js';
import { normalize, parseMatchTime } from './scoring.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function lc(s) { return String(s).toLowerCase(); }
function fmtSign(n) { return n > 0 ? '+' + n : String(n); }

// ─── Qatar timezone helpers (UTC+3, no label shown) ───────────────────────────

const QATAR_TZ = 'Asia/Qatar';

function fmtQatarTime(dt) {
  return dt.toLocaleTimeString('en-US', {
    timeZone: QATAR_TZ, hour: 'numeric', minute: '2-digit', hour12: true,
  });
}

function toQatarDateKey(dt) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: QATAR_TZ }).format(dt);
}

function qatarDateLabel(dt) {
  const key       = toQatarDateKey(dt);
  const today     = toQatarDateKey(new Date());
  const yesterday = toQatarDateKey(new Date(Date.now() - 86400000));
  const tomorrow  = toQatarDateKey(new Date(Date.now() + 86400000));
  if (key === yesterday) return 'Yesterday';
  if (key === today)     return 'Today';
  if (key === tomorrow)  return 'Tomorrow';
  return dt.toLocaleDateString('en-US', {
    timeZone: QATAR_TZ, weekday: 'short', month: 'short', day: 'numeric',
  });
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function avatarEl(person, size = 34) {
  const color = PERSON_COLORS[person] || '#6b7280';
  const init  = person[0].toUpperCase();
  const slug  = person.toLowerCase();
  const redCls = person === 'zeina' ? ' av-img--red' : '';
  // onerror cycles jpg → jpeg → png → webp, then falls back to initials
  const onErr = `(function(i){var e=['jpeg','png','webp'],n=+(i.dataset.n||0);if(n<e.length){i.dataset.n=n+1;i.src='pfps/${slug}.'+e[n];}else{i.style.display='none';i.nextElementSibling.style.display='flex';}})(this)`;
  return `<span class="av-wrap" style="--av-sz:${size}px;--av-c:${color}">` +
    `<img class="av-img${redCls}" src="pfps/${slug}.jpg" data-n="0" onerror="${onErr}" alt="">` +
    `<span class="av-init">${init}</span>` +
    `</span>`;
}

// ─── Stage helpers ────────────────────────────────────────────────────────────

function stageLabel(stageName) {
  const map = {
    'Round of 32':   'R32',
    'Round of 16':   'R16',
    'Quarterfinals': 'QF',
    'Semifinals':    'SF',
    'Final':         'Final',
  };
  return map[stageName] || stageName;
}

function stageBadge(t) {
  if (t.isChampion)   return '<span class="stage champion">Champion</span>';
  if (t.isEliminated) return '<span class="stage elim">Out</span>';
  const last = STAGE_ORDER.slice().reverse().find((s) => t.stagesReached.has(s));
  if (last) return `<span class="stage reached" data-stage="${esc(last)}">${esc(stageLabel(last))}</span>`;
  return '<span class="stage group">Groups</span>';
}

function ptsBreakdown(t) {
  const parts = [];
  if (t.groupPoints) parts.push(`+${t.groupPoints} group`);
  for (const s of STAGE_ORDER.filter((k) => t.stagesReached.has(k))) {
    parts.push(`+${SCORING.progression[s]} ${stageLabel(s)}`);
  }
  if (t.isChampion) parts.push(`+${SCORING.progression.Champion} champion`);
  return parts.join('  ·  ') || '—';
}

// ─── Match state ──────────────────────────────────────────────────────────────

function matchState(m, now) {
  if (m.score?.ft) return 'done';
  const dt = m.time ? parseMatchTime(m.date, m.time) : null;
  if (!dt) return 'upcoming';
  const elapsed = now - dt.getTime();
  if (elapsed > 0 && elapsed < 130 * 60 * 1000) return 'live';
  return 'upcoming';
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function renderLeaderboard(leaderboard, container) {
  let html = `
  <div class="lb-wrap">
    <div class="lb-head-row lb-row">
      <span class="col-rank">#</span>
      <span class="col-name">Player</span>
      <span class="col-pts">Pts</span>
      <span class="col-gd hide-mobile">Diff</span>
      <span class="col-gf hide-mobile">Goals</span>
    </div>`;

  leaderboard.forEach((entry, i) => {
    const rank  = i + 1;
    const color = PERSON_COLORS[entry.person] || '#6b7280';

    html += `
    <div class="lb-group">
      <div class="lb-row lb-main-row" style="--person-color:${color}">
        <span class="col-rank"><span class="rank-n ${rank <= 3 ? 'rank-top' : ''}">${rank}</span></span>
        <span class="col-name">
          ${avatarEl(entry.person, 34)}
          <span class="person-name" style="border-bottom: 2px solid ${color}">${lc(esc(entry.person))}</span>
        </span>
        <span class="col-pts"><strong>${entry.totalPoints}</strong></span>
        <span class="col-gd hide-mobile">${fmtSign(entry.goalDiff)}</span>
        <span class="col-gf hide-mobile">${entry.goalsFor}</span>
      </div>
      <div class="lb-teams">`;

    for (const t of entry.teams) {
      const gamesPlayed = t.groupWins + t.groupDraws + t.groupLosses;
      const record = gamesPlayed ? `${t.groupWins}W ${t.groupDraws}D ${t.groupLosses}L` : '';
      html += `
        <div class="team-row ${t.isEliminated ? 'team-out' : ''} ${t.isChampion ? 'team-champ' : ''}">
          <span class="team-nm">${esc(t.name)}</span>
          ${stageBadge(t)}
          <span class="team-record hide-mobile">${record}</span>
          <span class="team-pts-val">${t.totalPoints} pts</span>
          <span class="team-breakdown hide-mobile">${ptsBreakdown(t)}</span>
        </div>`;
    }

    html += `
      </div>
    </div>`;
  });

  html += '</div>';
  container.innerHTML = html;
}

// ─── Schedule / Upcoming ──────────────────────────────────────────────────────

export function renderMatches(matches, ownerMap, container) {
  const now = Date.now();

  const candidates = matches
    .filter((m) => {
      if (m.score?.ft) return false;
      return (
        ownerMap.has(normalize(m.team1 || '')) ||
        ownerMap.has(normalize(m.team2 || ''))
      );
    })
    .map((m) => {
      const dt     = m.time ? parseMatchTime(m.date, m.time) : null;
      const owner1 = ownerMap.get(normalize(m.team1 || '')) || null;
      const owner2 = ownerMap.get(normalize(m.team2 || '')) || null;
      const state  = matchState(m, now);
      const isH2H  = !!(owner1 && owner2 && owner1 !== owner2);
      return { ...m, dt, owner1, owner2, state, isH2H };
    })
    .sort((a, b) => (a.dt?.getTime() ?? 0) - (b.dt?.getTime() ?? 0));

  if (!candidates.length) {
    container.innerHTML = '<p class="empty-state">No upcoming matches.</p>';
    return;
  }

  const live     = candidates.filter((m) => m.state === 'live');
  const upcoming = candidates.filter((m) => m.state !== 'live');

  let html = '';

  // ── Live now ──────────────────────────────────────────────────────────────
  if (live.length) {
    html += `<div class="schedule-section">
      <h2 class="section-heading"><span class="live-indicator"></span> Live now</h2>
      <div class="match-list">`;
    for (const m of live) html += matchCard(m, true);
    html += '</div></div>';
  }

  // ── Upcoming, grouped by Qatar date ───────────────────────────────────────
  const byDate = new Map();
  for (const m of upcoming) {
    const key = m.dt ? toQatarDateKey(m.dt) : m.date;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(m);
  }

  if (byDate.size) {
    html += `<div class="schedule-section ${live.length ? 'mt-section' : ''}">`;
    for (const [, dayMatches] of byDate) {
      const firstDt = dayMatches.find((m) => m.dt)?.dt;
      const label   = firstDt ? qatarDateLabel(firstDt) : dayMatches[0].date;
      html += `<h2 class="section-heading">${esc(label)}</h2>
        <div class="match-list">`;
      for (const m of dayMatches) html += matchCard(m, false);
      html += '</div>';
    }
    html += '</div>';
  }

  container.innerHTML = html;
}

function matchCard(m, isLive) {
  const o1 = m.owner1;
  const o2 = m.owner2;
  const c1 = o1 ? PERSON_COLORS[o1] || '#6b7280' : null;
  const c2 = o2 ? PERSON_COLORS[o2] || '#6b7280' : null;

  const timeStr = m.dt ? fmtQatarTime(m.dt) : (m.time || '');
  const dateStr = m.dt ? qatarDateLabel(m.dt) : m.date;

  let meta = '';
  if (isLive) {
    meta = `<div class="match-meta live-meta"><span class="live-dot"></span> Live</div>`;
  } else {
    meta = `<div class="match-meta">${esc(dateStr)}  ·  ${esc(timeStr)}</div>`;
  }

  const av1 = o1 ? avatarEl(o1, 26) : '';
  const av2 = o2 ? avatarEl(o2, 26) : '';
  const centerPiece = isLive
    ? `<div class="match-center">${av1}<div class="match-vs live-vs">—</div>${av2}</div>`
    : `<div class="match-center">${av1}<div class="match-vs">vs</div>${av2}</div>`;

  // Both sides have identical structure: team name on top, owner below.
  // Only text-align differs (left vs right).
  const side = (name, owner, color, align) => {
    const tag = owner
      ? `<span class="owner-tag" style="color:${color}">${lc(esc(owner))}</span>`
      : '';
    return `<div class="match-side ${align}">
      <div class="team-nm-lg">${esc(name || '?')}</div>
      ${tag}
    </div>`;
  };

  const venue = m.ground
    ? `<div class="match-foot">${esc(m.ground)}</div>`
    : '';

  const cls = ['match-card', m.isH2H ? 'match-h2h' : '', isLive ? 'match-live' : '']
    .filter(Boolean).join(' ');

  return `
  <div class="${cls}">
    ${meta}
    <div class="match-body">
      ${side(m.team1, o1, c1, 'left')}
      ${centerPiece}
      ${side(m.team2, o2, c2, 'right')}
    </div>
    ${venue}
  </div>`;
}

// ─── Results ──────────────────────────────────────────────────────────────────

export function renderResults(matches, ownerMap, container) {
  const completed = matches
    .filter((m) => {
      if (!m.score?.ft) return false;
      return (
        ownerMap.has(normalize(m.team1 || '')) ||
        ownerMap.has(normalize(m.team2 || ''))
      );
    })
    .map((m) => {
      const dt     = m.time ? parseMatchTime(m.date, m.time) : null;
      const owner1 = ownerMap.get(normalize(m.team1 || '')) || null;
      const owner2 = ownerMap.get(normalize(m.team2 || '')) || null;
      const isH2H  = !!(owner1 && owner2 && owner1 !== owner2);
      return { ...m, dt, owner1, owner2, isH2H };
    })
    .sort((a, b) => (b.dt?.getTime() ?? 0) - (a.dt?.getTime() ?? 0));

  if (!completed.length) {
    container.innerHTML = '<p class="empty-state">No completed matches yet.</p>';
    return;
  }

  // Group by Qatar date, most recent first
  const byDate = new Map();
  for (const m of completed) {
    const key = m.dt ? toQatarDateKey(m.dt) : m.date;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(m);
  }

  let html = '<div class="schedule-section">';
  for (const [, dayMatches] of byDate) {
    const firstDt = dayMatches.find((m) => m.dt)?.dt;
    const label   = firstDt ? qatarDateLabel(firstDt) : dayMatches[0].date;
    html += `<h2 class="section-heading">${esc(label)}</h2>
      <div class="match-list">`;
    for (const m of dayMatches) html += resultCard(m);
    html += '</div>';
  }
  html += '</div>';

  container.innerHTML = html;
}

function resultMatchPts(m, forTeam1) {
  const [g1, g2] = m.score.ft;
  const myG = forTeam1 ? g1 : g2;
  const thG = forTeam1 ? g2 : g1;
  if (m.group !== undefined) {
    if (myG > thG) return SCORING.group.win;
    if (myG === thG) return SCORING.group.draw;
    return SCORING.group.loss;
  }
  // Knockout: winner gets progression bonus
  if (myG <= thG) return 0;
  const r = (m.round || '').toLowerCase();
  if (r.includes('round of 32')) return SCORING.progression['Round of 32'];
  if (r.includes('round of 16')) return SCORING.progression['Round of 16'];
  if (r.includes('quarter'))     return SCORING.progression['Quarterfinals'];
  if (r.includes('semi'))        return SCORING.progression['Semifinals'];
  if (r.includes('final'))       return SCORING.progression['Final'];
  return 0;
}

function resultCard(m) {
  const o1 = m.owner1;
  const o2 = m.owner2;
  const c1 = o1 ? PERSON_COLORS[o1] || '#6b7280' : null;
  const c2 = o2 ? PERSON_COLORS[o2] || '#6b7280' : null;

  const [g1, g2] = m.score.ft;
  const w1 = g1 > g2;
  const w2 = g2 > g1;

  const ptsChip = (pts) => {
    if (pts === null) return '';
    const cls = pts > 0 ? 'result-pts pts-gain' : 'result-pts pts-zero';
    return `<span class="${cls}">${pts > 0 ? '+' : ''}${pts} pts</span>`;
  };

  const side = (name, owner, color, align, won, forTeam1) => {
    const pts = owner ? resultMatchPts(m, forTeam1) : null;
    const tag = owner
      ? `<div class="result-owner-row">
           <span class="owner-tag" style="color:${color}">${lc(esc(owner))}</span>
           ${ptsChip(pts)}
         </div>`
      : '';
    return `<div class="match-side ${align}">
      <div class="team-nm-lg ${won ? 'result-winner' : ''}">${esc(name || '?')}</div>
      ${tag}
    </div>`;
  };

  const av1 = o1 ? avatarEl(o1, 26) : '';
  const av2 = o2 ? avatarEl(o2, 26) : '';
  const score = `<div class="match-center">${av1}<div class="match-vs result-score">${g1} – ${g2}</div>${av2}</div>`;

  const cls = ['match-card result-card', m.isH2H ? 'match-h2h' : '']
    .filter(Boolean).join(' ');

  return `
  <div class="${cls}">
    <div class="match-body">
      ${side(m.team1, o1, c1, 'left', w1, true)}
      ${score}
      ${side(m.team2, o2, c2, 'right', w2, false)}
    </div>
  </div>`;
}

// ─── How It Works ─────────────────────────────────────────────────────────────

export function renderHowItWorks(container) {
  const p = SCORING.progression;
  const g = SCORING.group;
  const maxGroup = g.win * 3;
  const maxProg  = STAGE_ORDER.reduce((s, k) => s + p[k], 0) + p.Champion;

  const stageRows = STAGE_ORDER.map((s) => `
    <tr>
      <td>${esc(s)}</td>
      <td class="pts-col">+${p[s]}</td>
      <td class="pts-note">one-time, when the team first enters this round</td>
    </tr>`).join('');

  container.innerHTML = `
  <div class="hiw-content">
    <h2>How It Works</h2>
    <p class="hiw-intro">
      14 people, each assigned 3 national teams. Your score is the sum of all
      three teams' points across the 2026 FIFA World Cup.
    </p>

    <h3>Group Stage</h3>
    <table class="hiw-table">
      <thead><tr><th>Result</th><th class="pts-col">Points</th></tr></thead>
      <tbody>
        <tr><td>Win</td><td class="pts-col">+${g.win}</td></tr>
        <tr><td>Draw</td><td class="pts-col">+${g.draw}</td></tr>
        <tr><td>Loss</td><td class="pts-col">+${g.loss}</td></tr>
      </tbody>
    </table>

    <h3>Knockout Progression</h3>
    <p>One-time bonus each time a team reaches a new stage. No win/loss points in knockouts.</p>
    <table class="hiw-table">
      <thead>
        <tr><th>Stage</th><th class="pts-col">Bonus</th><th></th></tr>
      </thead>
      <tbody>
        ${stageRows}
        <tr class="champion-row">
          <td>Champion</td>
          <td class="pts-col">+${p.Champion}</td>
          <td class="pts-note">in addition to the Final bonus</td>
        </tr>
      </tbody>
    </table>
    <p class="hiw-note">
      A champion earns +${p.Final} (Final) + +${p.Champion} (Champion) = +${p.Final + p.Champion}
      from the last two rounds alone. The theoretical maximum per team is
      +${maxGroup + maxProg} pts.
    </p>

    <h3>Tiebreakers</h3>
    <ol class="hiw-list">
      <li>Total points</li>
      <li>Total goals scored by your teams</li>
      <li>Goal difference across your teams</li>
      <li>Number of teams still alive</li>
    </ol>

    <h3>Roster</h3>
    <div class="roster-grid">
      ${Object.entries(ROSTER).map(([person, teams]) => {
        const color = PERSON_COLORS[person] || '#6b7280';
        return `<div class="roster-card" style="--pc:${color}">
          <div class="roster-header">
            ${avatarEl(person, 40)}
            <span class="roster-name">${lc(esc(person))}</span>
          </div>
          <ul class="roster-teams">
            ${teams.map((t) => `<li>${esc(t)}</li>`).join('')}
          </ul>
        </div>`;
      }).join('')}
    </div>

    <h3>Data</h3>
    <p>
      Scores from
      <a href="https://github.com/openfootball/worldcup.json" target="_blank" rel="noopener">openfootball/worldcup.json</a>.
      The page loads a local snapshot first, then overwrites with the live feed on every visit.
    </p>
  </div>`;
}

// ─── Status bar ───────────────────────────────────────────────────────────────

export function renderStatus(source, _lastUpdated, barEl) {
  if (source === 'live' || source === 'cached') {
    barEl.className = 'status-bar hidden';
    return;
  }
  if (source === 'cached-only') {
    barEl.className = 'status-bar warning';
    barEl.textContent = 'Live data unavailable — showing cached snapshot. Scores may be outdated.';
    return;
  }
  if (source === 'error') {
    barEl.className = 'status-bar error';
    barEl.textContent = 'Could not load match data. Check your connection and try refreshing.';
    return;
  }
  barEl.className = 'status-bar hidden';
}
