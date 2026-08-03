/**
 * Derive team pace and pass/rush tendencies from weekly player statistics.
 *
 * The spec's situational splits (pass rate when leading / trailing) normally
 * come from play-by-play. Play-by-play for a single season is a ~100 MB file,
 * and we need several seasons, so instead we approximate at the game level:
 * a team's "leading" pass rate is its pass rate across games it comfortably
 * won, and its "trailing" rate is its pass rate across games it comfortably
 * lost. That captures the same behaviour — how a team plays when the script
 * goes their way — using files three orders of magnitude smaller.
 *
 * The approximation is coarser than play-level splits because a game a team led
 * throughout still contains early-game neutral snaps. It therefore understates
 * the true spread between the two states, which makes the game-script
 * adjustment conservative rather than overconfident.
 */

import type { TeamRates } from "../engine/types";
import type { GameRow, PlayerWeek } from "./nflverse";
import {
  before,
  decayWeights,
  mostRecentFirst,
  shrink,
  weightedMean,
  type SeasonWeek,
} from "./asOf";

export interface TeamWeek extends SeasonWeek {
  team: string;
  opponent: string;
  passAttempts: number;
  sacks: number;
  dropbacks: number;
  carries: number;
  plays: number;
  targets: number;
  passingYards: number;
  rushingYards: number;
  passRate: number;
}

/**
 * Roll weekly player rows up to team-weeks.
 * Plays are dropbacks plus carries; a sack is a called pass that never became
 * an attempt, so it counts toward pass volume but not toward attempts.
 */
export function aggregateTeamWeeks(playerWeeks: readonly PlayerWeek[]): TeamWeek[] {
  const byKey = new Map<string, TeamWeek>();

  for (const row of playerWeeks) {
    if (row.seasonType !== "REG" || !row.team) continue;
    const key = `${row.season}|${row.week}|${row.team}`;

    let entry = byKey.get(key);
    if (!entry) {
      entry = {
        season: row.season,
        week: row.week,
        team: row.team,
        opponent: row.opponent,
        passAttempts: 0,
        sacks: 0,
        dropbacks: 0,
        carries: 0,
        plays: 0,
        targets: 0,
        passingYards: 0,
        rushingYards: 0,
        passRate: 0,
      };
      byKey.set(key, entry);
    }

    entry.passAttempts += row.attempts;
    entry.sacks += row.sacksSuffered;
    entry.carries += row.carries;
    entry.targets += row.targets;
    entry.passingYards += row.passingYards;
    entry.rushingYards += row.rushingYards;
  }

  const out: TeamWeek[] = [];
  for (const entry of byKey.values()) {
    entry.dropbacks = entry.passAttempts + entry.sacks;
    entry.plays = entry.dropbacks + entry.carries;
    entry.passRate = entry.plays > 0 ? entry.dropbacks / entry.plays : 0;
    // A team-week with almost no volume is a data artefact, not a real game.
    if (entry.plays >= 20) out.push(entry);
  }
  return out;
}

/** Point margin for each team in each game, keyed `season|week|team`. */
export function buildMarginIndex(games: readonly GameRow[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const game of games) {
    if (game.homeScore == null || game.awayScore == null) continue;
    const margin = game.homeScore - game.awayScore;
    index.set(`${game.season}|${game.week}|${game.homeTeam}`, margin);
    index.set(`${game.season}|${game.week}|${game.awayTeam}`, -margin);
  }
  return index;
}

export interface TeamRatesOptions {
  /** Most recent games to consider. */
  windowGames: number;
  /** Recency decay per game. */
  decay: number;
  /** Margin that counts a game as decisively won or lost. */
  scriptMarginThreshold: number;
  /** Shrinkage constant, in games, for the situational splits. */
  situationalShrinkGames: number;
}

export const DEFAULT_TEAM_RATES_OPTIONS: TeamRatesOptions = {
  windowGames: 17,
  decay: 0.96,
  scriptMarginThreshold: 4,
  situationalShrinkGames: 5,
};

