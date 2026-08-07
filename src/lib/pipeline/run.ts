/**
 * The weekly pipeline: the six-step loop from the spec, in order.
 *
 *   1. Refresh team, defense and player usage from nflverse.
 *   2. Project team plays, pass/rush split, then per-player volume and yardage.
 *   3. Rebuild per-stat distributions from game logs.
 *   4. Price every prop and compute edges against the book.
 *   5. Filter to candidates and size them with fractional Kelly.
 *   6. Attach actual results when the games have been played.
 */

import { randomUUID } from "node:crypto";

import { DEFAULT_CONFIG, type EngineConfig } from "../engine/config";
import { evaluateProp, type PropEvaluation } from "../engine/edge";
import { projectGame, projectedValueForProp } from "../engine/project";
import { selectBets } from "../engine/selection";
import type { PlayerBaseline, PropLine, PropType } from "../engine/types";
import { computeBaselines, type PlayerRecord } from "../ingest/baselines";
import { computeDefenseRates } from "../ingest/defense";
import { computeTeamRates } from "../ingest/teamRates";
import { compareSeasonWeek, type SeasonWeek } from "../ingest/asOf";
import type { PropsProvider } from "../ingest/props/provider";
import { SyntheticPropsProvider } from "../ingest/props/synthetic";
import type { DataBundle } from "./bundle";
import type {
  PlayerGameLogEntry,
  PropActual,
  SlateGame,
  SlatePlayer,
  SlateSnapshot,
} from "./types";
import type { PlayerWeek, SnapCountRow } from "../ingest/nflverse";

export interface PipelineOptions {
  season: number;
  week: number;
  config?: EngineConfig;
  provider?: PropsProvider;
  bankroll?: number;
  /**
   * Drop players who have not recorded a stat line within this many weeks.
   * Their baselines look fine but they are hurt, cut or retired.
   */
  staleAfterWeeks?: number;
}

export const DEFAULT_STALE_AFTER_WEEKS = 3;

