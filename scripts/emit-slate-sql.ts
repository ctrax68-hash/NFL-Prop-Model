/**
 * Emit a slate as plain SQL.
 *
 * Two uses:
 *   - An offline export path: load a slate into any Postgres without needing
 *     Supabase credentials in the process doing the loading.
 *   - Verification: the statements are generated from the same field mapping
 *     `SupabaseSlateStore` uses, so running them proves the schema accepts a
 *     real slate at real volume, not just a hand-written probe row.
 *
 *   npx tsx scripts/emit-slate-sql.ts --season 2025 --week 12 --out .data/slate.sql
 *   npx tsx scripts/emit-slate-sql.ts --season 2025 --week 12 --table props
 */

import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { FileSlateStore } from "../src/lib/db/fileStore";
import type { SlateSnapshot } from "../src/lib/pipeline/types";
import { optionalNumber, parseArgs } from "./lib/args";

/** Quote a value as a SQL literal. */
function lit(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number") {
    return Number.isFinite(value) ? String(value) : "null";
  }
  if (typeof value === "boolean") return value ? "true" : "false";
  // Dollar-quoting would break on payloads containing the tag, so escape
  // single quotes the standard way instead.
  return `'${String(value).replace(/'/g, "''")}'`;
}

function json(value: unknown): string {
  return `${lit(JSON.stringify(value))}::jsonb`;
}

function insert(
  table: string,
  columns: readonly string[],
  rows: readonly string[][],
  conflict?: string,
): string {
  if (rows.length === 0) return "";
  const values = rows.map((row) => `  (${row.join(", ")})`).join(",\n");
  const suffix = conflict ? `\non conflict (${conflict}) do nothing` : "";
  return `insert into ${table}\n  (${columns.join(", ")})\nvalues\n${values}${suffix};\n`;
}

