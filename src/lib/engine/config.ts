/**
 * Every tunable coefficient in the model lives here.
 *
 * Keeping them in one versioned object means a backtest can be replayed against
 * the exact settings that produced it: each pipeline run stores `configVersion`
 * plus a snapshot of this object.
 */

import type { StatType } from "./types";

/**
 * Standard deviation is modelled as a linear function of the projected mean,
 * `sigma = intercept + slope * mu`, floored at `min`.
 *
 * A player's own historical standard deviation is a poor estimator on its own:
 * ~10 games is a tiny sample, and more importantly it is unconditional — it does
 * not know that this week's projected volume is unusually high or low. The
 * league-wide mean/sigma relationship is stable and volume-aware, so we blend
 * the two by sample size (see `sigmaBlend`).
 *
 * Defaults below are fit from nflverse weekly logs, 2021-2024 (see
 * `src/lib/ingest/varianceModel.ts`, which can refit and persist them).
 */
export interface SigmaModel {
  intercept: number;
  slope: number;
  min: number;
}

export type YardsDistribution = "truncated-normal" | "normal";
export type CountDistribution = "negative-binomial" | "poisson" | "normal";
export type DevigMethod = "multiplicative" | "power" | "none";

export interface EngineConfig {
  configVersion: string;

  league: {
    /** League-average game total, the pivot for the pace adjustment. */
    avgTotal: number;
    /** League-average offensive plays per team per game. */
    avgPlaysPerGame: number;
    avgPassRate: number;
    /** League-average absolute point spread, the pivot for the blowout adjustment. */
    avgAbsSpread: number;
    /** Share of dropbacks that end in a sack rather than a pass attempt. */
    sackRate: number;
    /**
     * Share of pass attempts that record a target. Throwaways, spikes and
     * batted balls are attempts with no targeted receiver, so team targets run
     * a few percent below team pass attempts.
     */
    targetsPerPassAttempt: number;
  };

  plays: {
    /**
     * Weight on the team's own pace vs. the opponent's when projecting plays.
     * 0.5 is the spec's "average of both teams' pace".
     */
    ownPaceWeight: number;
    /** Extra plays per point of game total above league average. */
    playsPerPointOfTotal: number;
    /**
     * Blowouts shorten games slightly (kneel-downs, clock burning).
     * Plays removed per point of absolute spread.
     */
    playsPerPointOfAbsSpread: number;
    minPlays: number;
    maxPlays: number;
  };

  volume: {
    /**
     * Rescale a team's usage shares so they sum to 1.
     *
     * DEFAULT OFF, and the reason is worth reading before turning it on.
     *
     * Reconciling shares to team volume sounds obviously correct, and it is —
     * but only if you know exactly who is playing. We do not. The candidate
     * roster includes everyone who featured in the last few weeks, roughly a
     * fifth of whom will be inactive on any given Sunday. Normalising across
     * that over-inclusive list hands a slice of the team's volume to players
     * who never take the field, and takes it from the ones who do.
     *
     * Measured on 2024 (scripts/diagnose.ts), normalising ON biased projections
     * for graded props LOW by 11-16% on every skill-position stat — receiving
     * yards -16.4%, receptions -15.6%, rushing yards -14.5% — while quarterback
     * markets, where the depth chart is unambiguous, stayed unbiased. Switching
     * it off brought every stat inside ±3%.
     *
     * Baseline shares are already conditional on the player having played, so
     * they need no reconciliation to be correct for a player who plays. Turn
     * this on only with a real inactives list narrowing the roster first.
     */
    normaliseTeamShares: boolean;
    /** Only normalise when the raw share sum falls inside this band. */
    shareSumSanityBand: [number, number];
  };

  gameScript: {
    /**
     * Absolute spread at which a team's leading/trailing pass rate applies in
     * full. The spec uses a hard ±6 threshold; we interpolate linearly up to
     * this value instead, so -6.5 and -7 favorites do not project
     * discontinuously.
     */
    spreadFullEffect: number;
    /** Hard cap on how far game script may move a team's pass rate. */
    maxPassRateShift: number;
    minPassRate: number;
    maxPassRate: number;
  };

  efficiency: {
    /**
     * How strongly opponent strength moves a player's efficiency. Applied as
     * `eff * (1 + weight * z)` where z is the opponent's standardised
     * yards-allowed figure. Defenses explain far less of per-play efficiency
     * than volume does, so this is deliberately modest.
     */
    defenseWeight: number;
    /** Clamp on the total defensive adjustment, as a proportion. */
    maxDefenseAdjustment: number;
    /** Wind speed (mph) above which passing efficiency starts to degrade. */
    windThresholdMph: number;
    /** Proportional passing efficiency lost per mph above the threshold. */
    windPenaltyPerMph: number;
    /** Proportional passing efficiency lost in rain or snow. */
    precipitationPenalty: number;
    maxWeatherPenalty: number;
  };

  distribution: {
    yards: YardsDistribution;
    counts: CountDistribution;
    /**
     * Shrinkage constant for blending a player's own sigma with the league
     * model: `w = n / (n + k)`. With k = 8, a player needs 8 games before their
     * own variance carries half the weight.
     */
    sigmaBlendK: number;
    /** Per-stat league sigma models. */
    sigmaModels: Record<StatType, SigmaModel>;
    /**
     * Minimum variance-to-mean ratio for count stats. Below 1 the negative
     * binomial is undefined (it requires overdispersion), so we fall back to
     * Poisson.
     */
    minVarianceMeanRatio: number;
  };

