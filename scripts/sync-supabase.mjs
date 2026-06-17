// Sync openfootball → Supabase: upsert matches, then settle prediction points.
// This replaces the need for Supabase Edge Functions + pg_cron — the GitHub
// Action runs it on a schedule, and you can run it locally any time to refresh.
//
// Credentials come from scripts/admin.local.json (local) or env vars (CI):
//   { "url": "https://<ref>.supabase.co", "serviceRoleKey": "<service_role>" }
//
//   node scripts/sync-supabase.mjs

import { env } from './_admin.mjs';
import { buildMatchRows } from '../supabase/functions/_shared/ingest.js';
import { scorePrediction } from '../supabase/functions/_shared/scoring.js';

const OPENFOOTBALL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

const { url, key } = env();
const H = { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };

async function rest(method, path, body, extraHeaders = {}) {
  const res = await fetch(`${url}/rest/v1/${path}`, {
    method, headers: { ...H, ...extraHeaders },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`${method} ${path} → HTTP ${res.status}: ${await res.text()}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// 1) Fetch openfootball and upsert matches.
const ofRes = await fetch(OPENFOOTBALL, { headers: { 'cache-control': 'no-cache' } });
if (!ofRes.ok) throw new Error(`openfootball HTTP ${ofRes.status}`);
const data = await ofRes.json();
const rows = buildMatchRows(data.matches ?? []);
await rest('POST', 'matches?on_conflict=match_key', rows,
  { Prefer: 'resolution=merge-duplicates,return=minimal' });
console.log(`✓ upserted ${rows.length} matches`);

// 2) Settle prediction points for finished matches (idempotent).
const cfgRows = await rest('GET', 'scoring_config?select=key,value');
const cfg = Object.fromEntries(cfgRows.map((r) => [r.key, r.value]));

const finished = await rest('GET',
  'matches?status=eq.finished&ft_team1=not.is.null&select=match_key,ft_team1,ft_team2');
const ftByKey = new Map(finished.map((m) => [m.match_key, m]));

const preds = await rest('GET',
  'predictions?select=id,match_key,pred_team1,pred_team2,points_awarded');

let updated = 0;
for (const p of preds) {
  const m = ftByKey.get(p.match_key);
  if (!m) continue;
  const pts = scorePrediction(p.pred_team1, p.pred_team2, m.ft_team1, m.ft_team2, cfg);
  if (p.points_awarded !== pts) {
    await rest('PATCH', `predictions?id=eq.${p.id}`,
      { points_awarded: pts, scored_at: new Date().toISOString() },
      { Prefer: 'return=minimal' });
    updated++;
  }
}
console.log(`✓ scored ${finished.length} finished match(es), updated ${updated} prediction(s)`);
console.log('Done.');
