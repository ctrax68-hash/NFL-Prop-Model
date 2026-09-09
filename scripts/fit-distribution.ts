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
  HURDLE_MEAN_LOG_OFFSET,
  leagueSigma,
  negBinomialParams,
  negBinomialPmf,
  solveTruncatedNormalLocation,
  yardsFamily,
} from "../src/lib/engine/distribution";
import { linearFit, logisticFit, normalCdf, sigmoid } from "../src/lib/engine/math";
import { nameKey } from "../src/lib/ingest/baselines";
import { loadDataBundle } from "../src/lib/pipeline/bundle";
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
  name: string;
  team: string;
  season: number;
  week: number;
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
  // Exactly the requested seasons — unlike the pipeline's own callers, this
  // has no reason to pull `seasonsToLoad`'s extra prior-history seasons.
  const bundle = await loadDataBundle(seasons);
  const rows = bundle.playerWeeks as unknown as PlayerWeekLike[];
  const regular = rows.filter((r) => r.seasonType === "REG");
  console.log(`${regular.length.toLocaleString()} regular-season player-weeks`);

  const snapIndex = new Map<string, number>();
  for (const snap of bundle.snapCounts) {
    snapIndex.set(
      `${snap.season}|${snap.week}|${snap.team}|${nameKey(snap.player)}`,
      snap.offensePct,
    );
  }

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

  if (args.zero) {
    reportZeroInflationBySnapShare(regular, snapIndex);
  }

  if (args["fit-hurdle"]) {
    reportHurdleFit(regular, snapIndex);
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

interface ZeroInflationSample {
  baseline: number;
  snapShare: number;
  actual: number;
}

/**
 * One row per (player, prior-games-window) sample: the player's own trailing
 * average as a stand-in for projected volume, their trailing average snap
 * share over the same window, and what actually happened next.
 *
 * Shared by the diagnostic report and the hurdle fit so both are built off
 * the exact same sample construction — a fit validated against a differently
 * constructed sample than the one used to build it would not be a real
 * validation.
 */
function buildZeroInflationSamples(
  stat: "receptions" | "rush_attempts",
  regular: readonly PlayerWeekLike[],
  snapIndex: ReadonlyMap<string, number>,
): ZeroInflationSample[] {
  const extract = EXTRACT[stat];

  const byPlayer = new Map<string, PlayerWeekLike[]>();
  for (const row of regular) {
    const list = byPlayer.get(row.playerId);
    if (list) list.push(row);
    else byPlayer.set(row.playerId, [row]);
  }

  const samples: ZeroInflationSample[] = [];
  for (const weeks of byPlayer.values()) {
    // Chronological order matters here — "prior" below must mean prior.
    const ordered = [...weeks].sort((a, b) =>
      a.season !== b.season ? a.season - b.season : a.week - b.week,
    );
    const values = ordered.map(extract);
    if (values.length < 4) continue;

    for (let i = 2; i < values.length; i += 1) {
      const prior = values.slice(0, i);
      const baseline = prior.reduce((s, v) => s + v, 0) / prior.length;
      if (baseline <= 0) continue;

      const priorSnaps = ordered
        .slice(0, i)
        .map((row) =>
          snapIndex.get(
            `${row.season}|${row.week}|${row.team}|${nameKey(row.name)}`,
          ),
        );
      const known = priorSnaps.filter((s): s is number => s != null);
      if (known.length === 0) continue;
      const snapShare = known.reduce((s, v) => s + v, 0) / known.length;

      samples.push({ baseline, snapShare, actual: values[i] });
    }
  }
  return samples;
}

/**
 * Does snap share explain zero-rate beyond what projected volume already does?
 *
 * `baselineSnapShare`/`baselineRouteParticipation` (`src/lib/ingest/baselines.ts`)
 * are computed from the same offensive-snap-% source and are currently unused by
 * the distribution — before wiring either into a hurdle model, this checks
 * whether they carry information the volume baseline does not already have.
 *
 * Within each volume bin, players are split into snap-share terciles. If the
 * zero-rate is flat across terciles at a fixed volume level, snap share is
 * redundant with volume (plausible — it is an input to the projection that
 * produces that volume in the first place) and a hurdle should condition on
 * volume alone. If zero-rate varies meaningfully across terciles, snap share
 * carries real marginal signal worth threading into the model.
 */
function reportZeroInflationBySnapShare(
  regular: readonly PlayerWeekLike[],
  snapIndex: ReadonlyMap<string, number>,
): void {
  console.log("");
  console.log("=".repeat(72));
  console.log("ZERO-RATE vs SNAP SHARE — does snap share add signal beyond volume?");
  console.log("=".repeat(72));
  console.log(
    "  Within each volume bin, players are split into snap-share terciles",
  );
  console.log(
    "  (own trailing average, same prior-games window as the volume baseline).",
  );
  console.log(
    "  Flat zero-rate across terciles means snap share is redundant with",
  );
  console.log("  volume; a real spread means it carries marginal signal.");

  for (const stat of ["receptions", "rush_attempts"] as const) {
    const samples = buildZeroInflationSamples(stat, regular, snapIndex);

    console.log("");
    console.log(`${stat}  (n=${samples.length} with known snap share)`);
    console.log(
      `  ${"volume".padEnd(11)} ${"tercile".padEnd(9)} ${"n".padStart(6)} ` +
        `${"snap share".padStart(11)} ${"P(zero)".padStart(9)}`,
    );

    for (const [lo, hi] of BINS) {
      const inBin = samples.filter((s) => s.baseline >= lo && s.baseline < hi);
      if (inBin.length < 60) continue;

      const sorted = [...inBin].sort((a, b) => a.snapShare - b.snapShare);
      const third = Math.floor(sorted.length / 3);
      const terciles: Array<[string, typeof sorted]> = [
        ["low", sorted.slice(0, third)],
        ["mid", sorted.slice(third, 2 * third)],
        ["high", sorted.slice(2 * third)],
      ];

      for (const [label, group] of terciles) {
        if (group.length === 0) continue;
        const zeroRate =
          group.filter((s) => s.actual === 0).length / group.length;
        const meanSnap =
          group.reduce((s, v) => s + v.snapShare, 0) / group.length;
        console.log(
          `  ${`${lo}-${hi}`.padEnd(11)} ${label.padEnd(9)} ${String(group.length).padStart(6)} ` +
            `${`${(meanSnap * 100).toFixed(0)}%`.padStart(11)} ${`${(zeroRate * 100).toFixed(1)}%`.padStart(9)}`,
        );
      }
    }
  }
}

/**
 * Fit the receptions hurdle model: logistic regression of P(actual=0) on
 * projected volume and snap share, using the exact sample construction
 * `--zero` reports against.
 *
 * Not run for rush_attempts — `--zero`'s own output showed a materially
 * weaker, noisier snap-share relationship there, and rush_attempts is already
 * well-calibrated (+1.1pp bias) without a hurdle.
 */
function reportHurdleFit(
  regular: readonly PlayerWeekLike[],
  snapIndex: ReadonlyMap<string, number>,
): void {
  console.log("");
  console.log("=".repeat(72));
  console.log("FIT hurdle model — paste into config.ts distribution.hurdle");
  console.log("=".repeat(72));

  const samples = buildZeroInflationSamples("receptions", regular, snapIndex);
  // log(mean), not raw mean: mean and snap share are correlated at 0.70 in
  // this sample, and a linear-in-mean term let the optimiser route mean's own
  // effect through the correlated snap-share coefficient — flipping its sign
  // positive, backwards from both the marginal fit and the --zero diagnostic's
  // own within-bin numbers. log(mean+offset) fixed it; see the comment on
  // `distribution.hurdle` in config.ts for the fuller account.
  const points = samples.map((s) => ({
    x: [Math.log(s.baseline + HURDLE_MEAN_LOG_OFFSET), s.snapShare],
    y: (s.actual === 0 ? 1 : 0) as 0 | 1,
  }));

  const fit = logisticFit(points);
  if (!fit) {
    console.log(`  receptions: not enough data (n=${points.length})`);
    return;
  }

  const [meanCoef, snapShareCoef] = fit.coefficients;
  console.log(
    `  receptions: { intercept: ${fit.intercept.toFixed(4)}, meanCoef: ${meanCoef.toFixed(4)}, snapShareCoef: ${snapShareCoef.toFixed(4)} }, // n=${points.length}`,
  );

  // In-sample fit quality only — this is not the held-out validation. Run
  // this on 2020-2022 and check calibrateByPropType on the 2023-2024 backtest
  // separately, same discipline as the sigma refit.
  const predictions = points.map(
    (p) => sigmoid(fit.intercept + meanCoef * p.x[0] + snapShareCoef * p.x[1]),
  );
  const actualZeroRate = points.filter((p) => p.y === 1).length / points.length;
  const meanPredictedZeroRate =
    predictions.reduce((s, v) => s + v, 0) / predictions.length;
  console.log(
    `  in-sample: actual zero-rate ${(actualZeroRate * 100).toFixed(1)}%, ` +
      `mean predicted ${(meanPredictedZeroRate * 100).toFixed(1)}%`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
