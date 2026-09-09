/**
 * The backtest result the monitor judges live weeks against. Same file and
 * precedence as `getBacktest()` in `data.ts`, but importable from a script
 * (that module is `server-only`).
 */

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";

import type { BacktestResult } from "../backtest";

export async function loadBacktestReference(
  cwd: string = process.cwd(),
): Promise<BacktestResult | null> {
  for (const dir of [".data", "data"]) {
    const file = path.join(cwd, dir, "backtest.json");
    if (existsSync(file)) {
      return JSON.parse(await readFile(file, "utf8")) as BacktestResult;
    }
  }
  return null;
}
