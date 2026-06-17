// Edge Function: score
// Re-settles points for every prediction on every finished match. Idempotent
// and safe to run any time (cron, manual, or after a result correction).
// ingest also calls runScoring after each upsert, so this is mostly a manual
// "recompute everything" lever.

// @ts-ignore - remote ESM import resolved by Deno at deploy time
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { runScoring } from '../_shared/run-scoring.js';

// @ts-ignore - Deno global
const env = (k: string) => (globalThis as any).Deno.env.get(k);

// @ts-ignore - Deno global
(globalThis as any).Deno.serve(async (_req: Request) => {
  try {
    const admin = createClient(
      env('SUPABASE_URL'),
      env('SUPABASE_SERVICE_ROLE_KEY'),
      { auth: { persistSession: false } }
    );
    const result = await runScoring(admin);
    return Response.json({ ok: true, ...result });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
});
