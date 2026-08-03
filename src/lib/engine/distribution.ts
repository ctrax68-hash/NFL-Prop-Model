/**
 * Steps 5-7 of the spec: estimate variance, assume a distribution, and turn a
 * projection plus a line into over/under probabilities.
 */

import { bisect, clamp, logGamma, normalCdf, normalPdf } from "./math";
import type { EngineConfig, SigmaModel } from "./config";
import { isDiscreteStat, type StatType } from "./types";

// ---------------------------------------------------------------------------
// Step 5 — variance estimation
// ---------------------------------------------------------------------------

export interface SigmaInput {
  stat: StatType;
  /** This week's projected mean. */
  projectedMean: number;
  /** The player's own historical standard deviation, if we have enough games. */
  playerSigma?: number | null;
  /** The mean those historical games were centred on, used to rescale sigma. */
  playerMean?: number | null;
  /** Number of games behind the player's own estimate. */
  playerGames: number;
}

/** League-wide sigma as a function of the projected mean. */
export function leagueSigma(model: SigmaModel, projectedMean: number): number {
  return Math.max(model.min, model.intercept + model.slope * Math.max(0, projectedMean));
}

/**
 * Blend the player's own observed variability with the league-wide
 * volume/variance relationship.
 *
 * Two problems with using a player's raw historical sigma alone, both of which
 * this addresses:
 *   1. Sample size. Ten games gives a very noisy sigma estimate, so we shrink
 *      toward the league model with weight `n / (n + k)`.
 *   2. It is unconditional. A player's sigma measured over a stretch where they
 *      saw 5 targets a game says little about a week they project for 11. We
 *      rescale their sigma by the ratio of league sigma at the projected mean
 *      to league sigma at their historical mean before blending.
 */
export function estimateSigma(input: SigmaInput, config: EngineConfig): number {
  const model = config.distribution.sigmaModels[input.stat];
  const baseline = leagueSigma(model, input.projectedMean);

  const { playerSigma, playerMean, playerGames } = input;
  if (playerSigma == null || !Number.isFinite(playerSigma) || playerGames < 2) {
    return baseline;
  }

  let scaledPlayerSigma = playerSigma;
  if (playerMean != null && Number.isFinite(playerMean) && playerMean > 0) {
    const sigmaAtPlayerMean = leagueSigma(model, playerMean);
    if (sigmaAtPlayerMean > 0) {
      scaledPlayerSigma = playerSigma * (baseline / sigmaAtPlayerMean);
    }
  }

  const weight = playerGames / (playerGames + config.distribution.sigmaBlendK);
  const blended = weight * scaledPlayerSigma + (1 - weight) * baseline;
  return Math.max(model.min, blended);
}

// ---------------------------------------------------------------------------
// Step 6 — distributions
// ---------------------------------------------------------------------------

/**
 * Mean of a N(m, s^2) distribution truncated to [0, inf).
 * Always greater than `m`, because the negative tail is folded away.
 */
export function truncatedNormalMean(m: number, s: number): number {
  const alpha = -m / s;
  const denominator = normalCdf(-alpha);
  if (denominator < 1e-300) {
    // Deep in the left tail; use the asymptotic Mills ratio to stay finite.
    const a = Math.abs(alpha);
    return m + s * (a + 1 / a);
  }
  return m + (s * normalPdf(alpha)) / denominator;
}

/**
 * Find the underlying `m` such that N(m, s^2) truncated at zero has mean
 * `targetMean`.
 *
 * Truncation is the right call — a 25-yard projection with sigma 22 otherwise
 * puts ~13% of its mass below zero, which is impossible and distorts the under.
 * But naive truncation also silently shifts the mean upward, so the projection
 * would no longer be the distribution's expected value. Solving for `m` keeps
 * both properties: non-negative support and a mean equal to the projection.
 */