export async function runPipeline(
  bundle: DataBundle,
  options: PipelineOptions,
): Promise<SlateSnapshot> {
  const config = options.config ?? DEFAULT_CONFIG;
  const provider = options.provider ?? new SyntheticPropsProvider();
  const bankroll = options.bankroll ?? 10000;
  const asOf: SeasonWeek = { season: options.season, week: options.week };

  // --- Step 1: derive current team, defense and player baselines -----------
  // Every derivation below filters to games strictly before `asOf`.
  const { rates: teamRates } = computeTeamRates(
    bundle.teamWeeks,
    bundle.margins,
    asOf,
  );
  const { rates: defenseRates, norms } = computeDefenseRates(
    bundle.playerWeeks,
    asOf,
  );
  const playerRecords = computeBaselines({
    playerWeeks: bundle.playerWeeks,
    teamWeeks: bundle.teamWeeks,
    snapCounts: bundle.snapCounts,
    asOf,
  });

  const activeRecords = filterStale(
    playerRecords,
    asOf,
    options.staleAfterWeeks ?? DEFAULT_STALE_AFTER_WEEKS,
  );

  const playersByTeam = new Map<string, PlayerBaseline[]>();
  for (const record of activeRecords.values()) {
    const list = playersByTeam.get(record.baseline.teamId);
    if (list) list.push(record.baseline);
    else playersByTeam.set(record.baseline.teamId, [record.baseline]);
  }

  // --- Step 2: project each game on the slate ------------------------------
  const slateGames = bundle.games.filter(
    (game) =>
      game.season === options.season &&
      game.week === options.week &&
      game.gameType === "REG" &&
      game.spreadHome != null &&
      game.total != null,
  );

  const games: SlateGame[] = [];
  const projections: SlateSnapshot["projections"] = [];
  const teamProjections: SlateSnapshot["teamProjections"] = [];

  for (const game of slateGames) {
    const homeTeam = teamRates.get(game.homeTeam);
    const awayTeam = teamRates.get(game.awayTeam);
    const homeDefense = defenseRates.get(game.homeTeam);
    const awayDefense = defenseRates.get(game.awayTeam);

    // A team with no prior history — week 1 of the earliest loaded season —
    // cannot be projected. Skip rather than invent numbers.
    if (!homeTeam || !awayTeam || !homeDefense || !awayDefense) continue;

    const players = [
      ...(playersByTeam.get(game.homeTeam) ?? []),
      ...(playersByTeam.get(game.awayTeam) ?? []),
    ];
    if (players.length === 0) continue;

    const result = projectGame(
      {
        game: {
          gameId: game.gameId,
          homeTeamId: game.homeTeam,
          awayTeamId: game.awayTeam,
          spreadHome: game.spreadHome!,
          total: game.total!,
          weatherType: game.weatherType,
          windSpeedMph: game.windSpeedMph,
          temperatureF: game.temperatureF,
        },
        homeTeam,
        awayTeam,
        homeDefense,
        awayDefense,
        players,
        norms,
      },
      config,
    );

    const home = result.teams.find((t) => t.isHome)!;
    const away = result.teams.find((t) => !t.isHome)!;

    games.push({
      gameId: game.gameId,
      season: game.season,
      week: game.week,
      gameday: game.gameday,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      spreadHome: game.spreadHome!,
      total: game.total!,
      impliedTeamTotalHome: home.impliedTeamTotal,
      impliedTeamTotalAway: away.impliedTeamTotal,
      weatherType: game.weatherType,
      windSpeedMph: game.windSpeedMph,
      temperatureF: game.temperatureF,
      homeScore: game.homeScore,
      awayScore: game.awayScore,
    });

    teamProjections.push(...result.teams);
    projections.push(...result.players);
  }

  // --- Steps 3+4: fetch lines, then price them -----------------------------
  const baselines = new Map<string, PlayerBaseline>();
  for (const record of activeRecords.values()) {
    baselines.set(record.baseline.playerId, record.baseline);
  }

  const props = await provider.fetchProps({
    season: options.season,
    week: options.week,
    games: slateGames,
    projections,
    baselines,
    config,
  });

  const projectionByKey = new Map(
    projections.map((p) => [`${p.gameId}|${p.playerId}`, p]),
  );
  const propsById = new Map(props.map((prop) => [prop.propId, prop]));

  const evaluations: PropEvaluation[] = [];
  for (const prop of props) {
    const projection = projectionByKey.get(`${prop.gameId}|${prop.playerId}`);
    if (!projection) continue;

    const record = activeRecords.get(prop.playerId);
    const history = record?.statHistory[prop.propType];

    evaluations.push(
      evaluateProp(
        {
          prop,
          projectedValue: projectedValueForProp(projection, prop.propType),
          playerSigma: history?.sd ?? null,
          playerMean: history?.mean ?? null,
          playerGames: history?.games ?? 0,
          snapShare: record?.baseline.baselineSnapShare ?? null,
        },
        config,
      ),
    );
  }

  // --- Step 5: select and size --------------------------------------------
  const gamesSampleByPlayer = new Map<string, number>();
  for (const record of activeRecords.values()) {
    gamesSampleByPlayer.set(
      record.baseline.playerId,
      record.baseline.gamesSampleN,
    );
  }

  const { selected, rejected } = selectBets(
    evaluations,
    propsById,
    { gamesSampleByPlayer },
    config,
  );

  // --- Step 6: attach actuals for weeks already played ---------------------
  const usedPlayerIds = new Set(projections.map((p) => p.playerId));
  const players: SlatePlayer[] = [];
  for (const playerId of usedPlayerIds) {
    const record = activeRecords.get(playerId);
    if (!record) continue;
    players.push({
      playerId,
      name: record.baseline.name,
      teamId: record.baseline.teamId,
      position: record.baseline.position,
      headshotUrl: record.headshotUrl,
      gamesSampleN: record.baseline.gamesSampleN,
    });
  }

  const actuals = buildActuals(
    bundle.playerWeeks,
    bundle.snapCounts,
    asOf,
    props,
    new Map(players.map((player) => [player.playerId, player.name])),
  );

  const gameLogs = buildGameLogs(bundle.playerWeeks, asOf, usedPlayerIds);

  return {
    runId: randomUUID(),
    generatedAt: new Date().toISOString(),
    season: options.season,
    week: options.week,
    configVersion: config.configVersion,
    config,
    bankroll,
    propsProvider: provider.name,
    propsAreReal: provider.isReal,
    games,
    players,
    teamProjections,
    projections,
    props,
    evaluations,
    recommendations: selected,
    rejected,
    actuals,
    gameLogs,
  };
}

export const GAME_LOG_LENGTH = 8;

