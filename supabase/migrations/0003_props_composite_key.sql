-- `props` needs a run-scoped primary key, not a bare one.
--
-- The same prop id recurs every week the pipeline runs — a given player's
-- receiving-yards market has a stable id by design, because that is what makes
-- line movement trackable across runs. With `prop_id` alone as the primary key,
-- the second run of any slate collides.
--
-- The original workaround was to store a synthesised `runId:propId` in this
-- table. That avoided the collision but broke every join: `prop_model_evaluations`
-- and `bet_results` store the bare id, so `props` could not be joined to either,
-- which defeats the point of keeping normalised tables alongside the snapshot.
--
-- Use the same composite key the other run-scoped tables already use.

alter table props
  alter column run_id set not null;

alter table props
  drop constraint if exists props_pkey;

alter table props
  add constraint props_pkey primary key (run_id, prop_id);

-- Line-movement lookups go by market, not by run.
create index if not exists props_market_idx
  on props (game_id, player_id, prop_type);
