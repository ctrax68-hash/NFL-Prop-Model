-- Per-user email alerts: "tell me when this market moves."
--
-- Deliberately a separate table from watched_props rather than an
-- is_alerted flag bolted onto it -- different concern (a background cron
-- writes to this one; watched_props is purely user-driven) and a different
-- lifecycle (a watch is forever until unstarred, an alert baseline resets
-- every time the cron actually sends a notification). Same market-identity
-- shape as watched_props (game_id, player_id, prop_type, not a specific
-- book's prop_id) for the same reason: the board's best book for a market
-- can change between runs.
--
-- last_notified_* start null (never notified yet) and are written only by
-- the service-role cron (scripts/send-alerts.ts) -- see the RLS policies
-- below, which grant authenticated users select/insert/delete on their own
-- rows but no update, the same "writes go through the service-role key
-- server-side, which bypasses RLS" reasoning documented in 0004_accounts.sql.
create table if not exists alert_subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  user_id                     uuid not null references auth.users(id) on delete cascade,
  game_id                     text not null,
  player_id                   text not null,
  prop_type                   text not null,
  season                      integer not null,
  week                        integer not null,
  player_name                 text not null,
  team_id                     text not null,
  last_notified_line_value    double precision,
  last_notified_odds_over     integer,
  last_notified_odds_under    integer,
  last_notified_at            timestamptz,
  created_at                  timestamptz not null default now(),
  unique (user_id, game_id, player_id, prop_type)
);

create index if not exists alert_subscriptions_user_idx on alert_subscriptions (user_id, created_at desc);
-- The cron scans "every subscription for the season/week it just priced",
-- not by user -- this is the index that query actually uses.
create index if not exists alert_subscriptions_week_idx on alert_subscriptions (season, week);

alter table alert_subscriptions enable row level security;

create policy alert_subscriptions_select_own
  on alert_subscriptions for select to authenticated using (auth.uid() = user_id);
create policy alert_subscriptions_insert_own
  on alert_subscriptions for insert to authenticated with check (auth.uid() = user_id);
create policy alert_subscriptions_delete_own
  on alert_subscriptions for delete to authenticated using (auth.uid() = user_id);
