/**
 * Every tunable coefficient in the model lives here.
 *
 * Keeping them in one versioned object means a backtest can be replayed against
 * the exact settings that produced it: each pipeline run stores `configVersion`
 * plus a snapshot of this object.
 */

import type { ContinuousStatType, StatType } from "./types";

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

/** Logistic model for `P(X=0)`, in addition to whatever the count family implies. */
export interface HurdleModel {
  intercept: number;
  meanCoef: number;
  snapShareCoef: number;
  /**
   * Restricts this model to QB props only (see the field comment on
   * `distribution.hurdle` below for why rushing_yards needs this). Absent
   * means it applies to every player at this stat, as receptions always has.
   */
  qbOnly?: boolean;
}

export type YardsDistribution = "truncated-normal" | "normal" | "gamma";
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
    /**
     * Continuous family per yardage stat — deliberately not one global choice.
     *
     * Passing yards is a sum over ~35 attempts and comes out close to
     * symmetric; receiving and rushing yards are sums over a handful of
     * touches and are heavily right-skewed with a real chance of zero. Forcing
     * one family on both measurably breaks whichever one it does not fit.
     */
    yards: Record<ContinuousStatType, YardsDistribution>;
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
    /**
     * Per-stat hurdle models: `P(X=0) = sigmoid(intercept +
     * meanCoef*log(mean+0.1) + snapShareCoef*snapShare)`, with the negative
     * binomial rescaled to a zero-truncated distribution to carry the
     * remaining mass. Absent for a stat, that stat's zero probability is
     * whatever the plain negative binomial already implies — this is
     * additive, not a replacement.
     *
     * `log(mean)`, not raw `mean`: fitting on the raw value flipped
     * `snapShareCoef` positive — mean and snap share are correlated at 0.70 in
     * the fitting sample, and a linear-in-mean term was different enough from
     * the true relationship that the optimiser partly routed mean's own
     * effect through the correlated snap-share term to compensate, in a
     * direction that does not generalise. The marginal (snap-share-only) fit
     * was correctly signed throughout; only the joint fit broke, and only
     * with the linear form. `log(mean+0.1)` fixed it — verified against the
     * `--zero` diagnostic's own within-bin tercile numbers, not just a
     * sign check.
     *
     * Only present for stats where snap share was measured to add real signal
     * beyond what projected volume alone explains — see
     * `scripts/fit-distribution.ts --zero`. Notably absent: receiving_yards,
     * despite `--zero` making as strong a case for it as receptions' own
     * — see the comment inside `DEFAULT_CONFIG.distribution.hurdle` below
     * for why it isn't here anyway: tried, and it measurably regressed held-
     * out calibration rather than improving it.
     *
     * rushing_yards is `qbOnly`: a QB and a non-QB projected for the exact
     * same rushing volume have very different zero-rush rates — a QB's
     * volume comes from occasional scrambles even when the plan is to pass, a
     * non-QB's from called runs — and `scripts/fit-distribution.ts --zero`'s
     * `ZERO-RATE vs POSITION` section shows it directly: at the same
     * trailing-average volume, a QB is roughly half to a third as likely to
     * finish with exactly zero rushing yards as a non-QB. Without this, the
     * board priced tiny "anytime rushed for positive yards"-style lines on
     * pocket passers (Stafford, Rodgers, Goff) at 86-91% when their own
     * trailing zero-rush rate was 27-35%. A first attempt fit one model
     * jointly across both groups with a QB indicator term; that measurably
     * worsened non-QB calibration in the 2023-25 backtest (non-QB rushing was
     * already fine on its own), so this is fit on QB rows only and gated to
     * QB props in `continuousOverUnder` — fixing the population that was
     * actually wrong without touching the one that wasn't.
     *
     * receptions is the one open question mark despite having a hurdle
     * already: its bias is consistently negative (never flips sign) but grew
     * from -2.46pp on 2023-24 to -4.26pp on 2025 — the first season never
     * used to fit anything in this file. A sigma-model refit on an expanded
     * 2020-24 window barely moved it (-4.26pp -> -4.22pp), ruling out
     * variance as the cause; the discrete hurdle's own rescaling
     * (`applyHurdle`) doesn't share receiving_yards' mean-inflation
     * mechanism above, so that specific failure mode is ruled out too. No
     * validated fix found — left as-is rather than adjusting a coefficient
     * on a hunch. Worth another look with a dedicated diagnostic pass.
     */
    hurdle: Partial<Record<StatType, HurdleModel>>;
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

  injury: {
    /**
     * Multiplies a Questionable player's usage-share baselines (target,
     * rush, pass-attempt share) before projection. 1 = no adjustment.
     *
     * A player ruled Out is excluded outright (see `run.ts`, next to the
     * other roster filters) — that is a factual correction, not a
     * coefficient. This multiplier is different: it is a genuine modelling
     * choice about how much an ambiguous "probably plays, maybe less" tag
     * should discount projected volume, and `volume.normaliseTeamShares`'s
     * own comment above is the standing reminder that a plausible-sounding
     * roster adjustment can bias projections by double-digit percentages if
     * it is not actually measured.
     *
     * Measured on 2023-24 (a blanket 0.85 questionable / 0.6 doubtful,
     * applied uniformly across every position and share type): overall mean
     * calibration error improved (1.20pp -> 1.09pp) and receiving-side bias
     * shrank (receptions -2.46pp -> -1.91pp, receiving_yards -1.18pp ->
     * -1.00pp, rushing_yards -2.16pp -> -1.89pp) — but passing-side markets
     * got measurably worse (pass_attempts +4.18pp -> +4.70pp,
     * pass_completions +3.79pp -> +4.15pp, rush_attempts +1.11pp ->
     * +1.46pp). A QB listed Questionable evidently doesn't lose pass-attempt
     * share the way a banged-up receiver loses target share — most likely
     * because an ambiguously-injured starting QB either plays his normal
     * snap count or is replaced outright, not a fractional in-between the
     * way a receiver's routes-per-game can taper. The same 0.85/0.6 numbers
     * were also never independently fit and evaluated on a held-out split
     * the way the sigma models and hurdle coefficients above are — this run
     * tuned and scored on the same 2023-24 window, so the improvement could
     * be partly in-sample noise. Net effect positive, but not rigorously
     * enough established to flip the default — same bar the rushing_yards
     * hurdle above had to clear before it was gated to QBs only. Left at 1
     * until a share-type/position-specific fit (mirroring that hurdle's own
     * QB-only carve-out) is actually done: a two-config `runBacktest`
     * comparison over the same seasons, diffing `calibrationByPropType` the
     * way the numbers above were produced.
     */
    questionableVolumeMultiplier: number;
    /** Same idea as `questionableVolumeMultiplier`, for a Doubtful designation. */
    doubtfulVolumeMultiplier: number;
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
    // Gamma for the skill-position stats. Originally measured on 2023-24
    // alone (receiving -7.3pp -> -1.5pp, rushing -7.4pp -> -2.3pp, passing
    // worse at +4.0pp -> +8.1pp) — re-measured on the full 2023-2025 pool
    // once 2025 became available as a third season, since a single season on
    // the QB-only passing stat (n≈550-1100) is noisy enough that 2025 alone
    // actually favoured gamma for passing (the opposite conclusion) purely
    // from sampling variance. Pooling three seasons resolves that: receiving
    // -7.9pp -> -1.4pp, rushing -7.1pp -> -1.6pp, passing -0.8pp -> +3.2pp
    // (n=9018/4552/1667) — same conclusion as the original 2023-24 read, now
    // on a sample too large for either single season's noise to flip it.
    // This is why the choice is per-stat and passing stays on the symmetric
    // family.
    yards: {
      receiving_yards: "gamma",
      rushing_yards: "gamma",
      passing_yards: "truncated-normal",
    },
    counts: "negative-binomial",
    sigmaBlendK: 8,
    // Refitted by `npx tsx scripts/fit-distribution.ts --seasons 2020-2022 --fit`,
    // regressing each player's own weekly standard deviation on their own weekly
    // mean — the exact quantity `leagueSigma()` consumes. Fitted on 2020-2022
    // and deliberately held out from the 2023-24 backtest these numbers are
    // judged on, so the improvement is out-of-sample rather than a re-description
    // of the evaluation set. Refitting on 2023-24 independently lands within a
    // few percent on every stat, which is the reassurance that these are real
    // parameters and not noise.
    //
    // This replaces an earlier fit whose comment asserted that quarterback
    // volume genuinely has a flat sigma slope — entrenched starters being stable
    // and backups volatile — and encoded that as `slope: 0`. Both disjoint
    // fitting windows put the QB slope near 0.30, so the flat result was a
    // small-sample artefact (n=178) rather than the real pattern it was
    // described as. Holding sigma constant across volume left QB props the
    // worst-calibrated markets on the board.
    sigmaModels: {
      receiving_yards: { intercept: 7.4244, slope: 0.5349, min: 6 }, // n=635
      rushing_yards: { intercept: 4.6355, slope: 0.5701, min: 5 }, // n=477
      passing_yards: { intercept: 22.3941, slope: 0.2975, min: 45 }, // n=124
      receptions: { intercept: 0.6357, slope: 0.4198, min: 0.5 }, // n=641
      rush_attempts: { intercept: 0.7296, slope: 0.4374, min: 0.8 }, // n=516
      pass_attempts: { intercept: 1.8959, slope: 0.307, min: 4 }, // n=155
      pass_completions: { intercept: 1.8969, slope: 0.2888, min: 3 }, // n=124
    },
    minVarianceMeanRatio: 1.05,
    // Fitted by `npx tsx scripts/fit-distribution.ts --seasons 2020-2022 --fit-hurdle`,
    // logistic-regressing P(actual=0) on log(projected volume) and snap share
    // (see the `hurdle` field comment above for why log, not raw, volume), on
    // the same out-of-sample split as the sigma refit. In-sample: actual and
    // mean-predicted zero rate both 25.5% on n=13,747. Only receptions —
    // rush_attempts's snap-share relationship was materially weaker and
    // noisier in `--zero`'s own output, and it is already well-calibrated
    // (+1.1pp bias) without this.
    hurdle: {
      receptions: { intercept: -0.3268, meanCoef: -1.4815, snapShareCoef: -0.3889 }, // n=13747
      rushing_yards: {
        intercept: -0.5815,
        meanCoef: -0.6765,
        snapShareCoef: 0.2765,
        qbOnly: true,
      }, // n=1594, QB rows only
      // No receiving_yards entry, despite `--zero`'s own numbers making as
      // strong a case for one as receptions': a real, monotonic zero-rate
      // gradient by snap-share tercile at every volume bin, an in-sample
      // logistic fit that lands on the actual zero-rate almost exactly, and
      // two independent fitting windows (2020-22, 2020-24) agreeing within a
      // few percent on every coefficient. Tried it anyway
      // ({ intercept: 1.7843, meanCoef: -0.9220, snapShareCoef: -1.1357 },
      // n=13578, the 2020-22 fit) and it made held-out calibration measurably
      // *worse*: the 2023-24 backtest's receiving_yards bias went from
      // -1.18pp to -2.8pp, not toward zero.
      //
      // Best current explanation, unconfirmed: `familyMean = mean/(1-p0)`
      // (see `continuousOverUnder`) inflates the gamma family's mean once a
      // hurdle is active, but `sigma` is still `leagueSigma(sigmaModel,
      // mean)` computed from the *original*, non-inflated mean — for
      // rushing_yards this is harmless because the hurdle is QB-only, a
      // small slice of that stat's props, but every receiving_yards prop
      // clears MARKETS_BY_POSITION's minProjection (12-20 yards), which is
      // already past the volume range where the zero-rate gap is largest, so
      // broadening it to every prop compounds the mean/sigma mismatch across
      // the whole population that actually gets priced. Fixing that
      // properly means changing how sigma is computed for every hurdle-
      // active stat, which risks the already-validated receptions and QB
      // rushing_yards hurdles — too large a change to make on a hunch.
      // Left off; the -2.1pp (2025) / -2.8pp (2023-24, with the reverted fit
      // still in the config at measurement time) receiving_yards bias is a
      // known, open item, not a fixed one. See scripts/fit-distribution.ts
      // --seasons <window> --zero to reproduce.
    },
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

  // DEFAULT OFF (1 = no-op), pending a real backtest comparison — see the
  // field comments above. Ship a measured value here the same way every
  // other coefficient in this file arrived, not a plausible-sounding guess.
  injury: {
    questionableVolumeMultiplier: 1,
    doubtfulVolumeMultiplier: 1,
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
