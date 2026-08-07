/**
 * Score the engine's assumed distributions against what actually happened.
 *
 *   npx tsx scripts/fit-distribution.ts --seasons 2023-2024
 *
 * The sigma models in `config.ts` were fitted, but the distribution *families*
 * around them were assumed, and a family can be badly wrong while its first two
 * moments look fine — that is exactly how receiving yards ran a -7.3pp
 * calibration bias with a correctly-fitted sigma.
 *
 * So this compares, per stat and per volume bin, what the configured
 * distribution claims against the empirical distribution of realised
 * player-weeks: the standard deviation, the share of outcomes at exactly zero,
 * and the median relative to the mean. A family that gets the mean right but
 * the median or the zero-rate wrong will show up here immediately, and it is
 * scored independently of any line, book or bet.
 */

import "./lib/env";

import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import {
  gammaCdf,
  gammaParams,
  leagueSigma,
  negBinomialParams,
  negBinomialPmf,
  solveTruncatedNormalLocation,
  yardsFamily,
} from "../src/lib/engine/distribution";
import { linearFit, normalCdf } from "../src/lib/engine/math";
import { loadPlayerWeeksForSeasons } from "../src/lib/ingest/nflverse";
import { isDiscreteStat, type StatType } from "../src/lib/engine/types";
import { parseArgs, parseSeasonRange } from "./lib/args";

/** Realised value of each stat on one player-week. */
const EXTRACT: Record<StatType, (row: PlayerWeekLike) => number> = {
  receiving_yards: (r) => r.receivingYards,
  rushing_yards: (r) => r.rushingYards,
  passing_yards: (r) => r.passingYards,
  receptions: (r) => r.receptions,
  rush_attempts: (r) => r.carries,
  pass_attempts: (r) => r.attempts,
  pass_completions: (r) => r.completions,
};

