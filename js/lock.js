// Client-side mirror of the SQL is_locked() function. The arithmetic is
// identical (now >= kickoff - lock_minutes), so countdowns and the server agree.
// The SERVER is always authoritative; this is only for display/UX.

export function lockAtMs(kickoffIso, lockMinutes) {
  return Date.parse(kickoffIso) - lockMinutes * 60_000;
}

export function isLocked(kickoffIso, lockMinutes, now = Date.now()) {
  return now >= lockAtMs(kickoffIso, lockMinutes);
}

export function msUntilLock(kickoffIso, lockMinutes, now = Date.now()) {
  return lockAtMs(kickoffIso, lockMinutes) - now;
}

/** "2d 4h", "3h 12m", "8m 04s", or "locked". */
export function formatCountdown(ms) {
  if (ms <= 0) return 'locked';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${String(sec).padStart(2, '0')}s`;
}
