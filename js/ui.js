import { SCORING, STAGE_ORDER, FLAGS, PERSON_COLORS, ROSTER } from './config.js';
import { normalize, parseMatchTime } from './scoring.js';

// ─── Utilities ────────────────────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function flag(name) { return FLAGS[name] || '🏳️'; }

function fmtSign(n) { return n > 0 ? `+${n}` : String(n); }

function medal(rank) {
  if (rank === 1) return '<span class="medal gold">1</span>';
  if (rank === 2) return '<span class="medal silver">2</span>';
  if (rank === 3) return '<span class="medal bronze">3</span>';
  return `<span class="rank-num">${rank}</span>`;
}

function stageBadge(t) {
  if (t.isChampion)       return '<span class="stage champion">🏆 Champion</span>';
  if (t.isEliminated)     return '<span class="stage elim">Out</span>';
  const stages = [...t.stagesReached];
  const last = STAGE_ORDER.slice().reverse().find((s) => stages.includes(s));
  if (last) return `<span class="stage reached" data-stage="${esc(last)}">${esc(last)}</span>`;
  return '<span class="stage group">Groups</span>';
}

function ptsBreakdown(t) {
  const parts = [];
  if (t.groupPoints) parts.push(`Group +${t.groupPoints}`);
  const stages = STAGE_ORDER.filter((s) => t.stagesReached.has(s));
  for (const s of stages) {
    parts.push(`${s} +${SCORING.progression[s]}`);
  }
  if (t.isChampion) parts.push(`Champion +${SCORING.progression.Champion}`);
  return parts.join(' · ') || '–';
}

// Format a UTC Date for display.
function fmtDateHeading(dt) {
  return dt.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
}

function fmtTime(dt) {
  const utc = dt.toLocaleTimeString('en-US', {
    timeZone: 'UTC', hour: 'numeric', minute: '2-digit', hour12: true,
  });
  const local = dt.toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short',
  });
  return { utc, local };
}

// ─── Leaderboard ──────────────────────────────────────────────────────────────

export function renderLeaderboard(leaderboard, container) {
  let html = `
    <div class="lb-header">
      <h2>Standings</h2>
    </div>
    <div class="lb-table" role="table">
      <div class="lb-thead" role="rowgroup">
        <div class="lb-row lb-head-row" role="row">
          <span class="col-rank" role="columnheader">#</span>
          <span class="col-name" role="columnheader">Player</span>
          <span class="col-teams" role="columnheader">Teams</span>
          <span class="col-pts"  role="columnheader">Pts</span>
          <span class="col-gf hide-mobile"  role="columnheader">GF</span>
          <span class="col-gd hide-mobile"  role="columnheader">GD</span>
          <span class="col-alive hide-mobile" role="columnheader">Alive</span>
        </div>
      </div>
      <div class="lb-tbody" role="rowgroup">`;

  leaderboard.forEach((entry, i) => {
    const rank     = i + 1;
    const color    = PERSON_COLORS[entry.person] || '#6b7280';
    const teamFlags = entry.teams.map((t) => flag(t.name)).join(' ');

    html += `
        <div class="lb-group" data-person="${esc(entry.person)}">
          <div class="lb-row lb-main-row ${rank <= 3 ? 'top-three' : ''}" role="row"
               style="--person-color:${color}">
            <span class="col-rank" role="cell">${medal(rank)}</span>
            <span class="col-name" role="cell">
              <span class="person-badge" style="background:${color}">${esc(entry.person)}</span>
            </span>
            <span class="col-teams" role="cell" aria-label="Teams">${teamFlags}</span>
            <span class="col-pts"  role="cell"><strong>${entry.totalPoints}</strong></span>
            <span class="col-gf hide-mobile"  role="cell">${entry.goalsFor}</span>
            <span class="col-gd hide-mobile"  role="cell">${fmtSign(entry.goalDiff)}</span>
            <span class="col-alive hide-mobile" role="cell">${entry.teamsAlive}/3</span>
          </div>
          <div class="lb-teams-row">`;

    for (const t of entry.teams) {
      const elim   = t.isEliminated;
      const record = `${t.groupWins}W ${t.groupDraws}D ${t.groupLosses}L`;
      html += `
            <div class="team-detail ${elim ? 'eliminated' : ''} ${t.isChampion ? 'champion-team' : ''}">
              <span class="team-flag">${flag(t.name)}</span>
              <span class="team-name">${esc(t.name)}</span>
              ${stageBadge(t)}
              <span class="team-record hide-mobile">${record}</span>
              <span class="team-pts">${t.totalPoints} pts</span>
              <span class="team-breakdown hide-mobile">${ptsBreakdown(t)}</span>
            </div>`;
    }

    html += `
          </div>
        </div>`;
  });

  html += `
      </div>
    </div>`;

  container.innerHTML = html;
}

// ─── Upcoming Matches ─────────────────────────────────────────────────────────

