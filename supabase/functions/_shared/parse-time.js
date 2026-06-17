// Pure, dependency-free. Imported by the ingest Edge Function (Deno) AND by the
// Node test runner (tests/parse-time.test.mjs). No build step.

/**
 * Parse an openfootball "HH:MM UTC±N" time on a given "YYYY-MM-DD" date into a
 * correct UTC instant, handling midnight crossings in BOTH directions.
 *
 *   parseKickoffUtc('2026-06-11', '13:00 UTC-6') -> Date 2026-06-11T19:00:00Z
 *   parseKickoffUtc('2026-06-25', '20:00 UTC-6') -> Date 2026-06-26T02:00:00Z
 *
 * Returns a Date, or null if the time string is malformed.
 */
export function parseKickoffUtc(date, timeStr) {
  const m = String(timeStr).match(/^(\d{1,2}):(\d{2})\s+UTC([+-])(\d+)/);
  if (!m) return null;
  const [, h, min, sign, off] = m;
  const localMin  = parseInt(h, 10) * 60 + parseInt(min, 10);
  const offsetMin = parseInt(off, 10) * 60 * (sign === '+' ? 1 : -1);
  const rawUtcMin = localMin - offsetMin;
  const dayOffset = rawUtcMin >= 1440 ? 1 : rawUtcMin < 0 ? -1 : 0;
  const utcMin    = ((rawUtcMin % 1440) + 1440) % 1440;
  const utcH = Math.floor(utcMin / 60);
  const utcM = utcMin % 60;
  const base = new Date(`${date}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + dayOffset);
  const d = base.toISOString().slice(0, 10);
  return new Date(
    `${d}T${String(utcH).padStart(2, '0')}:${String(utcM).padStart(2, '0')}:00Z`
  );
}

/** Convenience: ISO string form for upserting into a timestamptz column. */
export function parseKickoffIso(date, timeStr) {
  const d = parseKickoffUtc(date, timeStr);
  return d ? d.toISOString() : null;
}
