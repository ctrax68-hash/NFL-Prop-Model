/**
 * Supabase-backed store.
 *
 * Implements the same {@link SlateStore} interface as the file store, so
 * switching backends is an environment variable and nothing else changes.
 *
 * A slate is written as one `pipeline_runs` row plus its normalised children,
 * and read back by reassembling them into a {@link SlateSnapshot}. The bulky,
 * shape-heavy parts of a run — the engine config, a projection's intermediate
 * breakdown — are stored as jsonb rather than exploded into columns: they are
 * only ever read as a whole, and pinning them to columns would force a
 * migration every time the model gains a coefficient.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import type { SlateSnapshot, SlateSummary } from "../pipeline/types";
import { summarise } from "../pipeline/types";
import type { PlacedBet, SlateStore } from "./store";

export function createServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase store requires NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.",
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/** Chunked insert — Postgres rejects very large single statements. */
async function insertAll(
  client: SupabaseClient,
  table: string,
  rows: readonly Record<string, unknown>[],
  chunkSize = 500,
): Promise<void> {
  for (let i = 0; i < rows.length; i += chunkSize) {
    const { error } = await client
      .from(table)
      .insert(rows.slice(i, i + chunkSize));
    if (error) {
      throw new Error(`Insert into ${table} failed: ${error.message}`);
    }
  }
}

export class SupabaseSlateStore implements SlateStore {
  readonly kind = "supabase";

  private readonly client: SupabaseClient;

  constructor(client: SupabaseClient = createServiceClient()) {
    this.client = client;
  }

