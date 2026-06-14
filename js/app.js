import { ROSTER, MANUAL_ADJUSTMENTS } from './config.js';
import { computeLeaderboard, buildOwnerMap } from './scoring.js';
import { loadData } from './data.js';
import {
  renderLeaderboard, renderMatches, renderResults, renderHowItWorks, renderStatus,
} from './ui.js';

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

// ─── Tab switching ────────────────────────────────────────────────────────────
navBtns.forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = btn.dataset.tab;
    navBtns.forEach((b) => b.classList.toggle('active', b.dataset.tab === target));
    tabPanels.forEach((p) =>
      p.classList.toggle('active', p.id === `tab-${target}`)
    );
  });
});

// ─── Render pipeline ──────────────────────────────────────────────────────────
const ownerMap = buildOwnerMap(ROSTER);

// Render "How It Works" once immediately (no data needed).
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

  // Leaderboard
  lbLoading.classList.add('hidden');
  lbContent.classList.remove('hidden');
  renderLeaderboard(leaderboard, lbContent);

  // Upcoming matches
  mLoading.classList.add('hidden');
  mContent.classList.remove('hidden');
  renderMatches(data.matches, ownerMap, mContent);

  // Results
  rLoading.classList.add('hidden');
  rContent.classList.remove('hidden');
  renderResults(data.matches, ownerMap, MANUAL_ADJUSTMENTS, rContent);

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
