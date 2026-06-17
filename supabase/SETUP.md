# The Table v2 — Supabase setup runbook

Bring the predictions backend online. **Recommended path needs no Supabase CLI,
no Edge Functions, and no cron** — your existing GitHub Action does the syncing.
You only use a website (the Supabase dashboard) plus a couple of `node` commands
(Node is already on your machine). ~25 minutes.

> Advanced alternative (Edge Functions + pg_cron) is in the "Advanced" section
> at the bottom; most owners should ignore it.

---

## 1. Create the project
1. <https://supabase.com> → sign in → **New project**. Name it, set a database
   password (save it somewhere), pick a nearby region, **Create**. Wait ~2 min.
2. Left sidebar → **Project Settings** (gear) → **API**. Keep this tab open; you'll
   copy three values:
   - **Project URL** — `https://<ref>.supabase.co`
   - **anon public** key — safe to publish (goes in the frontend)
   - **service_role** key — SECRET. Never commit or paste into the website code.

## 2. Create the tables (SQL Editor)
Left sidebar → **SQL Editor** → **+ New query**. For each file below: open it from
this repo, copy ALL the text, paste, click **Run**. Do them in order:
1. `supabase/migrations/0001_schema.sql`
2. `supabase/migrations/0002_rls.sql`

Check it worked — new query, run `select * from scoring_config;` → 6 rows.

## 3. Lock down sign-ups (friends only)
Left sidebar → **Authentication** → **Sign In / Providers** → **Email**: leave Email
enabled but turn **"Allow new users to sign up"** OFF, **Save**. Now only accounts
you create (next step) can log in.

## 4. Put your credentials in one local file
In the repo, copy `scripts/admin.example.json` to `scripts/admin.local.json`
(this file is gitignored — it never gets uploaded). Edit it to your real values:
```json
{ "url": "https://<ref>.supabase.co", "serviceRoleKey": "<service_role key>" }
```

## 5. Create the players + their codes
Copy `scripts/players.example.json` to `scripts/players.local.json` and set each
person's real 6-digit code. Names must match `ROSTER` in `js/config.js` exactly.
Then, in a terminal opened in the repo folder:
```
node scripts/seed-players.mjs scripts/players.local.json
```
You should see a ✓ per player. Share codes privately. Change one later with:
`node scripts/reset-code.mjs <name> <new6digitcode>`.

## 6. Load the matches (and score anything finished)
```
node scripts/sync-supabase.mjs
```
Expect `✓ upserted 104 matches`. (Run this any time to refresh manually.)

## 7. Keep it updating automatically (GitHub Action)
On github.com, open your repo → **Settings** → **Secrets and variables** →
**Actions** → **New repository secret**, add two:
- `SUPABASE_URL` = your project URL
- `SUPABASE_SERVICE_ROLE_KEY` = your service_role key

The existing every-30-min Action now also syncs Supabase. (No secrets = it skips
that step, so nothing breaks.)

## 8. Turn the predictions on in the site
Edit `js/config.js`:
```js
export const SUPABASE_URL      = 'https://<ref>.supabase.co';
export const SUPABASE_ANON_KEY = '<anon public key>';   // public on purpose
```
Commit and push. GitHub Pages redeploys; the **Predict** tab and combined
standings go live.

---

## Acceptance checks (verify by hand)
1. Didn't predict a match → you never see others' picks for it, even after it ends.
2. Both predicted while open → you see others' picks only after it locks (1h pre-kickoff).
3. Within 1h of kickoff, predictions are frozen (the form disables; the server also rejects).
4. After a result lands (run step 6), each pick shows correct points + green/red.
5. Standings combined totals update without a manual reload.

## Troubleshooting
- **Predict tab says "offline":** `js/config.js` still has `YOUR-…` placeholders.
- **Login fails for all:** sign-ups weren't disabled before seeding, or names don't
  match `ROSTER`. Re-run `seed-players.mjs` (safe to repeat).
- **Predict tab empty:** run `node scripts/sync-supabase.mjs`.
- **Points not updating:** run `node scripts/sync-supabase.mjs`; confirm the GitHub
  secrets in step 7.

---

## Advanced (optional): Supabase-native cron instead of the GitHub Action
If you'd rather Supabase pull the data itself:
1. Install the CLI: `npm i -g supabase`, then `supabase login` and
   `supabase link --project-ref <ref>`.
2. `supabase secrets set SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=…`
3. `supabase functions deploy ingest && supabase functions deploy score`
4. In SQL Editor, store Vault secrets then run `0003_cron.sql`:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<service_role key>',        'service_role_key');
   ```
This path and the GitHub Action do the same job — don't run both.
