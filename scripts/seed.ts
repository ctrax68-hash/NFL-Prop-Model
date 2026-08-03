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
import path from "node:path";

import type { BacktestResult } from "../src/lib/backtest";

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

  // Slates ship whole — the board, prop detail and tracker all read from them.
  const slateDir = path.join(WORKING, "slates");
  let slateCount = 0;
  if (existsSync(slateDir)) {
    for (const file of await readdir(slateDir)) {
      if (!file.endsWith(".json")) continue;
      const body = await readFile(path.join(slateDir, file), "utf8");
      await writeFile(path.join(SEED, "slates", file), body, "utf8");
      slateCount += 1;
      console.log(
        `  slate ${file.padEnd(14)} ${(body.length / 1024).toFixed(0)} KB`,
      );
    }
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
