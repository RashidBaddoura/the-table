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
