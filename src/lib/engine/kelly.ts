/**
 * Step 11 of the spec: fractional Kelly sizing.
 */

import { profitMultiple } from "./odds";
import { clamp } from "./math";
import type { EngineConfig } from "./config";

export interface KellyInput {
  /** Unconditional probability the bet wins. */
  probWin: number;
  /** Unconditional probability of a push (stake returned). Usually 0. */
  probPush?: number;
  oddsAmerican: number;
}

export interface KellyResult {
  /** Full Kelly fraction of bankroll. Zero when the bet is not +EV. */
  kellyFractionRaw: number;
  /** After applying the configured Kelly fraction, before caps. */
  kellyFractionFractional: number;
  /** Final stake in units, after the cap and rounding. */
  recommendedUnits: number;
  /** Final stake as a fraction of bankroll. */
  bankrollFraction: number;
}

/**
 * Kelly with push support.
 *
 * The textbook formula `f* = (bp - q) / b` assumes p + q = 1, which is false on
 * any integer line where a push is possible. Maximising E[log wealth] with a
 * push term gives:
 *
 *     f* = (b * pWin - pLose) / (b * (pWin + pLose))
 *
 * which reduces to the textbook formula exactly when pPush = 0, so nothing
 * changes for the half-point lines that make up most of the board.
 */
export function kellyFraction(input: KellyInput): number {
  const probPush = clamp(input.probPush ?? 0, 0, 1);
  const probWin = clamp(input.probWin, 0, 1);
  const probLose = clamp(1 - probWin - probPush, 0, 1);

  const decisive = probWin + probLose;
  if (decisive <= 0) return 0;

  const b = profitMultiple(input.oddsAmerican);
  if (b <= 0) return 0;

  const f = (b * probWin - probLose) / (b * decisive);
  return f > 0 ? f : 0;
}

export function sizeBet(input: KellyInput, config: EngineConfig): KellyResult {
  const kellyFractionRaw = kellyFraction(input);

  if (kellyFractionRaw <= 0) {
    return {
      kellyFractionRaw: 0,
      kellyFractionFractional: 0,
      recommendedUnits: 0,
      bankrollFraction: 0,
    };
  }

  const { fraction, maxUnits, roundToUnits, unitFractionOfBankroll } =
    config.kelly;

  const kellyFractionFractional = kellyFractionRaw * fraction;

  const rawUnits = kellyFractionFractional / unitFractionOfBankroll;
  const cappedUnits = Math.min(rawUnits, maxUnits);
  const recommendedUnits =
    roundToUnits > 0
      ? Math.round(cappedUnits / roundToUnits) * roundToUnits
      : cappedUnits;

  // Rounding can land on zero for very thin edges; that is the correct answer.
  const finalUnits = Math.max(0, Number(recommendedUnits.toFixed(4)));

  return {
    kellyFractionRaw,
    kellyFractionFractional,
    recommendedUnits: finalUnits,
    bankrollFraction: finalUnits * unitFractionOfBankroll,
  };
}

/** Convert a unit stake into currency for a given bankroll. */
export function unitsToStake(
  units: number,
  bankroll: number,
  config: EngineConfig,
): number {
  return units * config.kelly.unitFractionOfBankroll * bankroll;
}
