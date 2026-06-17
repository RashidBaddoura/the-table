-- ============================================================================
-- The Table v2 — schema
-- Tables: players, matches, predictions, scoring_config
-- Plus the is_locked() helper that RLS, scoring, and the UI all agree on.
-- ============================================================================

-- scoring_config is the SINGLE SOURCE OF TRUTH for point values and the lock
-- window. The scoring function and the frontend "Scoring" tab both read it, so
-- documentation can never drift from behaviour.
create table if not exists public.scoring_config (
  key   text primary key,
  value int  not null
);

-- Defaults (see §6 of the spec). Re-running is safe.
insert into public.scoring_config (key, value) values
  ('exact_score',      5),   -- exact scoreline
  ('correct_gd',       3),   -- correct goal difference, non-draw, not exact
  ('correct_outcome',  2),   -- correct winner / draw tendency only
  ('wrong_outcome',    0),   -- nothing
  ('lock_minutes',    60),   -- predictions lock this many minutes before kickoff
  ('max_goals',       30)    -- per-side goal input ceiling
on conflict (key) do nothing;

-- ---------------------------------------------------------------------------
-- players  (id == Supabase auth user id)
-- ---------------------------------------------------------------------------
create table if not exists public.players (
  id           uuid primary key references auth.users(id) on delete cascade,
  display_name text not null unique,
  created_at   timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- matches
-- match_key is deterministic & stable once both teams are known:
--   normalize(lower(date || '__' || team1 || '__' || team2))
-- Knockout fixtures with placeholder slots ("W101", "1A") are ingested but are
-- NOT predictable until real team names arrive (see ingest function).
-- ---------------------------------------------------------------------------
create table if not exists public.matches (
  match_key    text primary key,
  stage        text not null check (stage in
                 ('group','r32','r16','qf','sf','final','third_place')),
  group_label  text,
  team1        text not null,
  team2        text not null,
  predictable  boolean not null default false,  -- both real teams known
  kickoff_utc  timestamptz not null,
  status       text not null default 'scheduled'
                 check (status in ('scheduled','live','finished')),
  ft_team1     int,
  ft_team2     int,
  updated_at   timestamptz not null default now()
);

create index if not exists matches_kickoff_idx on public.matches (kickoff_utc);
create index if not exists matches_status_idx  on public.matches (status);

-- ---------------------------------------------------------------------------
-- predictions
-- ---------------------------------------------------------------------------
create table if not exists public.predictions (
  id             uuid primary key default gen_random_uuid(),
  match_key      text not null references public.matches(match_key) on delete cascade,
  user_id        uuid not null references public.players(id) on delete cascade,
  pred_team1     int  not null check (pred_team1 between 0 and 30),
  pred_team2     int  not null check (pred_team2 between 0 and 30),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  points_awarded int,
  scored_at      timestamptz,
  unique (user_id, match_key)
);

create index if not exists predictions_match_idx on public.predictions (match_key);
create index if not exists predictions_user_idx  on public.predictions (user_id);

-- ---------------------------------------------------------------------------
-- is_locked(match_key)
-- A match is LOCKED when now() >= kickoff_utc - lock_minutes. This is the one
-- authoritative definition; RLS policies and triggers call it, and the client
-- mirrors the same arithmetic for countdowns. STABLE so the planner can reuse
-- it within a statement.
-- ---------------------------------------------------------------------------
create or replace function public.is_locked(p_match_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select now() >= (m.kickoff_utc
           - (select value from public.scoring_config where key = 'lock_minutes')
             * interval '1 minute')
  from public.matches m
  where m.match_key = p_match_key;
$$;

comment on function public.is_locked(text) is
  'TRUE once we are within lock_minutes of kickoff. Single source of truth for the lock gate used by RLS, triggers, and (mirrored) the client countdown.';
