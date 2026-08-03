/**
 * Build the committed seed dataset.
 *
 * `.data/` is the local working directory and is gitignored — which meant the
 * deployed site had no slates at all and rendered nothing but empty states.
 * This writes a trimmed copy to `data/`, which IS committed, so a fresh clone
 * or a Vercel build has real data to render.
 *
 * The backtest artifact is trimmed rather than copied wholesale: its `bets`
 * array is ~1 MB and the dashboard never renders an individual bet (only counts
 * and aggregates), and the equity curve is downsampled to what the chart
 * actually plots. That takes the file from ~1.7 MB to a few tens of KB, which
 * matters because a serverless function parses it on every cold start.
 *
 *   npx tsx scripts/seed.ts
 */

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { gzipSync } from "node:zlib";
import path from "node:path";

import type { BacktestResult } from "../src/lib/backtest";
import { summarise, type SlateSnapshot, type SlateSummary } from "../src/lib/pipeline/types";

const WORKING = path.join(process.cwd(), ".data");
const SEED = path.join(process.cwd(), "data");

/** Points the equity chart actually draws. */
const EQUITY_POINTS = 400;

async function main(): Promise<void> {
  if (!existsSync(WORKING)) {
    console.error("No .data/ directory. Run scripts/pipeline.ts first.");
    process.exit(1);
  }

  await mkdir(path.join(SEED, "slates"), { recursive: true });

  const slateDir = path.join(WORKING, "slates");
  const summaries: SlateSummary[] = [];
  let rawBytes = 0;
  let seedBytes = 0;

  if (existsSync(slateDir)) {
    const files = (await readdir(slateDir))
      .filter((f) => f.endsWith(".json") && f !== "index.json")
      .sort();

    for (const file of files) {
      const body = await readFile(path.join(slateDir, file), "utf8");
      const snapshot = JSON.parse(body) as SlateSnapshot;
      rawBytes += body.length;

      summaries.push(summarise(snapshot));

      // `rejected` is the list of props the selector declined. Nothing in the
      // UI reads it, and it is the one whole key that is pure dead weight.
      const trimmed: SlateSnapshot = { ...snapshot, rejected: [] };

      // Gzip is what makes a hundred slates shippable at all: this shape of
      // JSON compresses about 9x, so the committed seed is ~20 MB instead of
      // ~190 MB. The store gunzips on read.
      const packed = gzipSync(Buffer.from(JSON.stringify(trimmed), "utf8"), {
        level: 9,
      });
      await writeFile(path.join(SEED, "slates", `${file}.gz`), packed);
      seedBytes += packed.length;
    }
  }

  // The manifest exists so `listSlates()` — which runs in the root layout, on
  // every page of every request — does not have to open a hundred slates to
  // read a dozen summary fields off each.
  summaries.sort((a, b) => b.season - a.season || b.week - a.week);
  await writeFile(
    path.join(SEED, "slates", "index.json"),
    JSON.stringify(summaries),
    "utf8",
  );

  const slateCount = summaries.length;
  if (slateCount > 0) {
    console.log(
      `  ${slateCount} slates  ${(rawBytes / 1024 / 1024).toFixed(0)} MB raw ` +
        `-> ${(seedBytes / 1024 / 1024).toFixed(1)} MB gzipped ` +
        `(${(rawBytes / seedBytes).toFixed(1)}x)`,
    );
    console.log(
      `  index.json     ${(JSON.stringify(summaries).length / 1024).toFixed(0)} KB ` +
        `(${slateCount} summaries)`,
    );
  }

  const backtestPath = path.join(WORKING, "backtest.json");
  if (existsSync(backtestPath)) {
    const full = JSON.parse(
      await readFile(backtestPath, "utf8"),
    ) as BacktestResult;

    const step = Math.max(
      1,
      Math.floor(full.equityCurve.length / EQUITY_POINTS),
    );

    const trimmed: BacktestResult = {
      ...full,
      // Dropped deliberately: the dashboard shows counts and aggregates, never
      // a single graded bet. Regenerate the full file locally when you want to
      // inspect individual results.
      bets: [],
      equityCurve: full.equityCurve.filter(
        (_, i) => i % step === 0 || i === full.equityCurve.length - 1,
      ),
    };

    const body = JSON.stringify(trimmed);
    await writeFile(path.join(SEED, "backtest.json"), body, "utf8");
    console.log(
      `  backtest.json  ${(body.length / 1024).toFixed(0)} KB ` +
        `(from ${(JSON.stringify(full).length / 1024).toFixed(0)} KB, ` +
        `${full.bets.length} bets dropped)`,
    );
  }

  console.log("");
  console.log(`Seed written to data/ — ${slateCount} slate(s).`);
  console.log("Commit it so the deployed site has something to render.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
