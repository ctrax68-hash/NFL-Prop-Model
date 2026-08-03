/**
 * Shared domain types for the projection/pricing engine.
 *
 * Everything in `src/lib/engine` is pure: plain objects in, plain objects out,
 * no database or network access. That is what makes the model unit-testable
 * and replayable in the backtester.
 */

export type Position = "QB" | "RB" | "WR" | "TE";

/** Statistics the engine can project and price. */
export type StatType =
  | "passing_yards"
  | "pass_attempts"
  | "pass_completions"
  | "rushing_yards"
  | "rush_attempts"
  | "receiving_yards"
  | "receptions";

/** Sportsbook prop markets. Maps 1:1 onto {@link StatType}. */
export type PropType = StatType;

export type Side = "over" | "under";

export type WeatherType = "dome" | "outdoors" | "rain" | "snow";

/** Stats that are counts (discrete) rather than continuous yardage. */
export const DISCRETE_STATS: ReadonlySet<StatType> = new Set<StatType>([
  "pass_attempts",
  "pass_completions",
  "rush_attempts",
  "receptions",
]);

export function isDiscreteStat(stat: StatType): boolean {
  return DISCRETE_STATS.has(stat);
}

/** Offensive tendencies for one team, as stored in the `teams` table. */
export interface TeamRates {
  teamId: string;
  pacePlaysPerGame: number;
  paceSecondsPerPlay: number;
  passRateOverall: number;
  rushRateOverall: number;
  /** Pass rate in game states where the team is behind. */
  passRateWhenTrailing: number;
  /** Pass rate in game states where the team is ahead. */
  passRateWhenLeading: number;
  /**
   * Passing yards per dropback. Stands in for the spec's `offensive_dvoa_pass`:
   * DVOA is proprietary, and this is the closest thing derivable from free data.
   * Stored for display and future use — the projection path adjusts for
   * opponent through the yards-allowed splits below, not through these.
   */
  offYardsPerDropback: number;
  /** Rushing yards per carry. Stands in for `offensive_dvoa_rush`. */
  offYardsPerCarry: number;
}

/** Defensive profile for one team, as stored in the `team_defense` table. */
export interface DefenseRates {
  teamId: string;
  /** Passing yards per dropback allowed. Stands in for `defensive_dvoa_pass`. */
  defYardsPerDropbackAllowed: number;
  /** Rushing yards per carry allowed. Stands in for `defensive_dvoa_rush`. */
  defYardsPerCarryAllowed: number;
  vsWrYardsPerTargetAllowed: number;
  vsTeYardsPerTargetAllowed: number;
  vsRbRecYardsPerTargetAllowed: number;
  vsRbRushYardsPerCarryAllowed: number;
  /** Yards per pass attempt allowed to opposing quarterbacks. */
  vsQbYardsPerAttemptAllowed: number;
}

/** Rolling, shrunk per-player usage and efficiency baselines. */
export interface PlayerBaseline {
  playerId: string;
  name: string;
  teamId: string;
  position: Position;
  baselineTargetShare: number;
  baselineRushShare: number;
  baselineRouteParticipation: number;
  baselineSnapShare: number;
  baselineYardsPerTarget: number;
  baselineYardsPerCarry: number;
  baselineCatchRate: number;
  baselineReceptionsPerGame: number;
  baselineCarriesPerGame: number;
  /** Baseline share of team pass attempts (QBs). */
  baselinePassAttemptShare: number;
  baselineYardsPerPassAttempt: number;
  baselineCompletionRate: number;
  /** Number of games backing these baselines — drives shrinkage and filters. */
  gamesSampleN: number;
}

/** Game context: lines, venue, weather. */
export interface GameContext {
  gameId: string;
  homeTeamId: string;
  awayTeamId: string;
  /** Home team's point spread. Negative means the home team is favored. */
  spreadHome: number;
  total: number;
  weatherType: WeatherType;
  windSpeedMph: number | null;
  temperatureF: number | null;
}

/** A sportsbook prop line. */
export interface PropLine {
  propId: string;
  gameId: string;
  playerId: string;
  propType: PropType;
  lineValue: number;
  oddsOverAmerican: number;
  oddsUnderAmerican: number;
  bookName: string;
  timestamp: string;
}
