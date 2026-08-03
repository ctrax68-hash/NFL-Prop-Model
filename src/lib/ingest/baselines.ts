/**
 * Build per-player rolling baselines: usage shares, per-play efficiency, and
 * the per-stat history the distribution model blends its sigma from.
 */

import { mean as arithmeticMean, stdDev } from "../engine/math";
import type { PlayerBaseline, Position, StatType } from "../engine/types";
import type { PlayerWeek, SnapCountRow } from "./nflverse";
import type { TeamWeek } from "./teamRates";
import {
  before,
  decayWeights,
  mostRecentFirst,
  shrink,
  weightedMean,
  type SeasonWeek,
} from "./asOf";

export interface BaselineOptions {
  /** Most recent games per player to consider. */
  windowGames: number;
  /** Recency decay per game. */
  decay: number;
  /** Shrinkage constants, in the natural sample unit for each quantity. */
  shrinkGames: number;
  shrinkTargets: number;
  shrinkCarries: number;
  shrinkAttempts: number;
}

export const DEFAULT_BASELINE_OPTIONS: BaselineOptions = {
  windowGames: 17,
  decay: 0.94,
  shrinkGames: 4,
  shrinkTargets: 25,
  shrinkCarries: 30,
  shrinkAttempts: 40,
};

export interface StatHistory {
  mean: number;
  sd: number | null;
  games: number;
}

export interface PlayerRecord {
  baseline: PlayerBaseline;
  headshotUrl: string | null;
  /** Per-stat mean/sd over the window, used to blend the model's sigma. */
  statHistory: Partial<Record<StatType, StatHistory>>;
  /**
   * The most recent week this player recorded a stat line. Used to drop players
   * who are injured, released or retired — their baselines still look fine, but
   * they will not be on the field.
   */
  lastSeen: SeasonWeek;
}

export interface PositionPrior {
  targetShare: number;
  rushShare: number;
  passAttemptShare: number;
  yardsPerTarget: number;
  yardsPerCarry: number;
  catchRate: number;
  yardsPerPassAttempt: number;
  completionRate: number;
  snapShare: number;
}

/** nflverse lists fullbacks separately; the model treats them as backs. */
export function normalisePosition(position: string): Position | null {
  switch (position) {
    case "QB":
      return "QB";
    case "RB":
    case "FB":
      return "RB";
    case "WR":
      return "WR";
    case "TE":
      return "TE";
    default:
      return null;
  }
}

interface TeamTotals {
  targets: number;
  carries: number;
  passAttempts: number;
}

function buildTeamTotals(teamWeeks: readonly TeamWeek[]): Map<string, TeamTotals> {
  const index = new Map<string, TeamTotals>();
  for (const week of teamWeeks) {
    index.set(`${week.season}|${week.week}|${week.team}`, {
      targets: week.targets,
      carries: week.carries,
      passAttempts: week.passAttempts,
    });
  }
  return index;
}

/** Normalise a player name for joining against the snap-count file. */
function nameKey(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
}

/**
 * Positional priors computed from the data itself rather than hardcoded, so
 * shrinkage tracks the era being modelled.
 */