export function emitSlateSql(
  snapshot: SlateSnapshot,
  only?: string,
): Record<string, string> {
  const runId = snapshot.runId;
  const out: Record<string, string> = {};

  out.pipeline_runs = insert(
    "pipeline_runs",
    [
      "run_id", "season", "week", "config_version", "config",
      "props_provider", "props_are_real", "bankroll", "snapshot", "generated_at",
    ],
    [[
      lit(runId), lit(snapshot.season), lit(snapshot.week),
      lit(snapshot.configVersion), json(snapshot.config),
      lit(snapshot.propsProvider), lit(snapshot.propsAreReal),
      lit(snapshot.bankroll), json(snapshot), lit(snapshot.generatedAt),
    ]],
    "run_id",
  );

  out.games = insert(
    "games",
    [
      "game_id", "season", "week", "gameday", "home_team_id", "away_team_id",
      "spread_home", "total", "implied_team_total_home", "implied_team_total_away",
      "weather_type", "wind_speed_mph", "temperature_f", "home_score", "away_score",
    ],
    snapshot.games.map((g) => [
      lit(g.gameId), lit(g.season), lit(g.week), lit(g.gameday || null),
      lit(g.homeTeam), lit(g.awayTeam), lit(g.spreadHome), lit(g.total),
      lit(g.impliedTeamTotalHome), lit(g.impliedTeamTotalAway),
      lit(g.weatherType), lit(g.windSpeedMph), lit(g.temperatureF),
      lit(g.homeScore), lit(g.awayScore),
    ]),
    "game_id",
  );

  out.players = insert(
    "players",
    ["player_id", "name", "team_id", "position", "headshot_url", "games_sample_n"],
    snapshot.players.map((p) => [
      lit(p.playerId), lit(p.name), lit(p.teamId), lit(p.position),
      lit(p.headshotUrl), lit(p.gamesSampleN),
    ]),
    "player_id",
  );

  out.props = insert(
    "props",
    [
      "prop_id", "run_id", "game_id", "player_id", "prop_type", "line_value",
      "odds_over_american", "odds_under_american", "book_name", "captured_at",
    ],
    snapshot.props.map((p) => [
      lit(p.propId), lit(runId), lit(p.gameId), lit(p.playerId), lit(p.propType),
      lit(p.lineValue), lit(p.oddsOverAmerican), lit(p.oddsUnderAmerican),
      lit(p.bookName), lit(p.timestamp),
    ]),
    "run_id, prop_id",
  );

  out.player_game_projections = insert(
    "player_game_projections",
    [
      "run_id", "player_id", "game_id", "team_id", "opponent_team_id", "position",
      "projected_targets", "projected_carries", "projected_receptions",
      "projected_receiving_yards", "projected_rushing_yards",
      "projected_pass_attempts", "projected_pass_completions",
      "projected_passing_yards", "breakdown",
    ],
    snapshot.projections.map((p) => [
      lit(runId), lit(p.playerId), lit(p.gameId), lit(p.teamId),
      lit(p.opponentTeamId), lit(p.position),
      lit(p.projectedTargets), lit(p.projectedCarries), lit(p.projectedReceptions),
      lit(p.projectedReceivingYards), lit(p.projectedRushingYards),
      lit(p.projectedPassAttempts), lit(p.projectedPassCompletions),
      lit(p.projectedPassingYards), json(p.breakdown),
    ]),
    "run_id, player_id, game_id",
  );

  out.prop_model_evaluations = insert(
    "prop_model_evaluations",
    [
      "run_id", "prop_id", "player_id", "game_id", "prop_type", "line_value",
      "projected_value", "sigma", "distribution", "model_prob_over",
      "model_prob_under", "model_prob_push", "model_prob_over_no_push",
      "model_prob_under_no_push", "raw_implied_over", "raw_implied_under",
      "fair_prob_over", "fair_prob_under", "overround", "edge_over", "edge_under",
    ],
    snapshot.evaluations.map((e) => [
      lit(runId), lit(e.propId), lit(e.playerId), lit(e.gameId), lit(e.propType),
      lit(e.lineValue), lit(e.projectedValue), lit(e.sigma), lit(e.distribution),
      lit(e.modelProbOver), lit(e.modelProbUnder), lit(e.modelProbPush),
      lit(e.modelProbOverNoPush), lit(e.modelProbUnderNoPush),
      lit(e.rawImpliedOver), lit(e.rawImpliedUnder),
      lit(e.fairProbOver), lit(e.fairProbUnder), lit(e.overround),
      lit(e.edgeOver), lit(e.edgeUnder),
    ]),
    "run_id, prop_id",
  );

  out.bet_recommendations = insert(
    "bet_recommendations",
    [
      "run_id", "prop_id", "player_id", "game_id", "prop_type", "line_value",
      "side", "odds_american", "edge", "model_prob", "fair_prob",
      "kelly_fraction_raw", "kelly_fraction_fractional", "recommended_bet_size_units",
    ],
    snapshot.recommendations.map((r) => [
      lit(runId), lit(r.propId), lit(r.playerId), lit(r.gameId), lit(r.propType),
      lit(r.lineValue), lit(r.side), lit(r.oddsAmerican), lit(r.edge),
      lit(r.modelProb), lit(r.fairProb), lit(r.kelly.kellyFractionRaw),
      lit(r.kelly.kellyFractionFractional), lit(r.kelly.recommendedUnits),
    ]),
    "run_id, prop_id, side",
  );

  return only ? { [only]: out[only] ?? "" } : out;
}

async function main(): Promise<void> {
  const args = parseArgs();
  const season = optionalNumber(args, "season");
  const week = optionalNumber(args, "week");
  const only = typeof args.table === "string" ? args.table : undefined;

  const store = new FileSlateStore();
  const slates = await store.listSlates();
  const target =
    season != null && week != null
      ? { season, week }
      : slates[0] && { season: slates[0].season, week: slates[0].week };

  if (!target) {
    console.error("No slates available. Run scripts/pipeline.ts first.");
    process.exit(1);
  }

  const snapshot = await store.loadSnapshot(target.season, target.week);
  if (!snapshot) {
    console.error(`No slate for ${target.season} week ${target.week}.`);
    process.exit(1);
  }

  const sections = emitSlateSql(snapshot, only);
  const sql = Object.values(sections).filter(Boolean).join("\n");

  if (typeof args.out === "string") {
    await mkdir(path.dirname(args.out), { recursive: true });
    await writeFile(args.out, sql, "utf8");
    console.error(`Wrote ${sql.length.toLocaleString()} bytes to ${args.out}`);
    for (const [table, body] of Object.entries(sections)) {
      if (body) console.error(`  ${table.padEnd(26)} ${body.length.toLocaleString()} bytes`);
    }
  } else {
    process.stdout.write(sql);
  }
}

// Only run when invoked directly, so the emitter stays importable.
if (process.argv[1]?.includes("emit-slate-sql")) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
