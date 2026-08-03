-- Row level security.
--
-- Every table gets RLS enabled. Reads are open to authenticated users; all
-- writes go through server-side code using the service-role key, which bypasses
-- RLS by design. There is no client-side write path, so no insert/update/delete
-- policies are granted to `authenticated` — that is deliberate, not an omission.

do $$
declare
  target text;
begin
  foreach target in array array[
    'teams',
    'team_defense',
    'players',
    'games',
    'player_game_logs',
    'pipeline_runs',
    'props',
    'prop_line_history',
    'player_game_projections',
    'player_stat_distributions',
    'prop_model_evaluations',
    'bet_recommendations',
    'bet_results'
  ]
  loop
    execute format('alter table public.%I enable row level security', target);

    execute format(
      'drop policy if exists %I on public.%I',
      target || '_read_authenticated',
      target
    );

    execute format(
      'create policy %I on public.%I for select to authenticated using (true)',
      target || '_read_authenticated',
      target
    );
  end loop;
end
$$;