export function renderMatches(matches, ownerMap, container) {
  const now = Date.now();

  // Keep only unplayed matches where at least one team is owned.
  const upcoming = matches.filter((m) => {
    if (m.score?.ft) return false;
    const o1 = ownerMap.get(normalize(m.team1 || ''));
    const o2 = ownerMap.get(normalize(m.team2 || ''));
    return o1 || o2;
  });

  if (!upcoming.length) {
    container.innerHTML = '<p class="empty-state">No upcoming matches to show yet.</p>';
    return;
  }

  // Attach parsed datetime and owner info.
  const enriched = upcoming.map((m) => {
    const dt    = m.time ? parseMatchTime(m.date, m.time) : null;
    const owner1 = ownerMap.get(normalize(m.team1 || '')) || null;
    const owner2 = ownerMap.get(normalize(m.team2 || '')) || null;
    const isH2H  = !!(owner1 && owner2 && owner1 !== owner2);
    return { ...m, dt, owner1, owner2, isH2H };
  }).sort((a, b) => (a.dt?.getTime() ?? 0) - (b.dt?.getTime() ?? 0));

  // Separate upcoming h2h clashes for the spotlight box.
  const h2h = enriched.filter((m) => m.isH2H);

  let html = '';

  if (h2h.length) {
    html += `<div class="h2h-spotlight">
      <h3>🔥 Friend vs Friend (${h2h.length})</h3>
      <p class="h2h-sub">These are the spicy ones — two of your crew on opposite sides.</p>
      <div class="h2h-list">`;
    for (const m of h2h.slice(0, 5)) {
      const c1 = PERSON_COLORS[m.owner1] || '#6b7280';
      const c2 = PERSON_COLORS[m.owner2] || '#6b7280';
      const dateStr = m.dt
        ? m.dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
        : m.date;
      html += `
        <div class="h2h-card">
          <span class="h2h-date">${esc(dateStr)}</span>
          <span class="h2h-team">
            ${flag(m.team1)} ${esc(m.team1)}
            <span class="owner-pill" style="background:${c1}">${esc(m.owner1)}</span>
          </span>
          <span class="h2h-vs">vs</span>
          <span class="h2h-team">
            ${flag(m.team2)} ${esc(m.team2)}
            <span class="owner-pill" style="background:${c2}">${esc(m.owner2)}</span>
          </span>
        </div>`;
    }
    if (h2h.length > 5) {
      html += `<p class="h2h-more">+ ${h2h.length - 5} more clashes below</p>`;
    }
    html += '</div></div>';
  }

  // Group all matches by date string (YYYY-MM-DD).
  const byDate = new Map();
  for (const m of enriched) {
    const key = m.date;
    if (!byDate.has(key)) byDate.set(key, []);
    byDate.get(key).push(m);
  }

  html += '<div class="match-days">';

  for (const [, dayMatches] of byDate) {
    const firstDt = dayMatches.find((m) => m.dt)?.dt;
    const heading  = firstDt
      ? fmtDateHeading(firstDt)
      : dayMatches[0].date;

    html += `<div class="match-day">
      <h3 class="match-day-heading">${esc(heading)}</h3>`;

    // H2H matches first within the day, then others.
    const sorted = [
      ...dayMatches.filter((m) => m.isH2H),
      ...dayMatches.filter((m) => !m.isH2H),
    ];

    for (const m of sorted) {
      const o1    = m.owner1;
      const o2    = m.owner2;
      const c1    = o1 ? PERSON_COLORS[o1] || '#6b7280' : null;
      const c2    = o2 ? PERSON_COLORS[o2] || '#6b7280' : null;
      const times = m.dt ? fmtTime(m.dt) : null;

      html += `
        <div class="match-card ${m.isH2H ? 'match-h2h' : ''}">
          ${m.isH2H ? '<span class="h2h-flame">🔥</span>' : ''}
          <div class="match-time">
            ${times ? `<span class="time-utc">${esc(times.utc)} UTC</span>
            <span class="time-local">${esc(times.local)}</span>` : `<span class="time-utc">${esc(m.time || '')}</span>`}
          </div>
          <div class="match-teams">
            <div class="match-team ${o1 ? 'owned' : ''}">
              <span class="match-flag">${flag(m.team1 || '')}</span>
              <span class="match-name">${esc(m.team1 || '?')}</span>
              ${o1 ? `<span class="owner-pill" style="background:${c1}">${esc(o1)}</span>` : ''}
            </div>
            <span class="match-sep">vs</span>
            <div class="match-team ${o2 ? 'owned' : ''}">
              <span class="match-flag">${flag(m.team2 || '')}</span>
              <span class="match-name">${esc(m.team2 || '?')}</span>
              ${o2 ? `<span class="owner-pill" style="background:${c2}">${esc(o2)}</span>` : ''}
            </div>
          </div>
          ${m.ground ? `<div class="match-venue">${esc(m.ground)}</div>` : ''}
        </div>`;
    }

    html += '</div>';
  }

  html += '</div>';
  container.innerHTML = html;
}