/** The last few games for each player on the slate, strictly before `asOf`. */
function buildGameLogs(
  playerWeeks: readonly PlayerWeek[],
  asOf: SeasonWeek,
  playerIds: ReadonlySet<string>,
): PlayerGameLogEntry[] {
  const byPlayer = new Map<string, PlayerWeek[]>();

  for (const row of playerWeeks) {
    if (!playerIds.has(row.playerId)) continue;
    if (row.seasonType !== "REG") continue;
    if (compareSeasonWeek(row, asOf) >= 0) continue;

    const list = byPlayer.get(row.playerId);
    if (list) list.push(row);
    else byPlayer.set(row.playerId, [row]);
  }

  const out: PlayerGameLogEntry[] = [];
  for (const [playerId, rows] of byPlayer) {
    const recent = rows
      .sort((a, b) => compareSeasonWeek(b, a))
      .slice(0, GAME_LOG_LENGTH);

    for (const row of recent) {
      out.push({
        playerId,
        season: row.season,
        week: row.week,
        opponent: row.opponent,
        values: {
          receiving_yards: row.receivingYards,
          receptions: row.receptions,
          rushing_yards: row.rushingYards,
          rush_attempts: row.carries,
          passing_yards: row.passingYards,
          pass_attempts: row.attempts,
          pass_completions: row.completions,
        },
      });
    }
  }

  return out;
}

function filterStale(
  records: Map<string, PlayerRecord>,
  asOf: SeasonWeek,
  staleAfterWeeks: number,
): Map<string, PlayerRecord> {
  const out = new Map<string, PlayerRecord>();
  for (const [playerId, record] of records) {
    const gap = weeksBetween(record.lastSeen, asOf);
    if (gap <= staleAfterWeeks) out.set(playerId, record);
  }
  return out;
}

/** Approximate week gap, treating a season as 18 weeks. */
function weeksBetween(from: SeasonWeek, to: SeasonWeek): number {
  if (compareSeasonWeek(from, to) >= 0) return 0;
  return (to.season - from.season) * 18 + (to.week - from.week);
}

const ACTUAL_ACCESSORS: Record<PropType, (row: PlayerWeek) => number> = {
  receiving_yards: (row) => row.receivingYards,
  receptions: (row) => row.receptions,
  rushing_yards: (row) => row.rushingYards,
  rush_attempts: (row) => row.carries,
  passing_yards: (row) => row.passingYards,
  pass_attempts: (row) => row.attempts,
  pass_completions: (row) => row.completions,
};

/**
 * Look up what actually happened, for grading.
 *
 * Three cases, and the distinction between the last two matters enormously:
 *
 *   1. The player has a stat row  ->  grade against it.
 *   2. No stat row, but they played offensive snaps  ->  a genuine zero. They
 *      were on the field and never got the ball, which is a legitimate under.
 *   3. No stat row and no snaps  ->  VOID. They were inactive, injured or cut.
 *
 * Treating case 3 as a zero was measurably wrong: about a fifth of posted props
 * fall into it, and settling them all as unders dragged realised over-rates
 * ~10 points below predicted across every calibration bin. Sportsbooks refund
 * these, and so do we.
 */
export function buildActuals(
  playerWeeks: readonly PlayerWeek[],
  snapCounts: readonly SnapCountRow[],
  asOf: SeasonWeek,
  props: readonly PropLine[],
  playerNames: ReadonlyMap<string, string>,
): PropActual[] {
  const weekRows = playerWeeks.filter(
    (row) =>
      row.season === asOf.season &&
      row.week === asOf.week &&
      row.seasonType === "REG",
  );
  if (weekRows.length === 0) return [];

  const byPlayer = new Map(weekRows.map((row) => [row.playerId, row]));

  // Snap counts key on player name rather than id, so the join is by
  // normalised name. A miss here only costs us a void instead of a zero.
  const playedSnaps = new Set(
    snapCounts
      .filter(
        (snap) =>
          snap.season === asOf.season &&
          snap.week === asOf.week &&
          snap.offenseSnaps > 0,
      )
      .map((snap) => normaliseName(snap.player)),
  );

  return props.map((prop) => {
    const row = byPlayer.get(prop.playerId);
    if (row) {
      return {
        propId: prop.propId,
        playerId: prop.playerId,
        propType: prop.propType,
        actualValue: ACTUAL_ACCESSORS[prop.propType](row),
        status: "graded" as const,
      };
    }

    const name = playerNames.get(prop.playerId) ?? "";
    const played = playedSnaps.has(normaliseName(name));

    return {
      propId: prop.propId,
      playerId: prop.playerId,
      propType: prop.propType,
      actualValue: played ? 0 : null,
      status: played ? ("graded" as const) : ("did-not-play" as const),
    };
  });
}

function normaliseName(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, "");
}
