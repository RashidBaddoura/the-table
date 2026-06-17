// The Table v2 — predictions controller (frontend).
// Owns auth state + Supabase data, renders the Predict tab and the combined /
// expandable Standings, drives realtime + per-second countdowns, and mirrors
// the server visibility rule. The SERVER (RLS) is always authoritative; this
// layer only shapes what the user sees and surfaces server rejections cleanly.

import { ROSTER, SCORING_WEIGHTS } from './config.js';
import * as db from './supabase.js';
import { avatarEl, esc, lc, fmtQatarTime, qatarDateLabel } from './ui.js';
import { isLocked, msUntilLock, formatCountdown } from './lock.js';

const LOGIN_NAMES = Object.keys(ROSTER);

export function createPredictions({ onStandingsDirty, toast } = {}) {
  // ── State ──────────────────────────────────────────────────────────────────
  const S = {
    user: null,                 // { id, display_name } | null
    cfg: { exact_score: 5, correct_gd: 3, correct_outcome: 2, lock_minutes: 60, max_goals: 30 },
    players: [],                // [{id, display_name}]
    matches: [],                // DB match rows
    preds: [],                  // visible predictions (mine + revealed others')
    counts: new Map(),          // match_key -> n predicted
    predTotals: new Map(),      // user_id -> total prediction points
    leaderboard: [],            // v1 team leaderboard (array w/ .person,.totalPoints)
    sortMode: 'combined',       // combined | team | predictions
    loaded: false,
  };

  let predictEl = null;
  let standingsEl = null;
  let tickTimer = null;
  let realtimeReady = false;
  let reloadDebounce = null;

  const nameById = (id) => S.players.find((p) => p.id === id)?.display_name || null;
  const lockMin = () => Number(S.cfg.lock_minutes ?? 60);
  const maxGoals = () => Number(S.cfg.max_goals ?? 30);

  const myPredFor = (key) =>
    S.preds.find((p) => p.match_key === key && S.user && p.user_id === S.user.id) || null;
  const predsForMatch = (key) => S.preds.filter((p) => p.match_key === key);
  const predsByUser = (uid) => S.preds.filter((p) => p.user_id === uid);

  // ── Data loading ─────────────────────────────────────────────────────────────
  async function loadAll() {
    if (!db.isConfigured()) return;
    S.user = await db.getSessionUser();
    // Config + matches are readable to any logged-in user; everything else too.
    const [cfg, players, matches, preds, counts, totals] = await Promise.all([
      db.getScoringConfig().catch(() => S.cfg),
      db.getPlayers().catch(() => []),
      db.getMatches().catch(() => []),
      S.user ? db.getVisiblePredictions().catch(() => []) : Promise.resolve([]),
      S.user ? db.getCounts().catch(() => new Map()) : Promise.resolve(new Map()),
      S.user ? db.getPredictionTotals().catch(() => new Map()) : Promise.resolve(new Map()),
    ]);
    S.cfg = { ...S.cfg, ...cfg };
    S.players = players;
    S.matches = matches;
    S.preds = preds;
    S.counts = counts;
    S.predTotals = totals;
    S.loaded = true;
    if (S.user && !realtimeReady) {
      realtimeReady = true;
      db.subscribeChanges(scheduleReload).catch(() => { realtimeReady = false; });
    }
  }

  function scheduleReload() {
    clearTimeout(reloadDebounce);
    reloadDebounce = setTimeout(async () => {
      const beforeTotals = new Map(S.predTotals);
      await loadAll();
      renderAll();
      // Toast when one of MY predictions newly scored.
      if (S.user) {
        const before = beforeTotals.get(S.user.id) ?? 0;
        const after = S.predTotals.get(S.user.id) ?? 0;
        if (after > before && toast) toast(`Your predictions scored +${after - before}!`);
      }
      onStandingsDirty?.();
    }, 400);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────────
  async function init() {
    if (!db.isConfigured()) { S.loaded = true; return; }
    await loadAll();
    startTicking();
  }

  async function login(name, code) {
    await db.signIn(name, code);
    await loadAll();
    renderAll();
    onStandingsDirty?.();
    startTicking();
  }

  async function logout() {
    await db.signOut();
    S.user = null; S.preds = []; S.counts = new Map(); S.predTotals = new Map();
    renderAll();
    onStandingsDirty?.();
  }

  const currentUser = () => S.user;
  const isReady = () => db.isConfigured();

  // ── Combined leaderboard (for app.js to know totals / re-sort) ────────────────
  function setLeaderboard(lb) { S.leaderboard = lb; }

  function combinedRows() {
    const totalByName = new Map();
    for (const [uid, total] of S.predTotals) {
      const nm = nameById(uid);
      if (nm) totalByName.set(nm, total);
    }
    const rows = S.leaderboard.map((e) => {
      const teamPts = e.totalPoints;
      const predPts = totalByName.get(e.person) || 0;
      const combined = teamPts * SCORING_WEIGHTS.team + predPts * SCORING_WEIGHTS.prediction;
      return { person: e.person, entry: e, teamPts, predPts, combined };
    });
    const key = S.sortMode === 'team' ? 'teamPts'
              : S.sortMode === 'predictions' ? 'predPts' : 'combined';
    rows.sort((a, b) => b[key] - a[key] || b.combined - a.combined || b.teamPts - a.teamPts);
    return rows;
  }

  // ── Rendering: containers ─────────────────────────────────────────────────────
  function mount({ predict, standings }) {
    predictEl = predict;
    standingsEl = standings;
    if (predictEl && !predictEl.dataset.wired) {
      predictEl.dataset.wired = '1';
      predictEl.addEventListener('submit', onPredictSubmit);
      predictEl.addEventListener('click', onPredictClick);
    }
    if (standingsEl && !standingsEl.dataset.wired) {
      standingsEl.dataset.wired = '1';
      standingsEl.addEventListener('click', onStandingsClick);
    }
  }

  function renderAll() { renderPredict(); renderStandings(); }

  // ── Predict tab ────────────────────────────────────────────────────────────────
  function renderPredict() {
    if (!predictEl) return;
    if (!db.isConfigured()) {
      predictEl.innerHTML = noticeCard(
        'Predictions are offline',
        'The predictions backend isn’t configured yet. The leaderboard, schedule and results still work.'
      );
      return;
    }
    if (!S.user) { predictEl.innerHTML = renderLoginHtml(); return; }

    const now = Date.now();
    const predictable = S.matches.filter((m) => m.predictable);
    const open = [], locked = [], finished = [];
    for (const m of predictable) {
      if (m.status === 'finished') finished.push(m);
      else if (isLocked(m.kickoff_utc, lockMin(), now)) locked.push(m);
      else open.push(m);
    }
    open.sort((a, b) => Date.parse(a.kickoff_utc) - Date.parse(b.kickoff_utc));
    locked.sort((a, b) => Date.parse(a.kickoff_utc) - Date.parse(b.kickoff_utc));
    finished.sort((a, b) => Date.parse(b.kickoff_utc) - Date.parse(a.kickoff_utc));

    const unpredicted = open.filter((m) => !myPredFor(m.match_key)).length;

    let html = `<div class="predict-head">
      <div class="predict-who">${avatarEl(S.user.display_name, 30)}
        <span>Signed in as <strong>${lc(esc(S.user.display_name))}</strong></span></div>
      ${unpredicted ? `<span class="predict-nudge">${unpredicted} upcoming match${unpredicted === 1 ? '' : 'es'} not predicted</span>` : ''}
    </div>`;

    if (!predictable.length) {
      html += noticeCard('No predictable matches yet',
        'Once fixtures are ingested they’ll appear here to predict.');
    }
    if (open.length) {
      html += `<h2 class="section-heading">Open for predictions</h2><div class="predict-list">`;
      html += open.map(openCard).join('');
      html += `</div>`;
    }
    if (locked.length) {
      html += `<h2 class="section-heading mt-section">Locked — awaiting kickoff/result</h2><div class="predict-list">`;
      html += locked.map(lockedCard).join('');
      html += `</div>`;
    }
    if (finished.length) {
      html += `<h2 class="section-heading mt-section">Recently scored</h2><div class="predict-list">`;
      html += finished.map(finishedCard).join('');
      html += `</div>`;
    }
    predictEl.innerHTML = html;
  }

  function matchTitle(m) {
    const t = m.kickoff_utc ? new Date(m.kickoff_utc) : null;
    const when = t ? `${qatarDateLabel(t)} · ${fmtQatarTime(t)}` : '';
    return `<div class="pc-teams">
        <span class="pc-team">${esc(m.team1)}</span>
        <span class="pc-vs">vs</span>
        <span class="pc-team">${esc(m.team2)}</span>
      </div>
      <div class="pc-when">${esc(when)}</div>`;
  }

  function openCard(m) {
    const mine = myPredFor(m.match_key);
    const n = S.counts.get(m.match_key) || 0;
    const v1 = mine ? mine.pred_team1 : '';
    const v2 = mine ? mine.pred_team2 : '';
    return `<div class="predict-card pc-open" data-key="${esc(m.match_key)}">
      <div class="pc-state pc-state-open">OPEN</div>
      ${matchTitle(m)}
      <form class="pc-form" data-key="${esc(m.match_key)}">
        <input class="pc-score" type="number" inputmode="numeric" min="0" max="${maxGoals()}"
          name="t1" value="${v1}" aria-label="${esc(m.team1)} goals" required>
        <span class="pc-dash">–</span>
        <input class="pc-score" type="number" inputmode="numeric" min="0" max="${maxGoals()}"
          name="t2" value="${v2}" aria-label="${esc(m.team2)} goals" required>
        <button type="submit" class="pc-save">${mine ? 'Update' : 'Lock in'}</button>
      </form>
      <div class="pc-foot">
        <span class="pc-count">${n} of ${LOGIN_NAMES.length} predicted${n && !isLocked(m.kickoff_utc, lockMin()) ? ' · revealed at lock' : ''}</span>
        <span class="pc-countdown" data-countdown="${esc(m.kickoff_utc)}">locks in ${formatCountdown(msUntilLock(m.kickoff_utc, lockMin()))}</span>
      </div>
      ${mine ? `<div class="pc-mine">Your pick: <strong>${mine.pred_team1}–${mine.pred_team2}</strong></div>` : ''}
    </div>`;
  }

  function lockedCard(m) {
    const mine = myPredFor(m.match_key);
    const all = predsForMatch(m.match_key);
    const others = all.filter((p) => !S.user || p.user_id !== S.user.id);
    let body;
    if (!mine) {
      body = `<div class="pc-hidden">You didn’t predict this — others’ picks stay hidden.</div>`;
    } else {
      body = `<div class="pc-mine">Your pick: <strong>${mine.pred_team1}–${mine.pred_team2}</strong></div>`
        + predictionRows([mine, ...others], null);
    }
    return `<div class="predict-card pc-locked" data-key="${esc(m.match_key)}">
      <div class="pc-state pc-state-locked">LOCKED</div>
      ${matchTitle(m)}
      ${body}
    </div>`;
  }

  function finishedCard(m) {
    const all = predsForMatch(m.match_key);
    const mine = myPredFor(m.match_key);
    const ft = `${m.ft_team1}–${m.ft_team2}`;
    const rows = mine ? predictionRows(all, m) : '';
    return `<div class="predict-card pc-finished" data-key="${esc(m.match_key)}">
      <div class="pc-state pc-state-finished">FINISHED</div>
      ${matchTitle(m)}
      <div class="pc-result">Full time (90'): <strong>${esc(ft)}</strong></div>
      ${mine
        ? rows
        : `<div class="pc-hidden">You didn’t predict this — picks stay hidden.</div>`}
    </div>`;
  }

  // Render a set of prediction rows. If `m` (finished match) given, colour by
  // points; otherwise neutral (locked, pre-result).
  function predictionRows(preds, m) {
    if (!preds.length) return '';
    const ordered = [...preds].sort((a, b) =>
      (b.points_awarded ?? -1) - (a.points_awarded ?? -1));
    return `<div class="pred-rows">` + ordered.map((p) => {
      const nm = nameById(p.user_id) || '—';
      const isMe = S.user && p.user_id === S.user.id;
      let cls = 'pred-row', chip = '';
      if (m) {
        const pa = p.points_awarded;
        if (pa === S.cfg.exact_score) cls += ' pred-exact';
        else if (pa > 0) cls += ' pred-hit';
        else if (pa === 0) cls += ' pred-miss';
        chip = pa == null ? '' : `<span class="pred-pts">${pa > 0 ? '+' : ''}${pa}</span>`;
      }
      return `<div class="${cls}${isMe ? ' pred-me' : ''}">
        ${avatarEl(nm, 22)}
        <span class="pred-name">${lc(esc(nm))}</span>
        <span class="pred-score">${p.pred_team1}–${p.pred_team2}</span>
        ${chip}
      </div>`;
    }).join('') + `</div>`;
  }

  // ── Predict interactions ───────────────────────────────────────────────────────
  async function onPredictSubmit(e) {
    const form = e.target.closest('.pc-form');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.key;
    const t1 = parseInt(form.t1.value, 10);
    const t2 = parseInt(form.t2.value, 10);
    const max = maxGoals();
    const btn = form.querySelector('.pc-save');
    if (!Number.isInteger(t1) || !Number.isInteger(t2) ||
        t1 < 0 || t2 < 0 || t1 > max || t2 > max) {
      toast?.(`Enter whole numbers 0–${max}.`);
      return;
    }
    btn.disabled = true; btn.textContent = 'Saving…';
    try {
      await db.upsertPrediction(key, t1, t2);
      // Optimistic local update, then authoritative reload.
      const existing = myPredFor(key);
      if (existing) { existing.pred_team1 = t1; existing.pred_team2 = t2; }
      else S.preds.push({ match_key: key, user_id: S.user.id, pred_team1: t1, pred_team2: t2, points_awarded: null });
      toast?.(`Locked in ${t1}–${t2}.`);
      scheduleReload();
      renderPredict();
    } catch (err) {
      // Server rejected (e.g. locked since page load) — surface and refresh.
      toast?.(rejectionMessage(err));
      scheduleReload();
    } finally {
      btn.disabled = false;
    }
  }

  function onPredictClick(e) {
    const loginBtn = e.target.closest('[data-login-submit]');
    if (loginBtn) { e.preventDefault(); submitLoginForm(); }
  }

  function rejectionMessage(err) {
    const msg = String(err?.message || err);
    if (/locked|row-level|policy|violat/i.test(msg)) return 'Too late — that match has locked.';
    return `Couldn’t save: ${msg}`;
  }

  // ── Login (rendered inside the Predict tab when logged out) ───────────────────
  function renderLoginHtml() {
    return `<div class="login-card">
      <h2>Sign in to predict</h2>
      <p class="login-sub">Pick your name and enter your 6-digit code.</p>
      <div class="login-form">
        <select id="login-name" class="login-name">
          ${LOGIN_NAMES.map((n) => `<option value="${esc(n)}">${lc(esc(n))}</option>`).join('')}
        </select>
        <input id="login-code" class="login-code" type="password" inputmode="numeric"
          maxlength="6" placeholder="••••••" autocomplete="off">
        <button data-login-submit class="login-btn">Sign in</button>
      </div>
      <p id="login-error" class="login-error" role="alert"></p>
    </div>`;
  }

  async function submitLoginForm() {
    const name = predictEl.querySelector('#login-name')?.value;
    const code = predictEl.querySelector('#login-code')?.value?.trim();
    const errEl = predictEl.querySelector('#login-error');
    if (!/^\d{6}$/.test(code || '')) { if (errEl) errEl.textContent = 'Enter your 6-digit code.'; return; }
    if (errEl) errEl.textContent = '';
    const btn = predictEl.querySelector('[data-login-submit]');
    if (btn) { btn.disabled = true; btn.textContent = 'Signing in…'; }
    try {
      await login(name, code);
    } catch (err) {
      if (errEl) errEl.textContent = 'Wrong name or code.';
      if (btn) { btn.disabled = false; btn.textContent = 'Sign in'; }
    }
  }

  // ── Standings (combined + expandable) ─────────────────────────────────────────
  function renderStandings() {
    if (!standingsEl || !S.leaderboard.length) return;
    // Logged out / not configured → leave v1's renderLeaderboard output alone.
    if (!db.isConfigured() || !S.user) return;

    const rows = combinedRows();
    const toggle = (mode, label) =>
      `<button class="sort-btn ${S.sortMode === mode ? 'active' : ''}" data-sort="${mode}">${label}</button>`;

    let html = `<div class="sort-toggle">
      <span class="sort-label">Sort:</span>
      ${toggle('combined', 'Combined')}${toggle('team', 'Team')}${toggle('predictions', 'Predictions')}
    </div><div class="lb-wrap lb-combined">
      <div class="lb-head-row lb-row">
        <span class="col-rank">#</span><span class="col-name">Player</span>
        <span class="col-pts">Total</span>
        <span class="col-sub hide-mobile">Team</span>
        <span class="col-sub hide-mobile">Pred</span>
        <span class="col-exp"></span>
      </div>`;

    rows.forEach((r, i) => {
      html += `<div class="lb-group" data-person="${esc(r.person)}">
        <div class="lb-row lb-main-row lb-combined-row" data-person="${esc(r.person)}">
          <span class="col-rank"><span class="rank-n ${i < 3 ? 'rank-top' : ''}">${i + 1}</span></span>
          <span class="col-name">${avatarEl(r.person, 32)}
            <span class="person-name">${lc(esc(r.person))}</span></span>
          <span class="col-pts"><strong>${r.combined}</strong></span>
          <span class="col-sub hide-mobile">${r.teamPts}</span>
          <span class="col-sub hide-mobile col-pred">${r.predPts}</span>
          <span class="col-exp"><button class="expand-btn" data-person="${esc(r.person)}" aria-label="View predictions">▾</button></span>
        </div>
        <div class="lb-preds hidden" data-preds="${esc(r.person)}"></div>
      </div>`;
    });
    html += `</div>`;
    standingsEl.innerHTML = html;
  }

  function playerPredPanel(person) {
    const p = S.players.find((x) => x.display_name === person);
    const isMe = S.user && p && p.id === S.user.id;
    if (!p) return `<div class="pc-hidden">No predictions yet.</div>`;
    const rows = predsByUser(p.id);
    const matchByKey = new Map(S.matches.map((m) => [m.match_key, m]));
    if (!rows.length) {
      return `<div class="pc-hidden">${isMe
        ? 'You haven’t predicted anything yet.'
        : 'Hidden — predict a match to reveal their picks once it locks.'}</div>`;
    }
    const withM = rows
      .map((pr) => ({ pr, m: matchByKey.get(pr.match_key) }))
      .filter((x) => x.m)
      .sort((a, b) => Date.parse(b.m.kickoff_utc) - Date.parse(a.m.kickoff_utc));

    const body = withM.map(({ pr, m }) => {
      const finished = m.status === 'finished';
      let cls = 'lbp-row', chip = '', actual = '';
      if (finished) {
        const pa = pr.points_awarded;
        if (pa === S.cfg.exact_score) cls += ' pred-exact';
        else if (pa > 0) cls += ' pred-hit';
        else if (pa === 0) cls += ' pred-miss';
        chip = pa == null ? '' : `<span class="pred-pts">${pa > 0 ? '+' : ''}${pa}</span>`;
        actual = `<span class="lbp-actual">act ${m.ft_team1}–${m.ft_team2}</span>`;
      }
      return `<div class="${cls}">
        <span class="lbp-match">${esc(m.team1)} v ${esc(m.team2)}</span>
        <span class="lbp-pred">${pr.pred_team1}–${pr.pred_team2}</span>
        ${actual}${chip}
      </div>`;
    }).join('');

    const hiddenNote = isMe ? '' :
      `<div class="lbp-note">Only locked matches you also predicted are shown.</div>`;
    return body + hiddenNote;
  }

  function onStandingsClick(e) {
    const sortBtn = e.target.closest('[data-sort]');
    if (sortBtn) { S.sortMode = sortBtn.dataset.sort; renderStandings(); return; }
    const exp = e.target.closest('.expand-btn');
    if (exp) {
      const person = exp.dataset.person;
      const panel = standingsEl.querySelector(`[data-preds="${cssEscape(person)}"]`);
      if (!panel) return;
      const opening = panel.classList.contains('hidden');
      if (opening) { panel.innerHTML = playerPredPanel(person); panel.classList.remove('hidden'); }
      else panel.classList.add('hidden');
      exp.classList.toggle('open', opening);
    }
  }

  // ── Countdown ticking ─────────────────────────────────────────────────────────
  function startTicking() {
    if (tickTimer) return;
    tickTimer = setInterval(() => {
      if (!predictEl) return;
      let crossed = false;
      predictEl.querySelectorAll('[data-countdown]').forEach((el) => {
        const iso = el.dataset.countdown;
        const ms = msUntilLock(iso, lockMin());
        if (ms <= 0) { crossed = true; el.textContent = 'locked'; }
        else el.textContent = `locks in ${formatCountdown(ms)}`;
      });
      if (crossed) scheduleReload(); // a match just locked → reveal picks
    }, 1000);
  }

  function noticeCard(title, body) {
    return `<div class="notice-card"><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`;
  }

  // ── Scoring tab: prediction rules, generated from scoring_config ──────────────
  function renderScoringDoc(el) {
    if (!el) return;
    const c = S.cfg;
    el.innerHTML = `
      <h3>Match Predictions <span class="hiw-tag">v2</span></h3>
      <p>Sign in and call the scoreline of any upcoming match. Points are scored
         against the <strong>regulation 90-minute result</strong> — a knockout
         decided in extra time or penalties still counts as the draw it was at 90'.</p>
      <table class="hiw-table">
        <thead><tr><th>Your prediction vs the 90' result</th><th class="pts-col">Points</th></tr></thead>
        <tbody>
          <tr><td>Exact scoreline</td><td class="pts-col">+${c.exact_score}</td></tr>
          <tr><td>Correct result &amp; goal difference (non-draw)</td><td class="pts-col">+${c.correct_gd}</td></tr>
          <tr><td>Correct result only (win / draw / loss)</td><td class="pts-col">+${c.correct_outcome}</td></tr>
          <tr><td>Wrong result</td><td class="pts-col">+0</td></tr>
        </tbody>
      </table>
      <p class="hiw-note">Draws can only score the exact (+${c.exact_score}) or
         correct-result (+${c.correct_outcome}) tier — a predicted draw already
         implies a goal difference of 0, so the GD tier never double-counts.</p>
      <h4>Lock &amp; visibility</h4>
      <ul class="hiw-list">
        <li>Predictions lock <strong>${c.lock_minutes} minutes before kickoff</strong>;
            after that they’re frozen.</li>
        <li>You can edit your pick freely until the lock.</li>
        <li>You can see another player’s pick for a match <strong>only after it locks
            AND only if you predicted that match too</strong> — skin in the game.</li>
      </ul>
      <p class="hiw-note">Your headline total combines team points and prediction
         points (weight ${SCORING_WEIGHTS.team}:${SCORING_WEIGHTS.prediction}).</p>`;
  }

  return {
    init, mount, login, logout, currentUser, isReady,
    setLeaderboard, renderAll, renderStandings, renderPredict, renderScoringDoc,
  };
}

// Minimal CSS.escape fallback for attribute selectors.
function cssEscape(s) {
  return (window.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&');
}
