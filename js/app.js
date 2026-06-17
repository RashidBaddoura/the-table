import { ROSTER, MANUAL_ADJUSTMENTS, EVENTS } from './config.js';
import { computeLeaderboard, buildOwnerMap } from './scoring.js';
import { loadData } from './data.js';
import {
  renderLeaderboard, renderMatches, renderResults, renderHowItWorks, renderStatus,
} from './ui.js';
import { createPredictions } from './predict.js';

// ─── DOM refs ─────────────────────────────────────────────────────────────────
const statusBar     = document.getElementById('status-bar');
const lastUpdatedEl = document.getElementById('last-updated');
const navBtns       = document.querySelectorAll('.nav-btn');
const tabPanels     = document.querySelectorAll('.tab-panel');
const refreshBtn    = document.getElementById('refresh-btn');

const lbLoading  = document.getElementById('leaderboard-loading');
const lbContent  = document.getElementById('leaderboard-content');
const mLoading   = document.getElementById('matches-loading');
const mContent   = document.getElementById('matches-content');
const rLoading   = document.getElementById('results-loading');
const rContent   = document.getElementById('results-content');
const hiwContent = document.getElementById('how-it-works-content');
const predContent     = document.getElementById('predict-content');
const predScoringEl   = document.getElementById('prediction-scoring-content');
const userChip        = document.getElementById('user-chip');
const userChipName    = document.getElementById('user-chip-name');
const logoutBtn       = document.getElementById('logout-btn');
const toastEl         = document.getElementById('toast');

// ─── Toast ──────────────────────────────────────────────────────────────────
let toastTimer = null;
function toast(msg) {
  if (!toastEl) return;
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  requestAnimationFrame(() => toastEl.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.remove('show');
    setTimeout(() => toastEl.classList.add('hidden'), 300);
  }, 3500);
}

// ─── Predictions controller (v2) ──────────────────────────────────────────────
const predictions = createPredictions({
  toast,
  onStandingsDirty: () => { updateStandings(); refreshUserChip(); },
});
predictions.mount({ predict: predContent, standings: lbContent });

let latestLeaderboard = [];

// Choose standings renderer: combined (logged in) vs v1 team-only.
function updateStandings() {
  if (!latestLeaderboard.length) return;
  lbLoading?.classList.add('hidden');
  lbContent.classList.remove('hidden');
  predictions.setLeaderboard(latestLeaderboard);
  if (predictions.isReady() && predictions.currentUser()) {
    predictions.renderStandings();
  } else {
    renderLeaderboard(latestLeaderboard, lbContent);
  }
}

function refreshUserChip() {
  const u = predictions.currentUser();
  if (u && userChip) {
    userChipName.textContent = String(u.display_name).toLowerCase();
    userChip.classList.remove('hidden');
  } else if (userChip) {
    userChip.classList.add('hidden');
  }
}

logoutBtn?.addEventListener('click', async () => {
  await predictions.logout();
  updateStandings();
  refreshUserChip();
});

// ─── Tab switching ────────────────────────────────────────────────────────────
navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === target));
    tabPanels.forEach((p) => p.classList.toggle('active', p.id === `tab-${target}`));
  });
});

// ─── Render pipeline ──────────────────────────────────────────────────────────
const ownerMap = buildOwnerMap(ROSTER);
renderHowItWorks(hiwContent);

function render(data, source) {
  renderStatus(source, null, statusBar);

  if (!data?.matches?.length) {
    if (source === 'error') {
      lbLoading.innerHTML = '<p class="error-state">Failed to load data.</p>';
      mLoading.innerHTML  = '<p class="error-state">Failed to load data.</p>';
      rLoading.innerHTML  = '<p class="error-state">Failed to load data.</p>';
    }
    return;
  }

  const { leaderboard } = computeLeaderboard(data.matches, ROSTER, MANUAL_ADJUSTMENTS);
  latestLeaderboard = leaderboard;

  // Standings (combined or team-only depending on login).
  updateStandings();

  // Upcoming matches
  mLoading.classList.add('hidden');
  mContent.classList.remove('hidden');
  renderMatches(data.matches, ownerMap, mContent);

  // Results
  rLoading.classList.add('hidden');
  rContent.classList.remove('hidden');
  renderResults(data.matches, ownerMap, MANUAL_ADJUSTMENTS, EVENTS, rContent);

  // Last-updated footer
  lastUpdatedEl.textContent = `Updated ${new Date().toLocaleTimeString(undefined, {
    hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
  })} · ${source === 'live' ? 'Live data' : 'Cached snapshot'}`;
}

// ─── Refresh button ───────────────────────────────────────────────────────────
let refreshing = false;
if (refreshBtn) {
  refreshBtn.addEventListener('click', async () => {
    if (refreshing) return;
    refreshing = true;
    refreshBtn.classList.add('spinning');
    await loadData(render);
    refreshing = false;
    refreshBtn.classList.remove('spinning');
  });
}

// ─── Boot ─────────────────────────────────────────────────────────────────────
loadData(render);

predictions.init().then(() => {
  predictions.renderPredict();
  predictions.renderScoringDoc(predScoringEl);
  updateStandings();
  refreshUserChip();
}).catch((err) => {
  console.warn('Predictions init failed (v1 site still works):', err);
  predictions.renderPredict();
  predictions.renderScoringDoc(predScoringEl);
});
