/**
 * The slate snapshot: everything one pipeline run produced, in one object.
 *
 * The UI reads this, the backtester grades it, and it serialises straight to
 * JSON or into the Supabase tables. Keeping a run self-contained means a
 * recommendation can always be traced back to the exact projections, lines and
 * config that produced it.
 */

import type { EngineConfig } from "../engine/config";
import type { PropEvaluation } from "../engine/edge";
import type { PlayerGameProjection, TeamProjection } from "../engine/project";
import type { BetCandidate, RejectedCandidate } from "../engine/selection";
import type { Position, PropType, PropLine, WeatherType } from "../engine/types";

export interface SlateGame {
  gameId: string;
  season: number;
  week: number;
  gameday: string;
  homeTeam: string;
  awayTeam: string;
  spreadHome: number;
  total: number;
  impliedTeamTotalHome: number;
  impliedTeamTotalAway: number;
  weatherType: WeatherType;
  windSpeedMph: number | null;
  temperatureF: number | null;
  homeScore: number | null;
  awayScore: number | null;
}

export interface SlatePlayer {
  playerId: string;
  name: string;
  teamId: string;
  position: Position;
  headshotUrl: string | null;
  gamesSampleN: number;
}

/**
 * Actual result for a graded prop, present only for weeks already played.
 *
 * `actualValue` is null when the player never took the field. That is a VOID,
 * not a zero: sportsbooks refund props on players who are inactive, and
 * settling them as zero would manufacture a flood of fake unders.
 */
export interface PropActual {
  propId: string;
  playerId: string;
  propType: PropType;
  actualValue: number | null;
  /** Why the value is null, for display in the tracker. */
  status: "graded" | "did-not-play";
}

/**
 * A player's recent results, for the game-log strip on the prop detail page.
 *
 * Carried inside the snapshot so a slate stays self-contained: the UI never
 * reaches back to the nflverse files, which also means it works identically
 * against the file store and Supabase.
 */
export interface PlayerGameLogEntry {
  playerId: string;
  season: number;
  week: number;
  opponent: string;
  values: Partial<Record<PropType, number>>;
}

export interface SlateSnapshot {
  runId: string;
  generatedAt: string;
  season: number;
  week: number;
  configVersion: string;
  config: EngineConfig;
  bankroll: number;

  propsProvider: string;
  /** False for synthetic lines; the UI warns when results are not real. */
  propsAreReal: boolean;

  games: SlateGame[];
  players: SlatePlayer[];
  teamProjections: TeamProjection[];
  projections: PlayerGameProjection[];
  props: PropLine[];
  evaluations: PropEvaluation[];
  recommendations: BetCandidate[];
  rejected: RejectedCandidate[];
  /** Populated once the games have been played. */
  actuals: PropActual[];
  /** Recent results per player, most recent first. */
  gameLogs: PlayerGameLogEntry[];
}

export interface SlateSummary {
  season: number;
  week: number;
  runId: string;
  generatedAt: string;
  propsProvider: string;
  propsAreReal: boolean;
  gameCount: number;
  propCount: number;
  recommendationCount: number;
  totalUnits: number;
  graded: boolean;
}

export function summarise(snapshot: SlateSnapshot): SlateSummary {
  return {
    season: snapshot.season,
    week: snapshot.week,
    runId: snapshot.runId,
    generatedAt: snapshot.generatedAt,
    propsProvider: snapshot.propsProvider,
    propsAreReal: snapshot.propsAreReal,
    gameCount: snapshot.games.length,
    propCount: snapshot.props.length,
    recommendationCount: snapshot.recommendations.length,
    totalUnits: snapshot.recommendations.reduce(
      (sum, r) => sum + r.kelly.recommendedUnits,
      0,
    ),
    graded: snapshot.actuals.length > 0,
  };
}
