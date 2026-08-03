/**
 * Prop line sourcing.
 *
 * Player prop lines are the one input with no free public source, so the engine
 * takes them through an interface with two implementations: a synthetic book
 * (works offline, makes the whole pipeline runnable and calibration-testable)
 * and The Odds API (real lines, needs a key).
 */

import type { EngineConfig } from "../../engine/config";
import type { PlayerGameProjection } from "../../engine/project";
import type { PlayerBaseline, PropLine, PropType } from "../../engine/types";
import type { GameRow } from "../nflverse";

export interface PropsProviderContext {
  season: number;
  week: number;
  games: readonly GameRow[];
  projections: readonly PlayerGameProjection[];
  baselines: ReadonlyMap<string, PlayerBaseline>;
  config: EngineConfig;
}

export interface PropsProvider {
  /** Stored on each prop as `book_name`. */
  readonly name: string;
  /**
   * True when lines come from a real sportsbook. Synthetic lines are derived
   * from the model's own projections, so any edge measured against them is an
   * artefact — the pipeline and UI label results accordingly.
   */
  readonly isReal: boolean;
  fetchProps(context: PropsProviderContext): Promise<PropLine[]>;
}

/** Markets offered per position, with the minimum projection worth posting. */
export const MARKETS_BY_POSITION: Record<
  string,
  ReadonlyArray<{ propType: PropType; minProjection: number }>
> = {
  QB: [
    { propType: "passing_yards", minProjection: 120 },
    { propType: "pass_attempts", minProjection: 15 },
    { propType: "pass_completions", minProjection: 10 },
    { propType: "rushing_yards", minProjection: 8 },
  ],
  RB: [
    { propType: "rushing_yards", minProjection: 18 },
    { propType: "rush_attempts", minProjection: 5 },
    { propType: "receptions", minProjection: 1.5 },
    { propType: "receiving_yards", minProjection: 12 },
  ],
  WR: [
    { propType: "receiving_yards", minProjection: 20 },
    { propType: "receptions", minProjection: 1.8 },
  ],
  TE: [
    { propType: "receiving_yards", minProjection: 18 },
    { propType: "receptions", minProjection: 1.5 },
  ],
};

/**
 * Deterministic PRNG so a given prop always gets the same synthetic line.
 * Without this, re-running the pipeline would shuffle every line and make
 * results impossible to compare.
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Box-Muller, using a supplied uniform generator. */
export function standardNormal(random: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = random();
  while (v === 0) v = random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
