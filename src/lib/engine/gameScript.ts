/**
 * Step 2 of the spec: split projected plays into pass and rush.
 */

import { clamp } from "./math";
import type { EngineConfig } from "./config";

export interface PassRushSplitInput {
  /** Total offensive plays projected for this team. */
  projectedPlays: number;
  passRateOverall: number;
  passRateWhenLeading: number;
  passRateWhenTrailing: number;
  /** This team's spread. Negative means favoured. */
  spread: number;
}

export interface PassRushSplit {
  passRate: number;
  /** Dropbacks, i.e. pass attempts plus sacks. */
  projectedDropbacks: number;
  /** Pass attempts, which is what passing props are priced on. */
  projectedPassAttempts: number;
  projectedRushAttempts: number;
}

/**
 * Blend a team's leading and trailing pass rates according to how the game is
 * expected to script.
 *
 * The spec describes hard thresholds ("favoured by more than 6 → lower pass
 * rate"), which produce a discontinuity: a -6 favourite and a -6.5 favourite
 * would project meaningfully different pass rates despite being all but
 * identical games. Interpolating linearly up to `spreadFullEffect` expresses the
 * same intent — bigger favourites run more — without the cliff.
 */
export function projectPassRushSplit(
  input: PassRushSplitInput,
  config: EngineConfig,
): PassRushSplit {
  const { spreadFullEffect, maxPassRateShift, minPassRate, maxPassRate } =
    config.gameScript;

  // A negative spread means favoured, which implies a positive expected margin.
  const expectedMargin = -input.spread;
  const scriptWeight = clamp(expectedMargin / spreadFullEffect, -1, 1);

  const target =
    scriptWeight >= 0 ? input.passRateWhenLeading : input.passRateWhenTrailing;
  const blended =
    input.passRateOverall +
    Math.abs(scriptWeight) * (target - input.passRateOverall);

  const shift = clamp(
    blended - input.passRateOverall,
    -maxPassRateShift,
    maxPassRateShift,
  );
  const passRate = clamp(
    input.passRateOverall + shift,
    minPassRate,
    maxPassRate,
  );

  const projectedDropbacks = input.projectedPlays * passRate;
  const projectedPassAttempts = projectedDropbacks * (1 - config.league.sackRate);
  const projectedRushAttempts = input.projectedPlays * (1 - passRate);

  return {
    passRate,
    projectedDropbacks,
    projectedPassAttempts,
    projectedRushAttempts,
  };
}