export function solveTruncatedNormalLocation(targetMean: number, s: number): number {
  if (targetMean <= 0) return -8 * s;
  // truncatedNormalMean is increasing in m, and exceeds m everywhere, so
  // [-25s, targetMean] brackets the root.
  return bisect(
    (m) => truncatedNormalMean(m, s) - targetMean,
    -25 * s,
    targetMean,
    1e-10,
  );
}

/** Negative binomial parameters derived from a mean and variance. */
export function negBinomialParams(
  mu: number,
  variance: number,
): { r: number; p: number } {
  const p = mu / variance;
  const r = (mu * mu) / (variance - mu);
  return { r, p };
}

export function negBinomialPmf(k: number, r: number, p: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  return Math.exp(
    logGamma(k + r) -
      logGamma(r) -
      logGamma(k + 1) +
      r * Math.log(p) +
      k * Math.log1p(-p),
  );
}

export function negBinomialCdf(k: number, r: number, p: number): number {
  if (k < 0) return 0;
  const limit = Math.floor(k);
  let total = 0;
  for (let j = 0; j <= limit; j += 1) {
    total += negBinomialPmf(j, r, p);
  }
  return clamp(total, 0, 1);
}

export function poissonPmf(k: number, lambda: number): number {
  if (k < 0 || !Number.isInteger(k)) return 0;
  if (lambda <= 0) return k === 0 ? 1 : 0;
  return Math.exp(-lambda + k * Math.log(lambda) - logGamma(k + 1));
}

export function poissonCdf(k: number, lambda: number): number {
  if (k < 0) return 0;
  const limit = Math.floor(k);
  let total = 0;
  for (let j = 0; j <= limit; j += 1) {
    total += poissonPmf(j, lambda);
  }
  return clamp(total, 0, 1);
}

// ---------------------------------------------------------------------------
// Step 7 — over/under probabilities
// ---------------------------------------------------------------------------

export interface OverUnderInput {
  stat: StatType;
  /** Projected mean for this player/game. */
  mean: number;
  /** Standard deviation from {@link estimateSigma}. */
  sigma: number;
  /** The sportsbook line. */
  line: number;
}

export interface OverUnderResult {
  probOver: number;
  probUnder: number;
  /** Non-zero only on integer lines, where the exact result refunds the stake. */
  probPush: number;
  distribution: string;
}

/**
 * Probability the result lands over/under/on the line.
 *
 * Push handling is not cosmetic. On an integer line the two sides do not sum to
 * 1, and treating them as if they did overstates whichever side you are
 * pricing. Books mostly post half-point lines where this is moot, but receptions
 * and rush attempts are routinely offered on integers.
 */
export function computeOverUnder(
  input: OverUnderInput,
  config: EngineConfig,
): OverUnderResult {
  const { stat, line } = input;
  const mean = Math.max(0, input.mean);
  const sigma = Math.max(1e-6, input.sigma);

  return isDiscreteStat(stat)
    ? discreteOverUnder(stat, mean, sigma, line, config)
    : continuousOverUnder(mean, sigma, line, config);
}

function continuousOverUnder(
  mean: number,
  sigma: number,
  line: number,
  config: EngineConfig,
): OverUnderResult {
  const useTruncated = config.distribution.yards === "truncated-normal";
  const location = useTruncated
    ? solveTruncatedNormalLocation(mean, sigma)
    : mean;

  // Probability the underlying normal exceeds `x`, conditioned on X >= 0 when
  // truncation is enabled.
  const survival = (x: number): number => {
    const upper = normalCdf((location - x) / sigma);
    if (!useTruncated) return upper;
    const massAboveZero = normalCdf(location / sigma);
    if (massAboveZero < 1e-300) return 0;
    return clamp(upper / massAboveZero, 0, 1);
  };

  // Yardage totals are integers in reality even though we model them
  // continuously, so an integer line can push. Apply a continuity correction:
  // the integer outcome L covers the continuous interval [L - 0.5, L + 0.5).
  if (Number.isInteger(line)) {
    const probOver = survival(line + 0.5);
    const probUnder = clamp(1 - survival(line - 0.5), 0, 1);
    const probPush = clamp(1 - probOver - probUnder, 0, 1);
    return {
      probOver,
      probUnder,
      probPush,
      distribution: useTruncated ? "truncated-normal" : "normal",
    };
  }

  const probOver = survival(line);
  return {
    probOver,
    probUnder: clamp(1 - probOver, 0, 1),
    probPush: 0,
    distribution: useTruncated ? "truncated-normal" : "normal",
  };
}

