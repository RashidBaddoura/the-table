import { scorePrediction } from './scoring.js';

/**
 * Recompute points_awarded for every prediction on every FINISHED match.
 * Idempotent + re-runnable: only writes a row when the computed points differ
 * from what's stored, so result corrections (re-ingest) simply re-settle.
 *
 * `admin` is a service_role supabase-js client (bypasses RLS; the trigger lets
 * service_role write the scoring columns).
 *
 * Returns { matches, updated }.
 */
export async function runScoring(admin) {
  const { data: cfgRows, error: cfgErr } = await admin
    .from('scoring_config').select('key,value');
  if (cfgErr) throw cfgErr;
  const cfg = Object.fromEntries(cfgRows.map((r) => [r.key, r.value]));

  const { data: matches, error: mErr } = await admin
    .from('matches')
    .select('match_key,ft_team1,ft_team2')
    .eq('status', 'finished')
    .not('ft_team1', 'is', null)
    .not('ft_team2', 'is', null);
  if (mErr) throw mErr;

  let updated = 0;
  for (const m of matches) {
    const { data: preds, error: pErr } = await admin
      .from('predictions')
      .select('id,pred_team1,pred_team2,points_awarded')
      .eq('match_key', m.match_key);
    if (pErr) throw pErr;

    for (const p of preds) {
      const pts = scorePrediction(
        p.pred_team1, p.pred_team2, m.ft_team1, m.ft_team2, cfg
      );
      if (p.points_awarded !== pts) {
        const { error: uErr } = await admin
          .from('predictions')
          .update({ points_awarded: pts, scored_at: new Date().toISOString() })
          .eq('id', p.id);
        if (uErr) throw uErr;
        updated++;
      }
    }
  }
  return { matches: matches.length, updated };
}
