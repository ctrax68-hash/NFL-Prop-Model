-- NFL prop model — core schema.
--
-- Mirrors the tables in the project spec. Every projection is traceable back to
-- the pipeline run and config version that produced it, which is what makes a
-- historical recommendation reproducible.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------

create table if not exists teams (
  team_id                  text primary key,
  name                     text,
  pace_plays_per_game      double precision not null,
  pace_seconds_per_play    double precision not null,
  pass_rate_overall        double precision not null,
  rush_rate_overall        double precision not null,
  pass_rate_when_trailing  double precision not null,
  pass_rate_when_leading   double precision not null,
  -- DVOA is proprietary; these are the free equivalents actually computable
  -- from nflverse. Named for what they are rather than what they stand in for.
  off_yards_per_dropback   double precision not null,
  off_yards_per_carry      double precision not null,
  as_of_season             integer not null,
  as_of_week               integer not null,
  updated_at               timestamptz not null default now()
);

create table if not exists team_defense (
  team_id                            text primary key,
  def_yards_per_dropback_allowed     double precision not null,
  def_yards_per_carry_allowed        double precision not null,
  vs_wr_yards_per_target_allowed     double precision not null,
  vs_te_yards_per_target_allowed     double precision not null,
  vs_rb_rec_yards_per_target_allowed double precision not null,
  vs_rb_rush_yards_per_carry_allowed double precision not null,
  vs_qb_yards_per_attempt_allowed    double precision not null,
  as_of_season                       integer not null,
  as_of_week                         integer not null,
  updated_at                         timestamptz not null default now()
);

create table if not exists players (
  player_id                     text primary key,
  name                          text not null,
  team_id                       text,
  position                      text not null check (position in ('QB','RB','WR','TE')),
  headshot_url                  text,
  baseline_target_share         double precision not null default 0,
  baseline_rush_share           double precision not null default 0,
  baseline_pass_attempt_share   double precision not null default 0,
  baseline_route_participation  double precision not null default 0,
  baseline_snap_share           double precision not null default 0,
  baseline_yards_per_target     double precision not null default 0,
  baseline_yards_per_carry      double precision not null default 0,
  baseline_catch_rate           double precision not null default 0,
  baseline_yards_per_pass_attempt double precision not null default 0,
  baseline_completion_rate      double precision not null default 0,
  baseline_receptions_per_game  double precision not null default 0,
  baseline_carries_per_game     double precision not null default 0,
  -- Drives both the shrinkage weight and the data-quality filter.
  games_sample_n                integer not null default 0,
  last_seen_season              integer,
  last_seen_week                integer,
  updated_at                    timestamptz not null default now()
);

create index if not exists players_team_idx on players (team_id);

create table if not exists games (
  game_id                   text primary key,
  season                    integer not null,
  week                      integer not null,
  gameday                   date,
  home_team_id              text not null,
  away_team_id              text not null,
  -- Standard betting convention: NEGATIVE means the home team is favoured.
  -- nflverse publishes the opposite sign and the loader flips it.
  spread_home               double precision,
  total                     double precision,
  implied_team_total_home   double precision,
  implied_team_total_away   double precision,
  weather_type              text check (weather_type in ('dome','outdoors','rain','snow')),
  wind_speed_mph            double precision,
  temperature_f             double precision,
  home_score                integer,
  away_score                integer
);

create index if not exists games_season_week_idx on games (season, week);

-- ---------------------------------------------------------------------------
-- Observations
-- ---------------------------------------------------------------------------

create table if not exists player_game_logs (
  player_id   text not null,
  game_id     text not null,
  season      integer not null,
  week        integer not null,
  stat_type   text not null,
  stat_value  double precision not null,
  primary key (player_id, game_id, stat_type)
);

create index if not exists player_game_logs_lookup_idx
  on player_game_logs (player_id, stat_type, season desc, week desc);

-- ---------------------------------------------------------------------------
-- Pipeline output
-- ---------------------------------------------------------------------------

create table if not exists pipeline_runs (
  run_id          uuid primary key default gen_random_uuid(),
  season          integer not null,
  week            integer not null,
  config_version  text not null,
  -- Full config snapshot: without it a past recommendation cannot be reproduced.
  config          jsonb not null,
  props_provider  text not null,
  props_are_real  boolean not null,
  bankroll        double precision not null,
  -- The complete run document.
  --
  -- The normalised child tables below exist for SQL analysis — "show me every
  -- receiving-yards edge above 6% in 2024" is a query, not a document scan. But
  -- a slate also has parts that are awkward to normalise and only ever read
  -- whole (team projections, rejection reasons, per-player game logs), so the
  -- snapshot is kept verbatim here too. The UI reads this column; analysts read
  -- the tables. Neither is derived from the other, so both stay correct.
  snapshot        jsonb not null,
  generated_at    timestamptz not null default now()
);

create index if not exists pipeline_runs_slate_idx
  on pipeline_runs (season, week, generated_at desc);

