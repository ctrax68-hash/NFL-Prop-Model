/**
 * Derive how much each defense allows, split by the position it is facing.
 *
 * Built by grouping weekly player rows on `opponent`: every receiving line a
 * defense gave up, summed by the receiver's position.
 */

import type { DefenseRates } from "../engine/types";
import type { LeagueDefenseNorms, Norm } from "../engine/efficiency";
import { stdDev } from "../engine/math";
import type { PlayerWeek } from "./nflverse";
import { before, shrink, type SeasonWeek } from "./asOf";

export interface DefenseOptions {
  /** Only use games from this many weeks back, across seasons. */
  windowGames: number;
  /**
   * Shrinkage constant in targets/carries. Defensive splits are noisy — a
   * defense that has faced 40 tight-end targets tells you much less than the
   * raw average suggests, so it gets pulled hard toward the league mean.
   */
  shrinkTargets: number;
  shrinkCarries: number;
}

export const DEFAULT_DEFENSE_OPTIONS: DefenseOptions = {
  windowGames: 17,
  shrinkTargets: 60,
  shrinkCarries: 60,
};

interface Tally {
  receivingYardsWr: number;
  targetsWr: number;
  receivingYardsTe: number;
  targetsTe: number;
  receivingYardsRb: number;
  targetsRb: number;
  rushingYardsRb: number;
  carriesRb: number;
  passingYardsQb: number;
  attemptsQb: number;
  dropbacksQb: number;
  weeks: Set<string>;
}

function emptyTally(): Tally {
  return {
    receivingYardsWr: 0,
    targetsWr: 0,
    receivingYardsTe: 0,
    targetsTe: 0,
    receivingYardsRb: 0,
    targetsRb: 0,
    rushingYardsRb: 0,
    carriesRb: 0,
    passingYardsQb: 0,
    attemptsQb: 0,
    dropbacksQb: 0,
    weeks: new Set(),
  };
}

export function computeDefenseRates(
  playerWeeks: readonly PlayerWeek[],
  asOf: SeasonWeek,
  options: DefenseOptions = DEFAULT_DEFENSE_OPTIONS,
): { rates: Map<string, DefenseRates>; norms: LeagueDefenseNorms } {
  const history = before(playerWeeks, asOf).filter(
    (row) => row.seasonType === "REG" && row.opponent,
  );

  // Restrict to the most recent `windowGames` weeks of real time, so a defense
  // is judged on its current personnel rather than three years of history.
  const cutoff = weekCutoff(history, options.windowGames);
  const windowed = history.filter(
    (row) => row.season > cutoff.season || (row.season === cutoff.season && row.week >= cutoff.week),
  );

  const byDefense = new Map<string, Tally>();
  const leagueTally = emptyTally();

  for (const row of windowed) {
    let tally = byDefense.get(row.opponent);
    if (!tally) {
      tally = emptyTally();
      byDefense.set(row.opponent, tally);
    }
    for (const target of [tally, leagueTally]) {
      accumulate(target, row);
    }
  }

  const leagueMeans = {
    vsWr: ratio(leagueTally.receivingYardsWr, leagueTally.targetsWr, 8.2),
    vsTe: ratio(leagueTally.receivingYardsTe, leagueTally.targetsTe, 7.9),
    vsRbRec: ratio(leagueTally.receivingYardsRb, leagueTally.targetsRb, 6.2),
    vsRbRush: ratio(leagueTally.rushingYardsRb, leagueTally.carriesRb, 4.3),
    vsQb: ratio(leagueTally.passingYardsQb, leagueTally.attemptsQb, 7.0),
    perDropback: ratio(leagueTally.passingYardsQb, leagueTally.dropbacksQb, 6.5),
  };

  const rates = new Map<string, DefenseRates>();

  for (const [team, tally] of byDefense) {
    rates.set(team, {
      teamId: team,
      defYardsPerDropbackAllowed: shrink(
        ratio(tally.passingYardsQb, tally.dropbacksQb, null),
        leagueMeans.perDropback,
        tally.dropbacksQb,
        options.shrinkTargets,
      ),
      defYardsPerCarryAllowed: shrink(
        ratio(tally.rushingYardsRb, tally.carriesRb, null),
        leagueMeans.vsRbRush,
        tally.carriesRb,
        options.shrinkCarries,
      ),
      vsWrYardsPerTargetAllowed: shrink(
        ratio(tally.receivingYardsWr, tally.targetsWr, null),
        leagueMeans.vsWr,
        tally.targetsWr,
        options.shrinkTargets,
      ),
      vsTeYardsPerTargetAllowed: shrink(
        ratio(tally.receivingYardsTe, tally.targetsTe, null),
        leagueMeans.vsTe,
        tally.targetsTe,
        options.shrinkTargets,
      ),
      vsRbRecYardsPerTargetAllowed: shrink(
        ratio(tally.receivingYardsRb, tally.targetsRb, null),
        leagueMeans.vsRbRec,
        tally.targetsRb,
        options.shrinkTargets,
      ),
      vsRbRushYardsPerCarryAllowed: shrink(
        ratio(tally.rushingYardsRb, tally.carriesRb, null),
        leagueMeans.vsRbRush,
        tally.carriesRb,
        options.shrinkCarries,
      ),
      vsQbYardsPerAttemptAllowed: shrink(
        ratio(tally.passingYardsQb, tally.attemptsQb, null),
        leagueMeans.vsQb,
        tally.attemptsQb,
        options.shrinkTargets,
      ),
    });
  }

  return { rates, norms: computeNorms([...rates.values()], leagueMeans) };
}