export function computePositionPriors(
  playerWeeks: readonly PlayerWeek[],
  teamTotals: ReadonlyMap<string, TeamTotals>,
): Map<Position, PositionPrior> {
  const buckets = new Map<
    Position,
    {
      targetShares: number[];
      rushShares: number[];
      passAttemptShares: number[];
      receivingYards: number;
      targets: number;
      receptions: number;
      rushingYards: number;
      carries: number;
      passingYards: number;
      attempts: number;
      completions: number;
    }
  >();

  for (const row of playerWeeks) {
    const position = normalisePosition(row.position);
    if (!position) continue;

    let bucket = buckets.get(position);
    if (!bucket) {
      bucket = {
        targetShares: [],
        rushShares: [],
        passAttemptShares: [],
        receivingYards: 0,
        targets: 0,
        receptions: 0,
        rushingYards: 0,
        carries: 0,
        passingYards: 0,
        attempts: 0,
        completions: 0,
      };
      buckets.set(position, bucket);
    }

    const totals = teamTotals.get(`${row.season}|${row.week}|${row.team}`);
    if (totals) {
      if (totals.targets > 0) bucket.targetShares.push(row.targets / totals.targets);
      if (totals.carries > 0) bucket.rushShares.push(row.carries / totals.carries);
      if (totals.passAttempts > 0) {
        bucket.passAttemptShares.push(row.attempts / totals.passAttempts);
      }
    }

    bucket.receivingYards += row.receivingYards;
    bucket.targets += row.targets;
    bucket.receptions += row.receptions;
    bucket.rushingYards += row.rushingYards;
    bucket.carries += row.carries;
    bucket.passingYards += row.passingYards;
    bucket.attempts += row.attempts;
    bucket.completions += row.completions;
  }

  const priors = new Map<Position, PositionPrior>();
  for (const [position, bucket] of buckets) {
    priors.set(position, {
      targetShare: arithmeticMean(bucket.targetShares) ?? 0.08,
      rushShare: arithmeticMean(bucket.rushShares) ?? 0.1,
      passAttemptShare: arithmeticMean(bucket.passAttemptShares) ?? 0,
      yardsPerTarget: safeRatio(bucket.receivingYards, bucket.targets, 7.8),
      yardsPerCarry: safeRatio(bucket.rushingYards, bucket.carries, 4.3),
      catchRate: safeRatio(bucket.receptions, bucket.targets, 0.65),
      yardsPerPassAttempt: safeRatio(bucket.passingYards, bucket.attempts, 7.0),
      completionRate: safeRatio(bucket.completions, bucket.attempts, 0.65),
      snapShare: 0.5,
    });
  }
  return priors;
}

const STAT_ACCESSORS: Record<StatType, (row: PlayerWeek) => number> = {
  receiving_yards: (row) => row.receivingYards,
  receptions: (row) => row.receptions,
  rushing_yards: (row) => row.rushingYards,
  rush_attempts: (row) => row.carries,
  passing_yards: (row) => row.passingYards,
  pass_attempts: (row) => row.attempts,
  pass_completions: (row) => row.completions,
};

export interface BaselineInput {
  playerWeeks: readonly PlayerWeek[];
  teamWeeks: readonly TeamWeek[];
  snapCounts?: readonly SnapCountRow[];
  asOf: SeasonWeek;
  options?: BaselineOptions;
}

