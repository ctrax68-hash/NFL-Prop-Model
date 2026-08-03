/**
 * Step 8 of the spec: odds conversion, plus de-vigging.
 */

import { bisect, clamp } from "./math";
import type { DevigMethod } from "./config";

/** American odds -> decimal odds. `-115` -> 1.8696, `+120` -> 2.20. */
export function americanToDecimal(american: number): number {
  if (american === 0 || !Number.isFinite(american)) {
    throw new Error(`Invalid American odds: ${american}`);
  }
  return american > 0 ? 1 + american / 100 : 1 + 100 / -american;
}

/** Decimal odds -> American odds. */
export function decimalToAmerican(decimal: number): number {
  if (decimal <= 1) {
    throw new Error(`Invalid decimal odds: ${decimal}`);
  }
  return decimal >= 2 ? (decimal - 1) * 100 : -100 / (decimal - 1);
}

/**
 * American odds -> implied probability, vig included.
 * `-115` -> 0.5349, `+120` -> 0.4545.
 */
export function americanToImpliedProb(american: number): number {
  if (american === 0 || !Number.isFinite(american)) {
    throw new Error(`Invalid American odds: ${american}`);
  }
  return american > 0
    ? 100 / (american + 100)
    : -american / (-american + 100);
}

/** Implied probability -> American odds. */
export function impliedProbToAmerican(probability: number): number {
  if (probability <= 0 || probability >= 1) {
    throw new Error(`Probability out of range: ${probability}`);
  }
  return decimalToAmerican(1 / probability);
}

/** Net profit per unit staked at these odds (`b` in the Kelly formula). */
export function profitMultiple(american: number): number {
  return americanToDecimal(american) - 1;
}

export interface DevigResult {
  /** Fair, vig-free probability of the over. */
  fairProbOver: number;
  /** Fair, vig-free probability of the under. */
  fairProbUnder: number;
  /** Raw implied probability of the over, vig included. */
  rawProbOver: number;
  rawProbUnder: number;
  /** Sum of the raw probabilities. 1.0 means no vig; books typically run 1.04-1.09. */
  overround: number;
}

/**
 * Remove the bookmaker's margin from a two-way market.
 *
 * This matters more than it looks. Raw implied probabilities sum to more than
 * 1, so comparing a model probability against the raw number understates the
 * edge on both sides by roughly half the vig — with a standard -110/-110 market
 * that is ~2.4 points of edge erased, which on a 3% threshold is most of the
 * bets. The fair probability is the honest comparison point.
 *
 * - `multiplicative`: divide by the overround. Simple and standard, but it
 *   shades favourites slightly because it assumes vig is proportional to
 *   probability.
 * - `power`: solve for k such that p_over^k + p_under^k = 1. Distributes vig
 *   more realistically across longshots and favourites.
 * - `none`: pass through raw probabilities, which is the literal behaviour
 *   described in the spec.
 */
export function devig(
  oddsOverAmerican: number,
  oddsUnderAmerican: number,
  method: DevigMethod = "multiplicative",
): DevigResult {
  const rawProbOver = americanToImpliedProb(oddsOverAmerican);
  const rawProbUnder = americanToImpliedProb(oddsUnderAmerican);
  const overround = rawProbOver + rawProbUnder;

  if (method === "none") {
    return {
      fairProbOver: rawProbOver,
      fairProbUnder: rawProbUnder,
      rawProbOver,
      rawProbUnder,
      overround,
    };
  }

  if (method === "power") {
    const k = solvePowerExponent(rawProbOver, rawProbUnder);
    const fairProbOver = rawProbOver ** k;
    return {
      fairProbOver,
      fairProbUnder: 1 - fairProbOver,
      rawProbOver,
      rawProbUnder,
      overround,
    };
  }

  return {
    fairProbOver: rawProbOver / overround,
    fairProbUnder: rawProbUnder / overround,
    rawProbOver,
    rawProbUnder,
    overround,
  };
}

/**
 * Solve `p1^k + p2^k = 1` for k. With an overround above 1 the solution is
 * k > 1; a market already at or below fair value returns k <= 1.
 */
function solvePowerExponent(p1: number, p2: number): number {
  const f = (k: number) => p1 ** k + p2 ** k - 1;
  return bisect(f, 0.2, 8, 1e-14);
}

/**
 * Convert a probability and price into expected value per unit staked.
 * Positive means the bet is +EV.
 */
export function expectedValue(
  probWin: number,
  american: number,
  probPush = 0,
): number {
  const b = profitMultiple(american);
  const probLose = clamp(1 - probWin - probPush, 0, 1);
  return probWin * b - probLose;
}
