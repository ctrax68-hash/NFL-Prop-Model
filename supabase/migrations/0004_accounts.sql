-- Adds a per-user boundary to bet_results and a watchlist table.
--
-- bet_results has zero rows in production (confirmed before writing this
-- migration), so user_id is not null from day one -- no backfill needed.
-- The prior select policy was `using (true)`: any authenticated user could
-- read every row of every user's bets. That was moot with zero rows and
-- zero real auth in the app, but is tightened here to auth.uid() = user_id
-- as part of introducing accounts, along with insert/update policies that
-- didn't exist before (all writes still go through the service-role key
-- server-side, which bypasses RLS -- these policies are a backstop, not
-- the actual enforcement mechanism; see src/lib/auth.ts for why).

alter table bet_results
  add column user_id uuid not null references auth.users(id) on delete cascade;

create index if not exists bet_results_user_idx on bet_results (user_id, placed_at desc);

drop policy if exists bet_results_read_authenticated on bet_results;

create policy bet_results_select_own
  on bet_results for select
  to authenticated
  using (auth.uid() = user_id);

create policy bet_results_insert_own
  on bet_results for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy bet_results_update_own
  on bet_results for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- One row = one user watching one market. Keyed on the market
-- (game_id, player_id, prop_type), not a specific book's prop_id, since the
-- board's "best book" for a market can change between visits -- see
-- marketKey() in src/lib/engine/types.ts. captured_* stores what was true
-- at star-time so a later "moved" comparison has something concrete to diff
-- against, without needing a new price-history producer.
create table if not exists watched_props (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users(id) on delete cascade,
  game_id                 text not null,
  player_id               text not null,
  prop_type               text not null,
  season                  integer not null,
  week                    integer not null,
  player_name             text not null,
  team_id                 text not null,
  captured_line_value     double precision not null,
  captured_side           text not null check (captured_side in ('over','under')),
  captured_edge           double precision not null,
  captured_odds_american  integer not null,
  created_at              timestamptz not null default now(),
  unique (user_id, game_id, player_id, prop_type)
);

create index if not exists watched_props_user_idx on watched_props (user_id, created_at desc);

alter table watched_props enable row level security;

create policy watched_props_select_own
  on watched_props for select to authenticated using (auth.uid() = user_id);
create policy watched_props_insert_own
  on watched_props for insert to authenticated with check (auth.uid() = user_id);
create policy watched_props_delete_own
  on watched_props for delete to authenticated using (auth.uid() = user_id);
-- No update policy: re-starring after a move is delete+insert (matches the
-- unique constraint's upsert-on-conflict usage), which is also the correct
-- semantics for "reset the baseline" -- nothing in the app needs to edit a
-- star in place.