interface PlayerWeekLike {
  playerId: string;
  seasonType: string;
  receivingYards: number;
  rushingYards: number;
  passingYards: number;
  receptions: number;
  carries: number;
  attempts: number;
  completions: number;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/** What the configured model says P(X = 0) and median/mean should be. */
function modelShape(
  stat: StatType,
  mean: number,
): { zeroRate: number; medianOverMean: number } {
  const sigma = leagueSigma(DEFAULT_CONFIG.distribution.sigmaModels[stat], mean);

  if (isDiscreteStat(stat)) {
    const variance = sigma * sigma;
    if (mean <= 0) return { zeroRate: 1, medianOverMean: 0 };
    // Mirrors the guard in discreteOverUnder: below the ratio the negative
    // binomial is undefined and the engine falls back to Poisson.
    const overdispersed =
      variance / mean >= DEFAULT_CONFIG.distribution.minVarianceMeanRatio;
    let cumulative = 0;
    let medianAt = 0;
    let zero = 0;
    for (let k = 0; k <= 200; k += 1) {
      const pmf = overdispersed
        ? (() => {
            const { r, p } = negBinomialParams(mean, variance);
            return negBinomialPmf(k, r, p);
          })()
        : (Math.exp(-mean) * mean ** k) / factorial(k);
      if (k === 0) zero = pmf;
      cumulative += pmf;
      if (medianAt === 0 && cumulative >= 0.5) medianAt = k;
    }
    return { zeroRate: zero, medianOverMean: mean > 0 ? medianAt / mean : 0 };
  }

  const family = yardsFamily(stat, DEFAULT_CONFIG);
  // Continuous families put zero probability on any single point; the
  // comparable quantity is the mass below half a yard.
  if (family === "gamma") {
    const { shape, scale } = gammaParams(mean, sigma);
    let lo = 0;
    let hi = mean * 10 + 1;
    for (let i = 0; i < 200; i += 1) {
      const mid = (lo + hi) / 2;
      if (gammaCdf(mid, shape, scale) < 0.5) lo = mid;
      else hi = mid;
    }
    return {
      zeroRate: gammaCdf(0.5, shape, scale),
      medianOverMean: mean > 0 ? (lo + hi) / 2 / mean : 0,
    };
  }

  const location = solveTruncatedNormalLocation(mean, sigma);
  const massAboveZero = normalCdf(location / sigma);
  const belowHalf =
    (normalCdf((0.5 - location) / sigma) - normalCdf(-location / sigma)) /
    Math.max(1e-12, massAboveZero);
  // Median of the truncated normal: the point with half the surviving mass.
  const medianAt =
    location +
    sigma *
      inverseNormal(0.5 * (1 + normalCdf(-location / sigma)) * 1);
  return {
    zeroRate: Math.max(0, belowHalf),
    medianOverMean: mean > 0 ? Math.max(0, medianAt) / mean : 0,
  };
}

function factorial(n: number): number {
  let out = 1;
  for (let i = 2; i <= n; i += 1) out *= i;
  return out;
}

/** Acklam-style inverse normal, adequate for a diagnostic. */
function inverseNormal(p: number): number {
  if (p <= 0) return -8;
  if (p >= 1) return 8;
  let lo = -8;
  let hi = 8;
  for (let i = 0; i < 200; i += 1) {
    const mid = (lo + hi) / 2;
    if (normalCdf(mid) < p) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

const BINS: Array<[number, number]> = [
  [0.5, 2],
  [2, 5],
  [5, 10],
  [10, 25],
  [25, 50],
  [50, 100],
  [100, 400],
];

async function main(): Promise<void> {
  const args = parseArgs();
  const seasons = parseSeasonRange(
    typeof args.seasons === "string" ? args.seasons : "2023-2024",
  );

  console.log(`Loading player weeks for ${seasons.join(", ")}...`);
  const rows = (await loadPlayerWeeksForSeasons(seasons)) as PlayerWeekLike[];
  const regular = rows.filter((r) => r.seasonType === "REG");
  console.log(`${regular.length.toLocaleString()} regular-season player-weeks`);

  for (const stat of Object.keys(EXTRACT) as StatType[]) {
    const extract = EXTRACT[stat];

    // A player's own prior-week average stands in for "projected volume", so
    // outcomes are grouped by the level the model would have expected without
    // peeking at the week being scored.
    const byPlayer = new Map<string, number[]>();
    for (const row of regular) {
      const list = byPlayer.get(row.playerId);
      if (list) list.push(extract(row));
      else byPlayer.set(row.playerId, [extract(row)]);
    }

    const samples: Array<{ baseline: number; actual: number }> = [];
    for (const values of byPlayer.values()) {
      if (values.length < 4) continue;
      for (let i = 2; i < values.length; i += 1) {
        const prior = values.slice(0, i);
        const baseline = prior.reduce((s, v) => s + v, 0) / prior.length;
        if (baseline > 0) samples.push({ baseline, actual: values[i] });
      }
    }

    console.log("");
    console.log(`${stat}  (${yardsFamily(stat, DEFAULT_CONFIG) ?? "count"})`);
    console.log(
      `  ${"volume".padEnd(11)} ${"n".padStart(6)} ${"sigma".padStart(15)} ` +
        `${"P(zero)".padStart(15)} ${"median/mean".padStart(17)}`,
    );
    console.log(
      `  ${"".padEnd(11)} ${"".padStart(6)} ${"actual  model".padStart(15)} ` +
        `${"actual  model".padStart(15)} ${"actual   model".padStart(17)}`,
    );

    for (const [lo, hi] of BINS) {
      const inBin = samples.filter((s) => s.baseline >= lo && s.baseline < hi);
      if (inBin.length < 50) continue;

      const actuals = inBin.map((s) => s.actual);
      const mean = actuals.reduce((s, v) => s + v, 0) / actuals.length;
      if (mean <= 0) continue;
      const sd = Math.sqrt(
        actuals.reduce((s, v) => s + (v - mean) ** 2, 0) / actuals.length,
      );
      const zero = actuals.filter((v) => v < 0.5).length / actuals.length;
      const med = median(actuals);

      const model = modelShape(stat, mean);
      const modelSigma = leagueSigma(
        DEFAULT_CONFIG.distribution.sigmaModels[stat],
        mean,
      );

      console.log(
        `  ${`${lo}-${hi}`.padEnd(11)} ${String(inBin.length).padStart(6)} ` +
          `${sd.toFixed(1).padStart(7)}${modelSigma.toFixed(1).padStart(8)} ` +
          `${`${(zero * 100).toFixed(1)}%`.padStart(7)}${`${(model.zeroRate * 100).toFixed(1)}%`.padStart(8)} ` +
          `${(med / mean).toFixed(3).padStart(8)}${model.medianOverMean.toFixed(3).padStart(9)}`,
      );
    }
  }

  if (args.fit) {
    console.log("");
    console.log("=".repeat(72));
    console.log("REFIT sigma models — paste into config.ts distribution.sigmaModels");
    console.log("=".repeat(72));
    console.log(
      "  Regresses each player's own standard deviation on their own mean,",
    );
    console.log(
      "  which is what leagueSigma() consumes. Players need >= 6 games so a",
    );
    console.log("  single outlier week cannot masquerade as volatility.");
    console.log("");

    for (const stat of Object.keys(EXTRACT) as StatType[]) {
      const extract = EXTRACT[stat];
      const byPlayer = new Map<string, number[]>();
      for (const row of regular) {
        const list = byPlayer.get(row.playerId);
        if (list) list.push(extract(row));
        else byPlayer.set(row.playerId, [extract(row)]);
      }

      const points: Array<{ x: number; y: number }> = [];
      for (const values of byPlayer.values()) {
        if (values.length < 6) continue;
        const m = values.reduce((s, v) => s + v, 0) / values.length;
        if (m <= 0) continue;
        const sd = Math.sqrt(
          values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1),
        );
        points.push({ x: m, y: sd });
      }

      const fit = linearFit(points);
      const current = DEFAULT_CONFIG.distribution.sigmaModels[stat];
      if (!fit) {
        console.log(`  ${stat}: not enough data (n=${points.length})`);
        continue;
      }
      console.log(
        `  ${stat}: { intercept: ${fit.intercept.toFixed(4)}, slope: ${fit.slope.toFixed(4)}, min: ${current.min} }, // n=${points.length}`,
      );
      console.log(
        `  ${" ".repeat(stat.length)}  was intercept ${current.intercept} slope ${current.slope} (n in comment)`,
      );
    }
  }

  console.log("");
  console.log(
    "Columns pair the empirical value with what the configured model implies.",
  );
  console.log(
    "Large P(zero) or median/mean gaps mean the family is wrong even where",
  );
  console.log("sigma is right — that is a shape error, not a variance error.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
