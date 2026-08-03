/**
 * Step 1 of the spec: project offensive plays for a team in a given game.
 */

import { clamp } from "./math";
import type { EngineConfig } from "./config";

export interface TeamPlaysInput {
  /** The team's own plays per game. */
  teamPace: number;
  /** The opponent's plays per game — both offenses share the same clock. */
  oppPace: number;
  /** Game total. */
  total: number;
  /** Absolute point spread for the game. */
  absSpread: number;
}

/**
 * Base plays come from the two teams' paces, then move with the game total
 * (higher totals mean more scoring drives and more possessions) and against
 * the spread (blowouts burn clock and end in kneel-downs).
 */
export function projectTeamPlays(
  input: TeamPlaysInput,
  config: EngineConfig,
): number {
  const { ownPaceWeight, playsPerPointOfTotal, playsPerPointOfAbsSpread, minPlays, maxPlays } =
    config.plays;

  const base =
    ownPaceWeight * input.teamPace + (1 - ownPaceWeight) * input.oppPace;

  const totalAdjustment =
    (input.total - config.league.avgTotal) * playsPerPointOfTotal;

  const spreadAdjustment =
    -(Math.abs(input.absSpread) - config.league.avgAbsSpread) *
    playsPerPointOfAbsSpread;

  return clamp(base + totalAdjustment + spreadAdjustment, minPlays, maxPlays);
}

/**
 * Implied team totals from the spread and game total.
 * `spreadHome` is negative when the home team is favoured.
 */
export function impliedTeamTotals(
  total: number,
  spreadHome: number,
): { home: number; away: number } {
  return {
    home: total / 2 - spreadHome / 2,
    away: total / 2 + spreadHome / 2,
  };
}
