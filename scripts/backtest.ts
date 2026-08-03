/**
 * Replay past weeks and report how the model would have done.
 *
 *   npx tsx scripts/backtest.ts --seasons 2023-2024
 *   npx tsx scripts/backtest.ts --seasons 2024 --weeks 1-9
 */

import { writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

import { runBacktest, type Bucket } from "../src/lib/backtest";
import { DEFAULT_CONFIG } from "../src/lib/engine/config";
import { createPropsProvider } from "../src/lib/ingest/props/factory";
import { loadDataBundle, seasonsToLoad } from "../src/lib/pipeline/bundle";
import { parseArgs, parseSeasonRange } from "./lib/args";

function parseWeeks(value: string | undefined): number[] | undefined {
  if (!value) return undefined;
  const match = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(value.trim());
  if (!match) throw new Error(`Invalid week range: ${value}`);
  const start = Number(match[1]);
  const end = match[2] ? Number(match[2]) : start;
  const out: number[] = [];
  for (let week = start; week <= end; week += 1) out.push(week);
  return out;
}

function formatBucket(bucket: Bucket): string {
  const roi = `${(bucket.roi * 100).toFixed(2)}%`;
  const hit = `${(bucket.hitRate * 100).toFixed(1)}%`;
  return (
    `  ${bucket.label.padEnd(18)} ` +
    `${String(bucket.bets).padStart(5)} bets  ` +
    `hit ${hit.padStart(6)}  ` +
    `staked ${bucket.unitsStaked.toFixed(1).padStart(8)}u  ` +
    `P/L ${bucket.unitsProfit.toFixed(2).padStart(9)}u  ` +
    `ROI ${roi.padStart(8)}`
  );
}

async function main(): Promise<void> {
  const args = parseArgs();
  const seasons = parseSeasonRange(
    typeof args.seasons === "string" ? args.seasons : "2023-2024",
  );
  const weeks = parseWeeks(typeof args.weeks === "string" ? args.weeks : undefined);
  const providerName =
    typeof args.provider === "string"
      ? args.provider
      : (process.env.PROPS_PROVIDER ?? "synthetic");

  console.log(`Loading data for ${seasons.join(", ")}...`);
  const bundle = await loadDataBundle(seasonsToLoad(seasons));
  const provider = createPropsProvider(providerName, bundle);

  console.log(`Replaying with lines from: ${provider.name}`);
  const started = Date.now();

  const result = await runBacktest(bundle, {
    seasons,
    weeks,
    config: DEFAULT_CONFIG,
    provider,
    onProgress: (season, week, snapshot) => {
      process.stdout.write(
        `\r  ${season} week ${String(week).padStart(2)} — ` +
          `${String(snapshot.recommendations.length).padStart(3)} bets, ` +
          `${String(snapshot.evaluations.length).padStart(4)} props priced   `,
      );
    },
  });

  process.stdout.write("\n");
  console.log(`Replayed ${result.weeksRun} weeks in ${((Date.now() - started) / 1000).toFixed(1)}s`);

  console.log("");
  console.log("=".repeat(78));
  console.log("OVERALL");
  console.log("=".repeat(78));
  console.log(formatBucket(result.summary));

  console.log("");
  console.log("By edge bucket");
  for (const bucket of result.byEdgeBucket) {
    if (bucket.bets > 0) console.log(formatBucket(bucket));
  }

  console.log("");
  console.log("By prop type");
  for (const bucket of result.byPropType) console.log(formatBucket(bucket));

  console.log("");
  console.log("By season");
  for (const bucket of result.bySeason) console.log(formatBucket(bucket));

  console.log("");
  console.log("=".repeat(78));
  console.log("CALIBRATION — the measurement that actually validates the model");
  console.log("=".repeat(78));
  console.log("  predicted P(over) vs. share that actually went over, all priced props");
  console.log("");
  console.log(
    `  ${"bin".padEnd(12)} ${"predicted".padStart(10)} ${"realized".padStart(10)} ` +
      `${"error".padStart(9)} ${"n".padStart(7)}`,
  );

  let weightedAbsError = 0;
  let totalN = 0;
  for (const bin of result.calibration) {
    const error = bin.realized - bin.predicted;
    weightedAbsError += Math.abs(error) * bin.n;
    totalN += bin.n;
    console.log(
      `  ${`${bin.binLow.toFixed(1)}-${bin.binHigh.toFixed(1)}`.padEnd(12)} ` +
        `${bin.predicted.toFixed(3).padStart(10)} ${bin.realized.toFixed(3).padStart(10)} ` +
        `${(error >= 0 ? "+" : "") + error.toFixed(3)}`.padStart(10) +
        ` ${String(bin.n).padStart(7)}`,
    );
  }

  if (totalN > 0) {
    const mce = weightedAbsError / totalN;
    console.log("");
    console.log(`  Mean calibration error: ${(mce * 100).toFixed(2)} percentage points`);
    console.log(
      `  ${
        mce < 0.02
          ? "Well calibrated — stated probabilities match reality closely."
          : mce < 0.05
            ? "Reasonably calibrated; some drift in the tails."
            : "Poorly calibrated — the distribution model needs work."
      }`,
    );
  }

  if (!result.propsAreReal) {
    console.log("");
    console.log("=".repeat(78));
    console.log("READ THIS BEFORE INTERPRETING THE ROI ABOVE");
    console.log("=".repeat(78));
    console.log("  Lines came from the synthetic book, which derives them from this");
    console.log("  model's own projections. The measured edge is therefore just the");
    console.log("  synthetic noise term read back, and the ROI figure is circular — it");
    console.log("  is NOT evidence the model would beat a real sportsbook.");
    console.log("");
    console.log("  What IS meaningful here: the calibration table, which is scored");
    console.log("  against real NFL results, and the mechanical correctness of");
    console.log("  projection, pricing, grading and sizing.");
    console.log("");
    console.log("  For a real edge measurement, set PROPS_PROVIDER=odds-api with a key.");
  }

  if (args.out) {
    const outPath =
      typeof args.out === "string" ? args.out : ".data/backtest.json";
    await mkdir(path.dirname(outPath), { recursive: true });
    await writeFile(outPath, JSON.stringify(result, null, 2), "utf8");
    console.log("");
    console.log(`Full result written to ${outPath}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