  odds: {
    /**
     * How the book's overround is removed before computing edge.
     *
     * Raw implied probabilities sum to ~1.04-1.08, so `model - rawImplied` is
     * biased negative on BOTH sides and systematically under-selects bets.
     * De-vigging recovers the book's fair probability, which is the correct
     * comparison point. Set to "none" for the literal behaviour in the spec.
     */
    devigMethod: DevigMethod;
  };

  selection: {
    /** Minimum edge over the fair probability required to bet. */
    minEdge: number;
    /** Minimum games of history behind a player's baselines. */
    minGamesSample: number;
    /** Reject props whose two sides imply more than this much total vig. */
    maxOverround: number;
    /** Reject model probabilities this close to 0 or 1 as implausible. */
    minModelProb: number;
    maxModelProb: number;
    /** Cap on the number of bets recommended per game. */
    maxBetsPerGame: number;
    /** Cap on the number of bets recommended per player. */
    maxBetsPerPlayer: number;
  };

  kelly: {
    /** Fraction of full Kelly to stake. */
    fraction: number;
    /** Hard cap on a single bet, in units (1 unit = 1% of bankroll). */
    maxUnits: number;
    /** Round stakes to this increment, in units. */
    roundToUnits: number;
    /** One unit as a proportion of bankroll. */
    unitFractionOfBankroll: number;
  };
}

export const DEFAULT_CONFIG: EngineConfig = {
  configVersion: "1.0.0",

  league: {
    avgTotal: 44.5,
    avgPlaysPerGame: 63,
    avgPassRate: 0.575,
    avgAbsSpread: 5.5,
    sackRate: 0.065,
    targetsPerPassAttempt: 0.95,
  },

  plays: {
    ownPaceWeight: 0.5,
    playsPerPointOfTotal: 0.35,
    playsPerPointOfAbsSpread: 0.15,
    minPlays: 45,
    maxPlays: 85,
  },

  volume: {
    normaliseTeamShares: false,
    shareSumSanityBand: [0.7, 1.4],
  },

  gameScript: {
    spreadFullEffect: 10,
    maxPassRateShift: 0.08,
    minPassRate: 0.3,
    maxPassRate: 0.78,
  },

  efficiency: {
    defenseWeight: 0.05,
    maxDefenseAdjustment: 0.15,
    windThresholdMph: 12,
    windPenaltyPerMph: 0.006,
    precipitationPenalty: 0.03,
    maxWeatherPenalty: 0.2,
  },

  distribution: {
    yards: "truncated-normal",
    counts: "negative-binomial",
    sigmaBlendK: 8,
    // Fitted by `npx tsx scripts/ingest.ts --seasons 2022-2025`, regressing each
    // player-season's weekly standard deviation on its weekly mean. Sample sizes
    // in parentheses.
    //
    // Quarterback volume comes back with a flat slope, and that is a real
    // pattern rather than a fitting artefact: high-attempt passers are
    // entrenched starters with stable roles, while low-attempt ones are backups
    // and injury fill-ins whose usage swings wildly. Sigma is therefore constant
    // for those markets.
    sigmaModels: {
      receiving_yards: { intercept: 7.7761, slope: 0.4796, min: 6 }, // n=1496
      rushing_yards: { intercept: 6.2744, slope: 0.4725, min: 5 }, // n=848
      passing_yards: { intercept: 66.0301, slope: 0.0426, min: 45 }, // n=178
      receptions: { intercept: 0.7589, slope: 0.3382, min: 0.5 }, // n=1339
      rush_attempts: { intercept: 1.7258, slope: 0.269, min: 0.8 }, // n=596
      pass_attempts: { intercept: 9.2342, slope: 0, min: 4 }, // n=178
      pass_completions: { intercept: 6.3161, slope: 0, min: 3 }, // n=178
    },
    minVarianceMeanRatio: 1.05,
  },

  odds: {
    devigMethod: "multiplicative",
  },

  selection: {
    minEdge: 0.03,
    minGamesSample: 4,
    maxOverround: 1.12,
    minModelProb: 0.05,
    maxModelProb: 0.95,
    maxBetsPerGame: 6,
    maxBetsPerPlayer: 2,
  },

  kelly: {
    fraction: 0.25,
    maxUnits: 0.5,
    roundToUnits: 0.05,
    unitFractionOfBankroll: 0.01,
  },
};

/** Deep-merge a partial override onto the default config. */
export function withConfig(overrides: DeepPartial<EngineConfig> = {}): EngineConfig {
  return mergeDeep(
    DEFAULT_CONFIG as unknown as Record<string, unknown>,
    overrides as Record<string, unknown>,
  ) as unknown as EngineConfig;
}

export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : T[K];
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mergeDeep(
  base: Record<string, unknown>,
  overrides: Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) continue;
    const current = out[key];
    out[key] =
      isPlainObject(current) && isPlainObject(value)
        ? mergeDeep(current, value)
        : value;
  }
  return out;
}