  async saveSnapshot(snapshot: SlateSnapshot): Promise<void> {
    const runId = snapshot.runId;

    const { error: runError } = await this.client.from("pipeline_runs").insert({
      run_id: runId,
      season: snapshot.season,
      week: snapshot.week,
      config_version: snapshot.configVersion,
      config: snapshot.config,
      props_provider: snapshot.propsProvider,
      props_are_real: snapshot.propsAreReal,
      bankroll: snapshot.bankroll,
      snapshot,
      generated_at: snapshot.generatedAt,
    });
    if (runError) {
      throw new Error(`Could not record pipeline run: ${runError.message}`);
    }

    // Games and players are slate-independent facts, so they upsert rather than
    // insert — the same player appears in every week's run.
    const { error: gamesError } = await this.client.from("games").upsert(
      snapshot.games.map((game) => ({
        game_id: game.gameId,
        season: game.season,
        week: game.week,
        gameday: game.gameday || null,
        home_team_id: game.homeTeam,
        away_team_id: game.awayTeam,
        spread_home: game.spreadHome,
        total: game.total,
        implied_team_total_home: game.impliedTeamTotalHome,
        implied_team_total_away: game.impliedTeamTotalAway,
        weather_type: game.weatherType,
        wind_speed_mph: game.windSpeedMph,
        temperature_f: game.temperatureF,
        home_score: game.homeScore,
        away_score: game.awayScore,
      })),
      { onConflict: "game_id" },
    );
    if (gamesError) throw new Error(`Could not save games: ${gamesError.message}`);

    const { error: playersError } = await this.client.from("players").upsert(
      snapshot.players.map((player) => ({
        player_id: player.playerId,
        name: player.name,
        team_id: player.teamId,
        position: player.position,
        headshot_url: player.headshotUrl,
        games_sample_n: player.gamesSampleN,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: "player_id" },
    );
    if (playersError) {
      throw new Error(`Could not save players: ${playersError.message}`);
    }

    await insertAll(
      this.client,
      "props",
      snapshot.props.map((prop) => ({
        // Bare id, not `runId:propId`. The composite primary key on
        // (run_id, prop_id) handles cross-run collisions, and keeping the id
        // bare is what lets this table join to prop_model_evaluations.
        prop_id: prop.propId,
        run_id: runId,
        game_id: prop.gameId,
        player_id: prop.playerId,
        prop_type: prop.propType,
        line_value: prop.lineValue,
        odds_over_american: prop.oddsOverAmerican,
        odds_under_american: prop.oddsUnderAmerican,
        book_name: prop.bookName,
        captured_at: prop.timestamp,
      })),
    );

    await insertAll(
      this.client,
      "player_game_projections",
      snapshot.projections.map((projection) => ({
        run_id: runId,
        player_id: projection.playerId,
        game_id: projection.gameId,
        team_id: projection.teamId,
        opponent_team_id: projection.opponentTeamId,
        position: projection.position,
        projected_targets: projection.projectedTargets,
        projected_carries: projection.projectedCarries,
        projected_receptions: projection.projectedReceptions,
        projected_receiving_yards: projection.projectedReceivingYards,
        projected_rushing_yards: projection.projectedRushingYards,
        projected_pass_attempts: projection.projectedPassAttempts,
        projected_pass_completions: projection.projectedPassCompletions,
        projected_passing_yards: projection.projectedPassingYards,
        breakdown: projection.breakdown,
      })),
    );

    await insertAll(
      this.client,
      "prop_model_evaluations",
      snapshot.evaluations.map((evaluation) => ({
        run_id: runId,
        prop_id: evaluation.propId,
        player_id: evaluation.playerId,
        game_id: evaluation.gameId,
        prop_type: evaluation.propType,
        line_value: evaluation.lineValue,
        projected_value: evaluation.projectedValue,
        sigma: evaluation.sigma,
        distribution: evaluation.distribution,
        model_prob_over: evaluation.modelProbOver,
        model_prob_under: evaluation.modelProbUnder,
        model_prob_push: evaluation.modelProbPush,
        model_prob_over_no_push: evaluation.modelProbOverNoPush,
        model_prob_under_no_push: evaluation.modelProbUnderNoPush,
        raw_implied_over: evaluation.rawImpliedOver,
        raw_implied_under: evaluation.rawImpliedUnder,
        fair_prob_over: evaluation.fairProbOver,
        fair_prob_under: evaluation.fairProbUnder,
        overround: evaluation.overround,
        edge_over: evaluation.edgeOver,
        edge_under: evaluation.edgeUnder,
      })),
    );

    await insertAll(
      this.client,
      "bet_recommendations",
      snapshot.recommendations.map((bet) => ({
        run_id: runId,
        prop_id: bet.propId,
        player_id: bet.playerId,
        game_id: bet.gameId,
        prop_type: bet.propType,
        line_value: bet.lineValue,
        side: bet.side,
        odds_american: bet.oddsAmerican,
        edge: bet.edge,
        model_prob: bet.modelProb,
        fair_prob: bet.fairProb,
        kelly_fraction_raw: bet.kelly.kellyFractionRaw,
        kelly_fraction_fractional: bet.kelly.kellyFractionFractional,
        recommended_bet_size_units: bet.kelly.recommendedUnits,
      })),
    );
  }

  async loadSnapshot(season: number, week: number): Promise<SlateSnapshot | null> {
    const { data: runs, error } = await this.client
      .from("pipeline_runs")
      .select("snapshot")
      .eq("season", season)
      .eq("week", week)
      .order("generated_at", { ascending: false })
      .limit(1);

    if (error) throw new Error(`Could not load slate: ${error.message}`);
    if (!runs || runs.length === 0) return null;

    return runs[0].snapshot as SlateSnapshot;
  }

  async listSlates(): Promise<SlateSummary[]> {
    const { data, error } = await this.client
      .from("pipeline_runs")
      .select("snapshot")
      .order("season", { ascending: false })
      .order("week", { ascending: false });

    if (error) throw new Error(`Could not list slates: ${error.message}`);

    return (data ?? []).map((run) => summarise(run.snapshot as SlateSnapshot));
  }

  async placeBets(bets: readonly PlacedBet[]): Promise<void> {
    const { error } = await this.client.from("bet_results").upsert(
      bets.map((bet) => ({
        id: bet.id,
        prop_id: bet.propId,
        season: bet.season,
        week: bet.week,
        game_id: bet.gameId,
        player_id: bet.playerId,
        player_name: bet.playerName,
        team_id: bet.teamId,
        prop_type: bet.propType,
        line_value: bet.lineValue,
        side: bet.side,
        odds_american: bet.oddsAmerican,
        units: bet.units,
        stake: bet.stake,
        model_prob: bet.modelProb,
        fair_prob: bet.fairProb,
        edge: bet.edge,
        placed_at: bet.placedAt,
        status: bet.status,
        actual_value: bet.actualValue,
        profit_units: bet.profitUnits,
        settled_at: bet.settledAt,
      })),
      { onConflict: "id" },
    );

    if (error) throw new Error(`Could not save bets: ${error.message}`);
  }

  async listBets(): Promise<PlacedBet[]> {
    const { data, error } = await this.client
      .from("bet_results")
      .select("*")
      .order("placed_at", { ascending: false });

    if (error) throw new Error(`Could not list bets: ${error.message}`);

    return (data ?? []).map((row) => ({
      id: row.id as string,
      propId: row.prop_id as string,
      season: row.season as number,
      week: row.week as number,
      gameId: row.game_id as string,
      playerId: row.player_id as string,
      playerName: row.player_name as string,
      teamId: row.team_id as string,
      propType: row.prop_type as PlacedBet["propType"],
      lineValue: row.line_value as number,
      side: row.side as PlacedBet["side"],
      oddsAmerican: row.odds_american as number,
      units: row.units as number,
      stake: row.stake as number,
      modelProb: row.model_prob as number,
      fairProb: row.fair_prob as number,
      edge: row.edge as number,
      placedAt: row.placed_at as string,
      status: row.status as PlacedBet["status"],
      actualValue: row.actual_value as number | null,
      profitUnits: row.profit_units as number | null,
      settledAt: row.settled_at as string | null,
    }));
  }

  async updateBets(bets: readonly PlacedBet[]): Promise<void> {
    await this.placeBets(bets);
  }
}

export { summarise };
