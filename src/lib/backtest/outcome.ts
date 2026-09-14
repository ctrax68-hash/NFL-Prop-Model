/**
 * The single rule for whether a side won, lost or pushed against a line —
 * split out of `backtest/index.ts` (which also imports `runPipeline` and its
 * whole ingest/projection dependency graph) so anything that only needs this
 * one trivial, stable rule doesn't have to pull that weight in too. `board.ts`
 * needs exactly this and nothing else from the backtest module, and is
 * deliberately kept lightweight — see its own header comment.
 */

import type { Side } from "../engine/types";

export type Outcome = "won" | "lost" | "push";

export function grade(side: Side, line: number, actual: number): Outcome {
  if (actual === line) return "push";
  const wentOver = actual > line;
  return (side === "over") === wentOver ? "won" : "lost";
}