function discreteOverUnder(
  stat: StatType,
  mean: number,
  sigma: number,
  line: number,
  config: EngineConfig,
): OverUnderResult {
  const variance = sigma * sigma;
  const preference = config.distribution.counts;

  let cdf: (k: number) => number;
  let pmf: (k: number) => number;
  let distribution: string;

  if (preference === "normal") {
    return continuousOverUnder(mean, sigma, line, config);
  }

  const overdispersed =
    preference === "negative-binomial" &&
    mean > 0 &&
    variance / mean >= config.distribution.minVarianceMeanRatio;

  if (overdispersed) {
    const { r, p } = negBinomialParams(mean, variance);
    cdf = (k) => negBinomialCdf(k, r, p);
    pmf = (k) => negBinomialPmf(k, r, p);
    distribution = "negative-binomial";
  } else {
    // Underdispersed relative to Poisson, or Poisson explicitly requested.
    // The negative binomial is undefined when variance <= mean.
    cdf = (k) => poissonCdf(k, mean);
    pmf = (k) => poissonPmf(k, mean);
    distribution = "poisson";
  }

  if (Number.isInteger(line)) {
    const probPush = pmf(line);
    const probUnder = cdf(line - 1);
    const probOver = clamp(1 - cdf(line), 0, 1);
    return { probOver, probUnder, probPush, distribution };
  }

  const probUnder = cdf(Math.floor(line));
  return {
    probOver: clamp(1 - probUnder, 0, 1),
    probUnder,
    probPush: 0,
    distribution,
  };
}

// ---------------------------------------------------------------------------
// Charting support
// ---------------------------------------------------------------------------

export interface DensityPoint {
  x: number;
  y: number;
}

/**
 * Sample the modelled distribution for the prop-detail chart.
 * Continuous stats return a smooth density; counts return their pmf.
 */
export function densityCurve(
  input: Omit<OverUnderInput, "line">,
  config: EngineConfig,
  points = 120,
): DensityPoint[] {
  const mean = Math.max(0, input.mean);
  const sigma = Math.max(1e-6, input.sigma);

  if (isDiscreteStat(input.stat) && config.distribution.counts !== "normal") {
    const variance = sigma * sigma;
    const overdispersed =
      config.distribution.counts === "negative-binomial" &&
      mean > 0 &&
      variance / mean >= config.distribution.minVarianceMeanRatio;

    const maxK = Math.max(6, Math.ceil(mean + 4 * sigma));
    const out: DensityPoint[] = [];
    for (let k = 0; k <= maxK; k += 1) {
      const y = overdispersed
        ? (() => {
            const { r, p } = negBinomialParams(mean, variance);
            return negBinomialPmf(k, r, p);
          })()
        : poissonPmf(k, mean);
      out.push({ x: k, y });
    }
    return out;
  }

  const useTruncated = config.distribution.yards === "truncated-normal";
  const location = useTruncated ? solveTruncatedNormalLocation(mean, sigma) : mean;
  const massAboveZero = useTruncated ? normalCdf(location / sigma) : 1;

  const hi = Math.max(1, mean + 3.5 * sigma);
  const step = hi / (points - 1);
  const out: DensityPoint[] = [];
  for (let i = 0; i < points; i += 1) {
    const x = i * step;
    const density = normalPdf((x - location) / sigma) / sigma;
    out.push({ x, y: massAboveZero > 0 ? density / massAboveZero : 0 });
  }
  return out;
}