// ─── How It Works ─────────────────────────────────────────────────────────────

export function renderHowItWorks(container) {
  const p = SCORING.progression;
  const g = SCORING.group;

  // Compute the max possible score for a team reaching and winning the final.
  const maxGroup = g.win * 3;
  const maxProgression = STAGE_ORDER.reduce((s, k) => s + p[k], 0) + p.Champion;

  const stageRows = STAGE_ORDER.map((s) => `
    <tr><td>${esc(s)}</td><td class="pts-col">+${p[s]}</td>
    <td class="pts-note">reaching this round for the first time</td></tr>`).join('');

  container.innerHTML = `
    <div class="hiw-content">
      <h2>How It Works</h2>
      <p class="hiw-intro">
        14 friends, each assigned 3 national teams. Your score is the <strong>sum of all
        three teams' points</strong> throughout the 2026 FIFA World Cup.
        The Table tracks everything live.
      </p>

      <h3>Group Stage</h3>
      <p>Points awarded per match result for each of your teams:</p>
      <table class="hiw-table">
        <thead><tr><th>Result</th><th class="pts-col">Points</th></tr></thead>
        <tbody>
          <tr><td>Win</td><td class="pts-col">+${g.win}</td></tr>
          <tr><td>Draw</td><td class="pts-col">+${g.draw}</td></tr>
          <tr><td>Loss</td><td class="pts-col">+${g.loss}</td></tr>
        </tbody>
      </table>

      <h3>Knockout Progression</h3>
      <p>
        Each time one of your teams advances into a knockout round, they earn a
        one-time <strong>progression bonus</strong>. No W/D/L points in knockouts —
        the bonuses do that job (and sidestep penalty-shootout ambiguity).
      </p>
      <table class="hiw-table">
        <thead>
          <tr><th>Stage reached</th><th class="pts-col">Bonus</th><th>Notes</th></tr>
        </thead>
        <tbody>
          ${stageRows}
          <tr class="champion-row">
            <td>🏆 Champion</td>
            <td class="pts-col">+${p.Champion}</td>
            <td class="pts-note">on top of the Final bonus — awarded to the winner</td>
          </tr>
        </tbody>
      </table>
      <p class="hiw-note">
        A team that wins the tournament earns the <em>Final</em> bonus (+${p.Final}) <em>and</em>
        the <em>Champion</em> bonus (+${p.Champion}) = <strong>+${p.Final + p.Champion}</strong> from those two alone.
        With a perfect group stage (+${maxGroup}) the theoretical maximum for one team is
        <strong>+${maxGroup + maxProgression}</strong> points.
      </p>

      <h3>Tiebreakers</h3>
      <p>When two people are level on points, the winner is determined in order by:</p>
      <ol class="hiw-list">
        <li>Total points (higher is better)</li>
        <li>Total goals scored by your 3 teams</li>
        <li>Goal difference (GF − GA) across your 3 teams</li>
        <li>Number of teams still alive in the competition</li>
      </ol>

      <h3>Your Roster</h3>
      <div class="roster-grid">
        ${Object.entries(ROSTER).map(([person, teams]) => {
          const color = PERSON_COLORS[person] || '#6b7280';
          return `<div class="roster-card" style="border-left:4px solid ${color}">
            <span class="roster-name" style="color:${color}">${esc(person)}</span>
            <ul class="roster-teams">
              ${teams.map((t) => `<li>${flag(t)} ${esc(t)}</li>`).join('')}
            </ul>
          </div>`;
        }).join('')}
      </div>

      <h3>Data Source</h3>
      <p>
        Match data comes from the open-source
        <a href="https://github.com/openfootball/worldcup.json" target="_blank" rel="noopener">
          openfootball/worldcup.json</a> dataset. The page first loads a committed
        snapshot (<code>data/worldcup.json</code>) for an instant render, then refreshes
        from the live URL. If the live fetch fails, a banner tells you you're viewing
        cached data.
      </p>
    </div>`;
}

// ─── Status bar ───────────────────────────────────────────────────────────────

export function renderStatus(source, lastUpdated, barEl) {
  if (source === 'live') {
    barEl.className = 'status-bar hidden';
    return;
  }
  if (source === 'cached') {
    // Snapshot loaded but live is still in flight — don't show anything yet.
    barEl.className = 'status-bar hidden';
    return;
  }
  if (source === 'cached-only') {
    barEl.className = 'status-bar warning';
    barEl.textContent =
      '⚠️  Live data unavailable — showing cached snapshot. Scores may be outdated.';
    return;
  }
  if (source === 'error') {
    barEl.className = 'status-bar error';
    barEl.textContent =
      '❌  Could not load match data. Check your connection and refresh.';
    return;
  }
  barEl.className = 'status-bar hidden';
}
