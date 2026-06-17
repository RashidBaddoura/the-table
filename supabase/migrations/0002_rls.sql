-- ============================================================================
-- The Table v2 — Row-Level Security, triggers, and the count RPC.
-- The client is UNTRUSTED. Every fairness rule lives here.
-- ============================================================================

alter table public.players        enable row level security;
alter table public.matches        enable row level security;
alter table public.predictions    enable row level security;
alter table public.scoring_config enable row level security;

-- service_role bypasses RLS entirely; the policies below govern the anon /
-- authenticated (logged-in player) roles only.

-- ---------------------------------------------------------------------------
-- Helper: does the current user already have a prediction for this match?
-- SECURITY DEFINER so it bypasses RLS on predictions — this is what lets the
-- predictions SELECT policy reference the predictions table WITHOUT recursing.
-- ---------------------------------------------------------------------------
create or replace function public.has_my_prediction(p_match_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.predictions
    where match_key = p_match_key
      and user_id   = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- players: everyone logged in can read all names. No client writes.
-- ---------------------------------------------------------------------------
create policy players_select_all on public.players
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- matches: everyone logged in can read all. Writes are service_role only
-- (ingestion) — handled by RLS bypass, so we add no write policy.
-- ---------------------------------------------------------------------------
create policy matches_select_all on public.matches
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- scoring_config: readable by all logged-in users (the Scoring tab renders it).
-- ---------------------------------------------------------------------------
create policy scoring_config_select_all on public.scoring_config
  for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- predictions — the heart of it.
-- ---------------------------------------------------------------------------

-- SELECT: your own row always; another player's row ONLY IF the match is locked
-- AND you have your own prediction for that same match. (Tightens the user's
-- "once they've predicted" rule by ALSO requiring lock — prevents copy-and-edit
-- during the open window. lock_minutes / is_locked are easy to tune.)
create policy predictions_select on public.predictions
  for select to authenticated
  using (
    user_id = auth.uid()
    or (
      public.is_locked(match_key)
      and public.has_my_prediction(match_key)
    )
  );

-- INSERT: only your own row, only while NOT locked and the match is scheduled.
create policy predictions_insert on public.predictions
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and not public.is_locked(match_key)
    and exists (
      select 1 from public.matches m
      where m.match_key = match_key and m.status = 'scheduled'
    )
  );

-- UPDATE: only your own row, only while NOT locked. (WITH CHECK re-asserts both
-- so you cannot move a row to someone else or past the lock.)
create policy predictions_update on public.predictions
  for update to authenticated
  using (user_id = auth.uid() and not public.is_locked(match_key))
  with check (user_id = auth.uid() and not public.is_locked(match_key));

-- DELETE: your own row, only while not locked.
create policy predictions_delete on public.predictions
  for delete to authenticated
  using (user_id = auth.uid() and not public.is_locked(match_key));

-- ---------------------------------------------------------------------------
-- Triggers — enforce immutability-after-lock and column-level write rules in
-- the DB itself (defence in depth; triggers run even for service_role).
-- ---------------------------------------------------------------------------
create or replace function public.predictions_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_service boolean := coalesce(auth.role() = 'service_role', false);
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    new.updated_at := now();
    -- Only the scoring job (service_role) may set scoring columns.
    if not is_service then
      new.points_awarded := null;
      new.scored_at      := null;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' then
    if not is_service then
      -- Players cannot touch a locked prediction at all.
      if public.is_locked(old.match_key) then
        raise exception 'prediction for % is locked', old.match_key
          using errcode = 'check_violation';
      end if;
      -- Players cannot self-award points.
      new.points_awarded := old.points_awarded;
      new.scored_at      := old.scored_at;
      new.created_at     := old.created_at;
      new.updated_at     := now();
    end if;
    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists predictions_guard_trg on public.predictions;
create trigger predictions_guard_trg
  before insert or update on public.predictions
  for each row execute function public.predictions_guard();

-- Block player deletes of locked rows at the trigger level too.
create or replace function public.predictions_delete_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(auth.role() = 'service_role', false) = false
     and public.is_locked(old.match_key) then
    raise exception 'prediction for % is locked', old.match_key
      using errcode = 'check_violation';
  end if;
  return old;
end;
$$;

drop trigger if exists predictions_delete_guard_trg on public.predictions;
create trigger predictions_delete_guard_trg
  before delete on public.predictions
  for each row execute function public.predictions_delete_guard();

-- ---------------------------------------------------------------------------
-- prediction_counts(): how many players have predicted each match.
-- Returns COUNTS ONLY — never rows — so it leaks no scoreline content. Safe to
-- expose to all logged-in users for the "N of 14 predicted" badge.
-- ---------------------------------------------------------------------------
create or replace function public.prediction_counts()
returns table (match_key text, n bigint)
language sql
stable
security definer
set search_path = public
as $$
  select match_key, count(*) as n
  from public.predictions
  group by match_key;
$$;

-- ---------------------------------------------------------------------------
-- prediction_totals(): each player's TOTAL prediction points (scored matches).
-- Returns aggregate sums only — never individual scorelines — so it is safe to
-- expose for the combined leaderboard even though per-row visibility is gated.
-- ---------------------------------------------------------------------------
create or replace function public.prediction_totals()
returns table (user_id uuid, total bigint)
language sql
stable
security definer
set search_path = public
as $$
  select user_id, coalesce(sum(points_awarded), 0) as total
  from public.predictions
  where points_awarded is not null
  group by user_id;
$$;

grant execute on function public.is_locked(text)          to authenticated;
grant execute on function public.has_my_prediction(text)  to authenticated;
grant execute on function public.prediction_counts()      to authenticated;
grant execute on function public.prediction_totals()      to authenticated;
