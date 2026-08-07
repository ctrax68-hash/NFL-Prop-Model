/**
 * Measure whether props from different games in the same week move together
 * more than independence would predict.
 *
 * `buildParlayLadder` (src/lib/parlay.ts) already takes at most one leg per
 * game, which rules out same-game correlation (blowout suppresses trailing
 * rush, inflates trailing pass, etc.) by construction. What's left to check
 * is genuinely cross-game correlation — thinner and harder to justify, since
 * it can only come from something shared across a whole week (weather system,
 * a systematic model bias that week) rather than real game-theoretic
 * coupling between two unrelated games.
 *
 * For every graded prop, compute the standardized residual
 *   z = (actual - projectedValue) / sigma
 * A well-specified model should produce z with mean ~0 and variance ~1
 * *regardless of correlation* — correlation shows up in how z co-moves
 * across different games within the same week, not in its marginal shape.
 *
 * Exact pooled cross-game correlation, no per-pair enumeration needed: for a
 * week with observations grouped by game, let S1 = sum(z), S2 = sum(z^2), and
 * for each game g let s1_g = sum of z within g. Then
 *   sum over ordered cross-game pairs of z_i*z_j = S1^2 - sum_g(s1_g^2)
 *   count of ordered cross-game pairs                = N^2 - sum_g(n_g^2)
 * Summing those two quantities (and S1, S2, N) across weeks and dividing
 * gives the pooled cross-game correlation directly, with no assumption about
 * which prop "represents" a game.
 *
 *   npx tsx scripts/measure-correlation.ts --seasons 2020-2025
 */

import "./lib/env";

import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { runPipeline } from "../src/lib/pipeline/run";
import { createPropsProvider } from "../src/lib/ingest/props/factory";
import { parseArgs, parseSeasonRange } from "./lib/args";

/** The 17-game schedule arrived in 2021; 2020 stopped at 17 weeks. */
function regularSeasonWeeks(season: number): number[] {
  const last = season >= 2021 ? 18 : 17;
  return Array.from({ length: last }, (_, i) => i + 1);
}

interface WeekStats {
  season: number;
  week: number;
  n: number;
  s1: number;
  s2: number;
  crossSum: number;
  crossCount: number;
}

function seededRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function bootstrapCI(
  weeks: readonly WeekStats[],
  iterations: number,
  seed: number,
): { low: number; high: number } {
  const rand = seededRandom(seed);
  const samples: number[] = [];

  for (let iter = 0; iter < iterations; iter += 1) {
    let n = 0;
    let s1 = 0;
    let s2 = 0;
    let crossSum = 0;
    let crossCount = 0;
    for (let i = 0; i < weeks.length; i += 1) {
      const w = weeks[Math.floor(rand() * weeks.length)];
      n += w.n;
      s1 += w.s1;
      s2 += w.s2;
      crossSum += w.crossSum;
      crossCount += w.crossCount;
    }
    if (crossCount <= 0 || n <= 0) continue;
    const mean = s1 / n;
    const variance = s2 / n - mean * mean;
    if (variance <= 0) continue;
    const crossMean = crossSum / crossCount;
    samples.push((crossMean - mean * mean) / variance);
  }

  samples.sort((a, b) => a - b);
  const lowIdx = Math.floor(0.025 * samples.length);
  const highIdx = Math.min(samples.length - 1, Math.ceil(0.975 * samples.length));
  return { low: samples[lowIdx], high: samples[highIdx] };
}

async function main(): Promise<void> {
  const args = parseArgs();
  const seasons = parseSeasonRange(
    typeof args.seasons === "string" ? args.seasons : "2020-2025",
  );
  const providerName =
    typeof args.provider === "string"
      ? args.provider
      : (process.env.PROPS_PROVIDER ?? "synthetic");

  const weekStats: WeekStats[] = [];

  for (const season of seasons) {
    process.stdout.write(`${season}: loading nflverse data... `);
    const bundle = await loadDataBundle(seasonsToLoad([season]));
    const provider = createPropsProvider(providerName, bundle);
    process.stdout.write(`${bundle.playerWeeks.length.toLocaleString()} player-weeks\n`);

    for (const week of regularSeasonWeeks(season)) {
      const snapshot = await runPipeline(bundle, {
        season,
        week,
        config: DEFAULT_CONFIG,
        provider,
      });
      if (snapshot.games.length === 0 || snapshot.actuals.length === 0) continue;

      const actualByProp = new Map(
        snapshot.actuals
          .filter((a) => a.actualValue != null)
          .map((a) => [a.propId, a.actualValue as number]),
      );

      // Group standardized residuals by game.
      const byGame = new Map<string, number[]>();
      for (const evaluation of snapshot.evaluations) {
        const actual = actualByProp.get(evaluation.propId);
        if (actual == null || evaluation.sigma <= 0) continue;
        const z = (actual - evaluation.projectedValue) / evaluation.sigma;
        const list = byGame.get(evaluation.gameId);
        if (list) list.push(z);
        else byGame.set(evaluation.gameId, [z]);
      }

      let n = 0;
      let s1 = 0;
      let s2 = 0;
      let sumS1gSquared = 0;
      let sumNgSquared = 0;
      for (const zs of byGame.values()) {
        const gN = zs.length;
        const gS1 = zs.reduce((sum, z) => sum + z, 0);
        const gS2 = zs.reduce((sum, z) => sum + z * z, 0);
        n += gN;
        s1 += gS1;
        s2 += gS2;
        sumS1gSquared += gS1 * gS1;
        sumNgSquared += gN * gN;
      }

      const crossSum = s1 * s1 - sumS1gSquared;
      const crossCount = n * n - sumNgSquared;
      if (crossCount > 0) {
        weekStats.push({ season, week, n, s1, s2, crossSum, crossCount });
      }
    }
  }

  let n = 0;
  let s1 = 0;
  let s2 = 0;
  let crossSum = 0;
  let crossCount = 0;
  for (const w of weekStats) {
    n += w.n;
    s1 += w.s1;
    s2 += w.s2;
    crossSum += w.crossSum;
    crossCount += w.crossCount;
  }

  const mean = s1 / n;
  const variance = s2 / n - mean * mean;
  const crossMean = crossSum / crossCount;
  const correlation = (crossMean - mean * mean) / variance;

  const ci = bootstrapCI(weekStats, 2000, 20250807);

  console.log("");
  console.log(`Weeks measured:        ${weekStats.length}`);
  console.log(`Graded props pooled:   ${n.toLocaleString()}`);
  console.log(`Cross-game pairs:      ${crossCount.toLocaleString()}`);
  console.log(`z mean / variance:     ${mean.toFixed(4)} / ${variance.toFixed(4)}`);
  console.log("");
  console.log(`Cross-game correlation of standardized residuals: ${correlation.toFixed(4)}`);
  console.log(
    `95% bootstrap CI (resampled by week, n=2000): [${ci.low.toFixed(4)}, ${ci.high.toFixed(4)}]`,
  );
  console.log("");
  console.log(
    Math.abs(correlation) < 0.02 && Math.abs(ci.low) < 0.03 && Math.abs(ci.high) < 0.03
      ? "Near zero and the CI straddles it — no real cross-game correlation" +
          " detected. The one-leg-per-game rule is already doing nearly all" +
          " the achievable work; a joint model isn't justified by this data."
      : "Non-trivial correlation detected — see src/lib/engine/correlation.ts" +
          " design in the plan before wiring this into the parlay ladder.",
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