function accumulate(tally: Tally, row: PlayerWeek): void {
  tally.weeks.add(`${row.season}|${row.week}`);
  switch (row.position) {
    case "WR":
      tally.receivingYardsWr += row.receivingYards;
      tally.targetsWr += row.targets;
      break;
    case "TE":
      tally.receivingYardsTe += row.receivingYards;
      tally.targetsTe += row.targets;
      break;
    case "RB":
    case "FB":
      tally.receivingYardsRb += row.receivingYards;
      tally.targetsRb += row.targets;
      tally.rushingYardsRb += row.rushingYards;
      tally.carriesRb += row.carries;
      break;
    case "QB":
      tally.passingYardsQb += row.passingYards;
      tally.attemptsQb += row.attempts;
      tally.dropbacksQb += row.attempts + row.sacksSuffered;
      break;
    default:
      break;
  }
}

function ratio(numerator: number, denominator: number, fallback: number): number;
function ratio(numerator: number, denominator: number, fallback: null): number | null;
function ratio(
  numerator: number,
  denominator: number,
  fallback: number | null,
): number | null {
  return denominator > 0 ? numerator / denominator : fallback;
}

/**
 * League mean and spread for each split, used to z-score an opponent.
 * The spread is measured across the shrunk team values, which is what the
 * engine actually consumes.
 */
function computeNorms(
  rates: readonly DefenseRates[],
  leagueMeans: {
    vsWr: number;
    vsTe: number;
    vsRbRec: number;
    vsRbRush: number;
    vsQb: number;
  },
): LeagueDefenseNorms {
  const norm = (values: number[], mean: number): Norm => ({
    mean,
    sd: stdDev(values) ?? Math.max(0.05, Math.abs(mean) * 0.05),
  });

  return {
    vsWrYardsPerTarget: norm(
      rates.map((r) => r.vsWrYardsPerTargetAllowed),
      leagueMeans.vsWr,
    ),
    vsTeYardsPerTarget: norm(
      rates.map((r) => r.vsTeYardsPerTargetAllowed),
      leagueMeans.vsTe,
    ),
    vsRbRecYardsPerTarget: norm(
      rates.map((r) => r.vsRbRecYardsPerTargetAllowed),
      leagueMeans.vsRbRec,
    ),
    vsRbRushYardsPerCarry: norm(
      rates.map((r) => r.vsRbRushYardsPerCarryAllowed),
      leagueMeans.vsRbRush,
    ),
    vsQbYardsPerAttempt: norm(
      rates.map((r) => r.vsQbYardsPerAttemptAllowed),
      leagueMeans.vsQb,
    ),
  };
}

/** The (season, week) that is `windowGames` weeks before the latest row. */
function weekCutoff(
  rows: readonly SeasonWeek[],
  windowGames: number,
): SeasonWeek {
  if (rows.length === 0) return { season: 0, week: 0 };

  const unique = [
    ...new Set(rows.map((row) => `${row.season}|${row.week}`)),
  ]
    .map((key) => {
      const [season, week] = key.split("|").map(Number);
      return { season, week };
    })
    .sort((a, b) => (a.season - b.season) || (a.week - b.week));

  const index = Math.max(0, unique.length - windowGames);
  return unique[index];
}
