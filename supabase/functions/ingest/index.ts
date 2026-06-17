// Edge Function: ingest  (OPTIONAL / advanced path)
// Fetches the openfootball 2026 dataset, upserts public.matches, then settles
// scoring. Idempotent. Most owners can skip this entirely and let the GitHub
// Action run scripts/sync-supabase.mjs instead (see README v2). This exists for
// owners who prefer Supabase-native cron (supabase/migrations/0003_cron.sql).

// @ts-ignore - remote ESM import resolved by Deno at deploy time
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { buildMatchRows } from '../_shared/ingest.js';
import { runScoring } from '../_shared/run-scoring.js';

// @ts-ignore - Deno global
const env = (k: string) => (globalThis as any).Deno.env.get(k);

const OPENFOOTBALL =
  'https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json';

// @ts-ignore - Deno global
(globalThis as any).Deno.serve(async (_req: Request) => {
  try {
    const admin = createClient(
      env('SUPABASE_URL'),
      env('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );

    const res = await fetch(OPENFOOTBALL, { headers: { 'cache-control': 'no-cache' } });
    if (!res.ok) throw new Error(`openfootball HTTP ${res.status}`);
    const data = await res.json();
    const rows = buildMatchRows(data.matches ?? []);

    const { error: upErr } = await admin
      .from('matches').upsert(rows, { onConflict: 'match_key' });
    if (upErr) throw upErr;

    const scoring = await runScoring(admin);
    return Response.json({ ok: true, ingested: rows.length, ...scoring });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
