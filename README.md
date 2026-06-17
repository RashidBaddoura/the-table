# The Table — World Cup 2026 Fantasy Leaderboard

A static, zero-dependency website that tracks your friend group's World Cup
fantasy competition. Live match data flows in from
[openfootball/worldcup.json](https://github.com/openfootball/worldcup.json)
straight in the browser — no server, no API key.

---

## Deploying to GitHub Pages

1. Push this repository to GitHub.
2. Go to **Settings → Pages**.
3. Under *Source*, choose **Deploy from a branch**.
4. Set branch to **`main`** and folder to **`/ (root)`**.
5. Click **Save**. Your site will be live at:
   ```
   https://<your-username>.github.io/<repo-name>/
   ```
   All links and asset paths are relative, so the sub-path works automatically.

> **That's it.** The page fetches live data on every load — no build step needed.

---

## Editing the Roster

Open **`js/config.js`** and update the `ROSTER` object:

```js
export const ROSTER = {
  alice: ['Brazil', 'France', 'Japan'],
  bob:   ['Spain', 'Germany', 'Argentina'],
  // … one entry per person, exactly 3 teams each
};
```

**Team name rules:**
- Names must match the openfootball dataset exactly (they are listed in the
  "How It Works" tab on the live site).
- At page load the console will warn about any team that doesn't match:
  `[ROSTER MISMATCH] alice's team "Braziil" not found in dataset`

After saving, commit and push — GitHub Pages re-deploys automatically.

---

## Tuning Point Values

All scoring lives in the **`SCORING`** object in `js/config.js`:

```js
export const SCORING = {
  group: { win: 3, draw: 1, loss: 0 },
  progression: {
    'Round of 32':   4,
    'Round of 16':   6,
    'Quarterfinals': 9,
    'Semifinals':    13,
    'Final':         18,
    'Champion':      25,   // awarded ON TOP OF the Final bonus
  },
};
```

Change any number and push. The "Scoring" tab on the live site is generated
from this same object, so the explanation always matches the real values.

---

## How the Data Refresh Works

### Live fetch (primary path)
Every time someone opens the site, the browser fetches the latest JSON from
openfootball directly. This is the live path and requires no server.

### Committed snapshot (instant render + fallback)
`data/worldcup.json` is a local copy committed to the repo.  The page loads
it first (for an instant render), then overwrites with the live response.
If the live fetch fails, the page shows a banner and keeps using the snapshot.

### Keeping the snapshot fresh

**GitHub Action (automatic):** `.github/workflows/update-data.yml` runs every
30 minutes during the tournament and commits a fresh snapshot if the data
changed. Enable it by going to **Actions** in your repo and confirming you
want to allow workflows.

**Manual update:**
```bash
node scripts/update-data.js   # requires Node 18+
git add data/worldcup.json
git commit -m "chore: update data"
git push
```

---

## File Structure

```
index.html                  ← single-page app (leaderboard / matches / scoring)
css/style.css               ← all styles (mobile-first)
js/
  config.js                 ← ROSTER, SCORING, FLAGS — edit here
  scoring.js                ← point computation logic
  data.js                   ← live + fallback fetch
  ui.js                     ← DOM rendering
  app.js                    ← wires everything together
data/
  worldcup.json             ← committed snapshot (updated by Action)
scripts/
  update-data.js            ← Node 18+ script to refresh the snapshot
.github/workflows/
  update-data.yml           ← scheduled GitHub Action
```

---

## Local Development

Open `index.html` directly in a browser — it will fetch the live data.
If your browser blocks `file://` fetches you can run a tiny local server:

```bash
# Python 3
python -m http.server 8080
# Node (npx)
npx serve .
```

Then open `http://localhost:8080`.

---

# v2 — Logins & Match Predictions (Supabase backend)

v2 adds authenticated, server-enforced **scoreline predictions** on top of the v1
team leaderboard. The frontend stays on GitHub Pages (still vanilla JS, no build
step); a **Supabase** project provides Auth + Postgres + Row-Level Security +
Realtime + scheduled ingestion. **Until you paste your Supabase URL + anon key
into `js/config.js`, the predictions features stay dormant and the v1 site works
exactly as before** — so you can deploy the frontend before the backend exists.

### Architecture in one paragraph
The browser talks to Supabase with the **public anon key** (committed on purpose
— security is enforced by RLS, never by hiding the key). Every fairness rule —
when a prediction locks, who can see whose pick, immutability after lock, and the
authoritative points — lives in the database (RLS policies, CHECK constraints,
triggers, and SQL/Edge functions). The client is treated as untrusted. The secret
**service_role** key is used only by the seed/admin scripts and the Edge Functions.

### What's in the repo

```
supabase/
  migrations/
    0001_schema.sql     ← tables, indexes, is_locked()
    0002_rls.sql        ← RLS policies, triggers, count/totals RPCs  (the core)
    0003_cron.sql       ← pg_cron schedule that calls the ingest function
  functions/
    _shared/parse-time.js   ← "HH:MM UTC±N" → UTC  (unit-tested)
    _shared/scoring.js      ← prediction scoring + match_key  (unit-tested)
    _shared/run-scoring.js  ← idempotent settle of points_awarded
    ingest/index.ts         ← fetch openfootball → upsert matches → settle scores
    score/index.ts          ← manual "recompute all points" lever
scripts/
  seed-players.mjs      ← provision the auth users + players rows
  reset-code.mjs        ← reset one player's 6-digit code
  sync-supabase.mjs     ← fetch openfootball → upsert matches → settle scores
                          (run locally or by the GitHub Action; no CLI needed)
  players.example.json  ← copy to players.local.json (gitignored) and edit
  admin.example.json    ← copy to admin.local.json (gitignored): url + service key
js/
  config.js             ← SUPABASE_URL / SUPABASE_ANON_KEY / SCORING_WEIGHTS
  supabase.js           ← lazy client + auth + queries + realtime
  predict.js            ← Predict tab, combined standings, countdowns, visibility
  lock.js               ← client mirror of is_locked()  (unit-tested)
tests/                  ← node --test:  parse-time, scoring tiers, lock
```

### Scoring (single source of truth)
Point values live in the **`scoring_config`** table. Both the DB scoring logic
and the Scoring tab read from it, so docs can't drift. Defaults:

| Your prediction vs the **90-minute** result | Points |
|---|---|
| Exact scoreline | +5 |
| Correct result **and** goal difference (non-draw) | +3 |
| Correct result only | +2 |
| Wrong result | 0 |

Knockout matches decided in ET/penalties are scored on the **90' result** (an ET
match counts as the draw it was at 90'). Draws can only hit the exact or
correct-result tier. **Lock:** predictions freeze `lock_minutes` (default 60)
before kickoff. **Visibility:** you can see another player's pick for a match only
**after it locks and only if you predicted that match too.**

To re-tune: `update scoring_config set value = 7 where key = 'exact_score';`
then run the `score` function once to re-settle.

### Run the tests
```bash
npm test          # node --test "tests/**/*.test.mjs"  — no install needed
```

### One-time Supabase setup
Full click-by-click guide: **`supabase/SETUP.md`**. The easy path (no Supabase
CLI, no Edge Functions, no cron) in short: create the project → run migrations
`0001` + `0002` in the SQL Editor → disable sign-ups → put your URL + service key
in `scripts/admin.local.json` → `node scripts/seed-players.mjs` →
`node scripts/sync-supabase.mjs` → add the two GitHub Action secrets → paste URL
+ anon key into `js/config.js` → push. The GitHub Action then syncs every 30 min.
