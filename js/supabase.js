// Supabase access layer for The Table v2 (predictions).
//
// supabase-js is imported LAZILY (dynamic import of the CDN ESM build) so that
// if Supabase isn't configured yet, or the CDN/network is unavailable, the v1
// leaderboard/schedule/results still load completely. Nothing here throws at
// module-load time.

import {
  SUPABASE_URL, SUPABASE_ANON_KEY, LOGIN_EMAIL_DOMAIN,
} from './config.js';

const SUPABASE_JS = 'https://esm.sh/@supabase/supabase-js@2';

export function isConfigured() {
  return (
    !!SUPABASE_URL && !/YOUR-/.test(SUPABASE_URL) &&
    !!SUPABASE_ANON_KEY && !/YOUR-/.test(SUPABASE_ANON_KEY)
  );
}

export function slug(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}
export function emailFor(displayName) {
  return `${slug(displayName)}@${LOGIN_EMAIL_DOMAIN}`;
}

let _clientPromise = null;
async function client() {
  if (!isConfigured()) throw new Error('Supabase is not configured.');
  if (!_clientPromise) {
    _clientPromise = import(SUPABASE_JS).then(({ createClient }) =>
      createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true },
      })
    );
  }
  return _clientPromise;
}

// ─── Auth ──────────────────────────────────────────────────────────────────
let _displayName = null;

export async function signIn(displayName, code) {
  const sb = await client();
  const { error } = await sb.auth.signInWithPassword({
    email: emailFor(displayName), password: String(code),
  });
  if (error) throw error;
  _displayName = displayName;
  return getSessionUser();
}

export async function signOut() {
  const sb = await client();
  await sb.auth.signOut();
  _displayName = null;
}

// Returns { id, display_name } for the logged-in user, or null.
export async function getSessionUser() {
  if (!isConfigured()) return null;
  const sb = await client();
  const { data: { session } } = await sb.auth.getSession();
  if (!session?.user) return null;
  if (!_displayName) {
    const { data } = await sb.from('players')
      .select('display_name').eq('id', session.user.id).maybeSingle();
    _displayName = data?.display_name ?? session.user.email?.split('@')[0] ?? null;
  }
  return { id: session.user.id, display_name: _displayName };
}

export async function onAuthChange(cb) {
  const sb = await client();
  sb.auth.onAuthStateChange(() => { cb(); });
}

// ─── Reads ───────────────────────────────────────────────────────────────────
export async function getScoringConfig() {
  const sb = await client();
  const { data, error } = await sb.from('scoring_config').select('key,value');
  if (error) throw error;
  return Object.fromEntries(data.map((r) => [r.key, r.value]));
}

export async function getPlayers() {
  const sb = await client();
  const { data, error } = await sb.from('players').select('id,display_name');
  if (error) throw error;
  return data;
}

export async function getMatches() {
  const sb = await client();
  const { data, error } = await sb.from('matches').select('*');
  if (error) throw error;
  return data;
}

// All predictions the RLS policy lets me see: my own (any match) + others' only
// on matches that are locked AND that I predicted.
export async function getVisiblePredictions() {
  const sb = await client();
  const { data, error } = await sb.from('predictions')
    .select('id,match_key,user_id,pred_team1,pred_team2,points_awarded,scored_at');
  if (error) throw error;
  return data;
}

// Per-match predicted counts (counts only — no content leak).
export async function getCounts() {
  const sb = await client();
  const { data, error } = await sb.rpc('prediction_counts');
  if (error) throw error;
  const map = new Map();
  for (const r of data) map.set(r.match_key, Number(r.n));
  return map;
}

// Per-player prediction-point totals (aggregate sums only) for the combined
// leaderboard. Keyed by user_id.
export async function getPredictionTotals() {
  const sb = await client();
  const { data, error } = await sb.rpc('prediction_totals');
  if (error) throw error;
  const map = new Map();
  for (const r of data) map.set(r.user_id, Number(r.total));
  return map;
}

// ─── Writes ────────────────────────────────────────────────────────────────────
export async function upsertPrediction(matchKey, p1, p2) {
  const sb = await client();
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  const { error } = await sb.from('predictions').upsert(
    { user_id: user.id, match_key: matchKey, pred_team1: p1, pred_team2: p2 },
    { onConflict: 'user_id,match_key' }
  );
  if (error) throw error;
}

export async function deletePrediction(matchKey) {
  const sb = await client();
  const user = await getSessionUser();
  if (!user) throw new Error('Not signed in.');
  const { error } = await sb.from('predictions')
    .delete().eq('user_id', user.id).eq('match_key', matchKey);
  if (error) throw error;
}

// ─── Realtime ──────────────────────────────────────────────────────────────────
// Fire `cb` (debounced by the caller) whenever predictions or matches change.
export async function subscribeChanges(cb) {
  const sb = await client();
  return sb.channel('the-table-v2')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'predictions' }, cb)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, cb)
    .subscribe();
}