create table if not exists props (
  prop_id             text primary key,
  run_id              uuid references pipeline_runs (run_id) on delete cascade,
  game_id             text not null,
  player_id           text not null,
  prop_type           text not null,
  line_value          double precision not null,
  odds_over_american  integer not null,
  odds_under_american integer not null,
  book_name           text not null,
  captured_at         timestamptz not null default now()
);

create index if not exists props_run_idx on props (run_id);

-- Line movement, for closing line value.
create table if not exists prop_line_history (
  id                  bigserial primary key,
  game_id             text not null,
  player_id           text not null,
  prop_type           text not null,
  book_name           text not null,
  line_value          double precision not null,
  odds_over_american  integer not null,
  odds_under_american integer not null,
  captured_at         timestamptz not null default now()
);

create index if not exists prop_line_history_lookup_idx
  on prop_line_history (game_id, player_id, prop_type, captured_at desc);

create table if not exists player_game_projections (
  run_id                     uuid references pipeline_runs (run_id) on delete cascade,
  player_id                  text not null,
  game_id                    text not null,
  team_id                    text not null,
  opponent_team_id           text not null,
  position                   text not null,
  projected_targets          double precision not null,
  projected_carries          double precision not null,
  projected_receptions       double precision not null,
  projected_receiving_yards  double precision not null,
  projected_rushing_yards    double precision not null,
  projected_pass_attempts    double precision not null,
  projected_pass_completions double precision not null,
  projected_passing_yards    double precision not null,
  -- Intermediate values, so the UI can show how a projection was built.
  breakdown                  jsonb not null,
  primary key (run_id, player_id, game_id)
);

create table if not exists player_stat_distributions (
  run_id      uuid references pipeline_runs (run_id) on delete cascade,
  player_id   text not null,
  stat_type   text not null,
  mean_value  double precision not null,
  std_dev_value double precision,
  games       integer not null,
  primary key (run_id, player_id, stat_type)
);

create table if not exists prop_model_evaluations (
  run_id                    uuid references pipeline_runs (run_id) on delete cascade,
  prop_id                   text not null,
  player_id                 text not null,
  game_id                   text not null,
  prop_type                 text not null,
  line_value                double precision not null,
  projected_value           double precision not null,
  sigma                     double precision not null,
  distribution              text not null,
  model_prob_over           double precision not null,
  model_prob_under          double precision not null,
  -- Non-zero only on integer lines, where the exact result refunds the stake.
  model_prob_push           double precision not null default 0,
  model_prob_over_no_push   double precision not null,
  model_prob_under_no_push  double precision not null,
  raw_implied_over          double precision not null,
  raw_implied_under         double precision not null,
  -- Edge is measured against the DE-VIGGED fair price. Comparing against the
  -- raw implied probability understates every edge by roughly half the vig.
  fair_prob_over            double precision not null,
  fair_prob_under           double precision not null,
  overround                 double precision not null,
  edge_over                 double precision not null,
  edge_under                double precision not null,
  primary key (run_id, prop_id)
);

create index if not exists prop_model_evaluations_edge_idx
  on prop_model_evaluations (run_id, edge_over desc);

create table if not exists bet_recommendations (
  run_id                     uuid references pipeline_runs (run_id) on delete cascade,
  prop_id                    text not null,
  player_id                  text not null,
  game_id                    text not null,
  prop_type                  text not null,
  line_value                 double precision not null,
  side                       text not null check (side in ('over','under')),
  odds_american              integer not null,
  edge                       double precision not null,
  model_prob                 double precision not null,
  fair_prob                  double precision not null,
  kelly_fraction_raw         double precision not null,
  kelly_fraction_fractional  double precision not null,
  recommended_bet_size_units double precision not null,
  primary key (run_id, prop_id, side)
);

-- ---------------------------------------------------------------------------
-- Placed bets and results
-- ---------------------------------------------------------------------------

create table if not exists bet_results (
  id             uuid primary key default gen_random_uuid(),
  prop_id        text not null,
  season         integer not null,
  week           integer not null,
  game_id        text not null,
  player_id      text not null,
  player_name    text not null,
  team_id        text not null,
  prop_type      text not null,
  line_value     double precision not null,
  side           text not null check (side in ('over','under')),
  odds_american  integer not null,
  units          double precision not null,
  stake          double precision not null,
  model_prob     double precision not null,
  fair_prob      double precision not null,
  edge           double precision not null,
  placed_at      timestamptz not null default now(),
  -- 'void' is for props on players who never took the field; a sportsbook
  -- refunds those, and grading them as losses badly distorts measured results.
  status         text not null default 'pending'
                 check (status in ('pending','won','lost','push','void')),
  actual_value   double precision,
  profit_units   double precision,
  closing_odds_american integer,
  clv            double precision,
  settled_at     timestamptz
);

create index if not exists bet_results_status_idx on bet_results (status, placed_at desc);
create index if not exists bet_results_slate_idx on bet_results (season, week);