export interface LeagueTeamAverages {
  pacePlaysPerGame: number;
  passRate: number;
  yardsPerDropback: number;
  yardsPerCarry: number;
}

export function computeTeamRates(
  teamWeeks: readonly TeamWeek[],
  margins: ReadonlyMap<string, number>,
  asOf: SeasonWeek,
  options: TeamRatesOptions = DEFAULT_TEAM_RATES_OPTIONS,
): { rates: Map<string, TeamRates>; league: LeagueTeamAverages } {
  const history = before(teamWeeks, asOf);

  const byTeam = new Map<string, TeamWeek[]>();
  for (const week of history) {
    const list = byTeam.get(week.team);
    if (list) list.push(week);
    else byTeam.set(week.team, [week]);
  }

  const league = leagueAverages(history);
  const rates = new Map<string, TeamRates>();

  for (const [team, weeks] of byTeam) {
    const recent = mostRecentFirst(weeks).slice(0, options.windowGames);
    if (recent.length === 0) continue;

    const weights = decayWeights(recent.length, options.decay);

    const pace =
      weightedMean(recent.map((w) => w.plays), weights) ?? league.pacePlaysPerGame;
    const passRateOverall =
      weightedMean(recent.map((w) => w.passRate), weights) ?? league.passRate;

    const leading: number[] = [];
    const trailing: number[] = [];
    for (const week of recent) {
      const margin = margins.get(`${week.season}|${week.week}|${week.team}`);
      if (margin == null) continue;
      if (margin >= options.scriptMarginThreshold) leading.push(week.passRate);
      else if (margin <= -options.scriptMarginThreshold) trailing.push(week.passRate);
    }

    // Shrink each split toward the team's own overall rate: a team with two
    // blowout wins on record should not have its whole leading profile
    // determined by them.
    const passRateWhenLeading = shrink(
      average(leading),
      passRateOverall,
      leading.length,
      options.situationalShrinkGames,
    );
    const passRateWhenTrailing = shrink(
      average(trailing),
      passRateOverall,
      trailing.length,
      options.situationalShrinkGames,
    );

    const dropbacks = sum(recent.map((w) => w.dropbacks));
    const carries = sum(recent.map((w) => w.carries));

    rates.set(team, {
      teamId: team,
      pacePlaysPerGame: pace,
      // 60 minutes of game clock across both offenses, split by share of plays.
      paceSecondsPerPlay: pace > 0 ? 1800 / pace : 30,
      passRateOverall,
      rushRateOverall: 1 - passRateOverall,
      passRateWhenTrailing,
      passRateWhenLeading,
      offYardsPerDropback:
        dropbacks > 0
          ? sum(recent.map((w) => w.passingYards)) / dropbacks
          : league.yardsPerDropback,
      offYardsPerCarry:
        carries > 0
          ? sum(recent.map((w) => w.rushingYards)) / carries
          : league.yardsPerCarry,
    });
  }

  return { rates, league };
}

function leagueAverages(weeks: readonly TeamWeek[]): LeagueTeamAverages {
  if (weeks.length === 0) {
    return {
      pacePlaysPerGame: 63,
      passRate: 0.575,
      yardsPerDropback: 6.5,
      yardsPerCarry: 4.3,
    };
  }
  const dropbacks = sum(weeks.map((w) => w.dropbacks));
  const carries = sum(weeks.map((w) => w.carries));
  return {
    pacePlaysPerGame: sum(weeks.map((w) => w.plays)) / weeks.length,
    passRate: dropbacks / (dropbacks + carries),
    yardsPerDropback:
      dropbacks > 0 ? sum(weeks.map((w) => w.passingYards)) / dropbacks : 6.5,
    yardsPerCarry:
      carries > 0 ? sum(weeks.map((w) => w.rushingYards)) / carries : 4.3,
  };
}

function sum(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function average(values: readonly number[]): number | null {
  return values.length > 0 ? sum(values) / values.length : null;
}