export function computeBaselines(input: BaselineInput): Map<string, PlayerRecord> {
  const options = input.options ?? DEFAULT_BASELINE_OPTIONS;
  const asOf = input.asOf;

  const history = before(input.playerWeeks, asOf).filter(
    (row) => row.seasonType === "REG",
  );
  const teamTotals = buildTeamTotals(before(input.teamWeeks, asOf));
  const priors = computePositionPriors(history, teamTotals);

  const snapIndex = new Map<string, number>();
  for (const snap of before(input.snapCounts ?? [], asOf)) {
    snapIndex.set(
      `${snap.season}|${snap.week}|${snap.team}|${nameKey(snap.player)}`,
      snap.offensePct,
    );
  }

  const byPlayer = new Map<string, PlayerWeek[]>();
  for (const row of history) {
    const list = byPlayer.get(row.playerId);
    if (list) list.push(row);
    else byPlayer.set(row.playerId, [row]);
  }

  const records = new Map<string, PlayerRecord>();

  for (const [playerId, weeks] of byPlayer) {
    const recent = mostRecentFirst(weeks).slice(0, options.windowGames);
    if (recent.length === 0) continue;

    const latest = recent[0];
    const position = normalisePosition(latest.position);
    if (!position) continue;

    const prior = priors.get(position);
    if (!prior) continue;

    const weights = decayWeights(recent.length, options.decay);

    // --- usage shares -----------------------------------------------------
    const targetShares: number[] = [];
    const rushShares: number[] = [];
    const passAttemptShares: number[] = [];
    const snapShares: number[] = [];
    const shareWeights: number[] = [];

    recent.forEach((row, index) => {
      const totals = teamTotals.get(`${row.season}|${row.week}|${row.team}`);
      if (!totals) return;
      targetShares.push(totals.targets > 0 ? row.targets / totals.targets : 0);
      rushShares.push(totals.carries > 0 ? row.carries / totals.carries : 0);
      passAttemptShares.push(
        totals.passAttempts > 0 ? row.attempts / totals.passAttempts : 0,
      );
      const snap = snapIndex.get(
        `${row.season}|${row.week}|${row.team}|${nameKey(row.name)}`,
      );
      if (snap != null) snapShares.push(snap);
      shareWeights.push(weights[index]);
    });

    const observedGames = shareWeights.length;

    // --- efficiency, weighted by volume ------------------------------------
    let wReceivingYards = 0;
    let wTargets = 0;
    let wReceptions = 0;
    let wRushingYards = 0;
    let wCarries = 0;
    let wPassingYards = 0;
    let wAttempts = 0;
    let wCompletions = 0;

    let rawTargets = 0;
    let rawCarries = 0;
    let rawAttempts = 0;

    recent.forEach((row, index) => {
      const weight = weights[index];
      wReceivingYards += weight * row.receivingYards;
      wTargets += weight * row.targets;
      wReceptions += weight * row.receptions;
      wRushingYards += weight * row.rushingYards;
      wCarries += weight * row.carries;
      wPassingYards += weight * row.passingYards;
      wAttempts += weight * row.attempts;
      wCompletions += weight * row.completions;

      rawTargets += row.targets;
      rawCarries += row.carries;
      rawAttempts += row.attempts;
    });

    const baseline: PlayerBaseline = {
      playerId,
      name: latest.name,
      teamId: latest.team,
      position,

      baselineTargetShare: shrink(
        weightedMean(targetShares, shareWeights),
        prior.targetShare,
        observedGames,
        options.shrinkGames,
      ),
      baselineRushShare: shrink(
        weightedMean(rushShares, shareWeights),
        prior.rushShare,
        observedGames,
        options.shrinkGames,
      ),
      baselinePassAttemptShare: shrink(
        weightedMean(passAttemptShares, shareWeights),
        prior.passAttemptShare,
        observedGames,
        options.shrinkGames,
      ),
      baselineRouteParticipation: arithmeticMean(snapShares) ?? prior.snapShare,
      baselineSnapShare: arithmeticMean(snapShares) ?? prior.snapShare,

      // Rate stats shrink on their own sample unit: a receiver's yards per
      // target is anchored by how many targets they have seen, not by how many
      // games they have appeared in.
      baselineYardsPerTarget: shrink(
        wTargets > 0 ? wReceivingYards / wTargets : null,
        prior.yardsPerTarget,
        rawTargets,
        options.shrinkTargets,
      ),
      baselineYardsPerCarry: shrink(
        wCarries > 0 ? wRushingYards / wCarries : null,
        prior.yardsPerCarry,
        rawCarries,
        options.shrinkCarries,
      ),
      baselineCatchRate: shrink(
        wTargets > 0 ? wReceptions / wTargets : null,
        prior.catchRate,
        rawTargets,
        options.shrinkTargets,
      ),
      baselineYardsPerPassAttempt: shrink(
        wAttempts > 0 ? wPassingYards / wAttempts : null,
        prior.yardsPerPassAttempt,
        rawAttempts,
        options.shrinkAttempts,
      ),
      baselineCompletionRate: shrink(
        wAttempts > 0 ? wCompletions / wAttempts : null,
        prior.completionRate,
        rawAttempts,
        options.shrinkAttempts,
      ),

      baselineReceptionsPerGame:
        weightedMean(recent.map((r) => r.receptions), weights) ?? 0,
      baselineCarriesPerGame:
        weightedMean(recent.map((r) => r.carries), weights) ?? 0,

      gamesSampleN: recent.length,
    };

    const statHistory: Partial<Record<StatType, StatHistory>> = {};
    for (const stat of Object.keys(STAT_ACCESSORS) as StatType[]) {
      const values = recent.map(STAT_ACCESSORS[stat]);
      statHistory[stat] = {
        mean: arithmeticMean(values) ?? 0,
        sd: stdDev(values),
        games: values.length,
      };
    }

    records.set(playerId, {
      baseline,
      headshotUrl: latest.headshotUrl,
      statHistory,
      lastSeen: { season: latest.season, week: latest.week },
    });
  }

  return records;
}

function safeRatio(numerator: number, denominator: number, fallback: number): number {
  return denominator > 0 ? numerator / denominator : fallback;
}
