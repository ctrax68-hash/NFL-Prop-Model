/**
 * Step 4 of the spec: adjust per-play efficiency for opponent and conditions,
 * then convert volume into projected yardage and receptions.
 */

import { clamp } from "./math";
import type { EngineConfig } from "./config";
import type { GameContext, Position } from "./types";

/** Mean and standard deviation of a defensive split across the league. */
export interface Norm {
  mean: number;
  sd: number;
}

/**
 * League-wide distribution of each defensive split, used to standardise an
 * opponent's raw allowed figure. Without these, a "4.6 yards per target
 * allowed" number carries no information about whether that is good or bad.
 */
export interface LeagueDefenseNorms {
  vsWrYardsPerTarget: Norm;
  vsTeYardsPerTarget: Norm;
  vsRbRecYardsPerTarget: Norm;
  vsRbRushYardsPerCarry: Norm;
  vsQbYardsPerAttempt: Norm;
}

export function zScore(value: number, norm: Norm): number {
  if (!Number.isFinite(value) || norm.sd <= 0) return 0;
  return (value - norm.mean) / norm.sd;
}

/**
 * Convert an opponent z-score into a multiplier on player efficiency.
 * A positive z means the defense allows more than average, so efficiency rises.
 */
export function defenseMultiplier(z: number, config: EngineConfig): number {
  const { defenseWeight, maxDefenseAdjustment } = config.efficiency;
  return clamp(
    1 + defenseWeight * z,
    1 - maxDefenseAdjustment,
    1 + maxDefenseAdjustment,
  );
}

/** Pick the defensive split that applies to a receiver of this position. */
export function receivingDefenseZ(
  position: Position,
  defense: {
    vsWrYardsPerTargetAllowed: number;
    vsTeYardsPerTargetAllowed: number;
    vsRbRecYardsPerTargetAllowed: number;
  },
  norms: LeagueDefenseNorms,
): number {
  switch (position) {
    case "TE":
      return zScore(defense.vsTeYardsPerTargetAllowed, norms.vsTeYardsPerTarget);
    case "RB":
      return zScore(
        defense.vsRbRecYardsPerTargetAllowed,
        norms.vsRbRecYardsPerTarget,
      );
    default:
      return zScore(defense.vsWrYardsPerTargetAllowed, norms.vsWrYardsPerTarget);
  }
}

/**
 * Weather multiplier for the passing game.
 *
 * Wind is the variable that actually moves passing production; temperature
 * barely does, so it is not modelled. Rushing is left unadjusted — bad weather
 * shifts volume toward the run, which the game-script step already captures,
 * rather than changing yards per carry much.
 */
export function passingWeatherMultiplier(
  game: Pick<GameContext, "weatherType" | "windSpeedMph">,
  config: EngineConfig,
): number {
  if (game.weatherType === "dome") return 1;

  const { windThresholdMph, windPenaltyPerMph, precipitationPenalty, maxWeatherPenalty } =
    config.efficiency;

  let penalty = 0;

  const wind = game.windSpeedMph;
  if (wind != null && Number.isFinite(wind) && wind > windThresholdMph) {
    penalty += (wind - windThresholdMph) * windPenaltyPerMph;
  }

  if (game.weatherType === "rain" || game.weatherType === "snow") {
    penalty += precipitationPenalty;
  }

  return 1 - clamp(penalty, 0, maxWeatherPenalty);
}

export interface EfficiencyInput {
  baselineYardsPerTarget: number;
  baselineYardsPerCarry: number;
  baselineCatchRate: number;
  baselineYardsPerPassAttempt: number;
  baselineCompletionRate: number;
  receivingDefenseZ: number;
  rushingDefenseZ: number;
  passingDefenseZ: number;
  passingWeatherMultiplier: number;
}

export interface AdjustedEfficiency {
  yardsPerTarget: number;
  yardsPerCarry: number;
  catchRate: number;
  yardsPerPassAttempt: number;
  completionRate: number;
}

export function adjustEfficiency(
  input: EfficiencyInput,
  config: EngineConfig,
): AdjustedEfficiency {
  const recMultiplier =
    defenseMultiplier(input.receivingDefenseZ, config) *
    input.passingWeatherMultiplier;
  const rushMultiplier = defenseMultiplier(input.rushingDefenseZ, config);
  const passMultiplier =
    defenseMultiplier(input.passingDefenseZ, config) *
    input.passingWeatherMultiplier;

  return {
    yardsPerTarget: input.baselineYardsPerTarget * recMultiplier,
    yardsPerCarry: input.baselineYardsPerCarry * rushMultiplier,
    // Catch rate moves with conditions but far less than yardage does; the
    // weather effect on completions is roughly a third of the yardage effect.
    catchRate: clamp(
      input.baselineCatchRate * (1 + (input.passingWeatherMultiplier - 1) / 3),
      0.05,
      0.95,
    ),
    yardsPerPassAttempt: input.baselineYardsPerPassAttempt * passMultiplier,
    completionRate: clamp(
      input.baselineCompletionRate * (1 + (input.passingWeatherMultiplier - 1) / 3),
      0.3,
      0.85,
    ),
  };
}
