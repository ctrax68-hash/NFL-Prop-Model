/**
 * Fit the league-wide relationship between a player's mean production and how
 * much it varies week to week.
 *
 * This is what makes sigma volume-aware. A receiver projected for 90 yards is
 * not just higher-mean than one projected for 30 — he is absolutely more
 * variable, and roughly proportionally so. Fitting `sigma = a + b * mean`
 * across every player-season captures that, and gives players with no usable
 * history a defensible starting point.
 */

import { linearFit, mean as arithmeticMean, stdDev } from "../engine/math";
import { DEFAULT_CONFIG, type SigmaModel } from "../engine/config";
import type { StatType } from "../engine/types";
import type { PlayerWeek } from "./nflverse";
import { before, type SeasonWeek } from "./asOf";

export interface VarianceFitOptions {
  /** Minimum games before a player contributes a point to the fit. */
  minGames: number;
  /** Drop players below this mean; near-zero usage adds noise, not signal. */
  minMean: number;
}

export const DEFAULT_VARIANCE_FIT_OPTIONS: VarianceFitOptions = {
  minGames: 6,
  minMean: 0.5,
};

const STAT_ACCESSORS: Record<StatType, (row: PlayerWeek) => number> = {
  receiving_yards: (row) => row.receivingYards,
  receptions: (row) => row.receptions,
  rushing_yards: (row) => row.rushingYards,
  rush_attempts: (row) => row.carries,
  passing_yards: (row) => row.passingYards,
  pass_attempts: (row) => row.attempts,
  pass_completions: (row) => row.completions,
};

/** Positions whose usage of a stat is meaningful, to keep the fit clean. */
const STAT_POSITIONS: Record<StatType, ReadonlySet<string>> = {
  receiving_yards: new Set(["WR", "TE", "RB", "FB"]),
  receptions: new Set(["WR", "TE", "RB", "FB"]),
  rushing_yards: new Set(["RB", "FB", "QB", "WR"]),
  rush_attempts: new Set(["RB", "FB", "QB"]),
  passing_yards: new Set(["QB"]),
  pass_attempts: new Set(["QB"]),
  pass_completions: new Set(["QB"]),
};

export interface SigmaFitResult {
  models: Record<StatType, SigmaModel>;
  /** Number of player-seasons behind each fit, for reporting. */
  sampleSizes: Record<StatType, number>;
}

export function fitSigmaModels(
  playerWeeks: readonly PlayerWeek[],
  asOf: SeasonWeek,
  options: VarianceFitOptions = DEFAULT_VARIANCE_FIT_OPTIONS,
): SigmaFitResult {
  const history = before(playerWeeks, asOf).filter(
    (row) => row.seasonType === "REG",
  );

  const models = { ...DEFAULT_CONFIG.distribution.sigmaModels };
  const sampleSizes = {} as Record<StatType, number>;

  for (const stat of Object.keys(STAT_ACCESSORS) as StatType[]) {
    const accessor = STAT_ACCESSORS[stat];
    const positions = STAT_POSITIONS[stat];

    // Group by player-season: a player's role can change entirely between
    // years, so pooling across seasons would inflate the measured variance.
    const bySeason = new Map<string, number[]>();
    for (const row of history) {
      if (!positions.has(row.position)) continue;
      const key = `${row.playerId}|${row.season}`;
      const list = bySeason.get(key);
      if (list) list.push(accessor(row));
      else bySeason.set(key, [accessor(row)]);
    }

    const points: Array<{ x: number; y: number }> = [];
    for (const values of bySeason.values()) {
      if (values.length < options.minGames) continue;
      const mu = arithmeticMean(values);
      const sd = stdDev(values);
      if (mu == null || sd == null || mu < options.minMean) continue;
      points.push({ x: mu, y: sd });
    }

    sampleSizes[stat] = points.length;

    if (points.length < 30) continue;

    const fit = linearFit(points);

    // A negative slope is a real pattern for quarterback volume — the
    // high-attempt passers are entrenched starters with stable roles, while
    // low-attempt ones are backups and injury fill-ins with erratic usage. It
    // is not a relationship worth extrapolating, though, so collapse to a
    // constant-sigma model rather than either trusting it or silently keeping
    // a hardcoded default.
    if (!fit || fit.slope <= 0) {
      const flat = arithmeticMean(points.map((p) => p.y));
      if (flat == null) continue;
      models[stat] = {
        intercept: round(flat),
        slope: 0,
        min: models[stat].min,
      };
      continue;
    }

    models[stat] = {
      intercept: round(Math.max(0, fit.intercept)),
      slope: round(fit.slope),
      min: models[stat].min,
    };
  }

  return { models, sampleSizes };
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
