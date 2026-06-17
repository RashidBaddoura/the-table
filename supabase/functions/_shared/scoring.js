// Pure, dependency-free prediction scoring + match-key derivation.
// Imported by the score/ingest Edge Functions (Deno) AND by the Node tests.
// This is the authoritative scoring logic; the score Edge Function writes the
// numbers it produces, and the frontend only renders them.

/** lowercase, strip accents, drop everything non-alphanumeric. */
export function slug(str) {
  return String(str)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Deterministic, stable key once both teams are known:
 *   slug(date)__slug(team1)__slug(team2)
 * e.g. ('2026-06-11','Mexico','South Africa') -> '20260611__mexico__southafrica'
 */
export function makeMatchKey(date, team1, team2) {
  return `${slug(date)}__${slug(team1)}__${slug(team2)}`;
}

const sign = (n) => (n > 0 ? 1 : n < 0 ? -1 : 0);

/**
 * Score a single prediction against the REGULATION 90-minute full-time score.
 * (Knockout matches decided in ET/penalties are still scored on the 90' result,
 *  so an ET match counts as the draw it was at 90' — by design.)
 *
 * cfg = { exact_score, correct_gd, correct_outcome, wrong_outcome }
 *
 * Tiers:
 *   exact scoreline            -> exact_score
 *   correct outcome + correct GD (non-draw, not exact) -> correct_gd
 *   correct outcome only       -> correct_outcome
 *   wrong outcome              -> wrong_outcome
 * Draws never reach the GD tier (a predicted draw already implies GD 0), so
 * there is no double counting.
 */
export function scorePrediction(p1, p2, a1, a2, cfg) {
  const C = {
    exact_score: 5, correct_gd: 3, correct_outcome: 2, wrong_outcome: 0, ...cfg,
  };
  if (p1 === a1 && p2 === a2) return C.exact_score;

  const predOutcome = sign(p1 - p2);
  const actOutcome  = sign(a1 - a2);
  if (predOutcome !== actOutcome) return C.wrong_outcome;

  // Same outcome, not exact.
  if (actOutcome === 0) return C.correct_outcome;            // actual draw
  if (p1 - p2 === a1 - a2) return C.correct_gd;              // matched GD
  return C.correct_outcome;
}
