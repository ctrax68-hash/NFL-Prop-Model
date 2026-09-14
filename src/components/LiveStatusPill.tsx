import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { Outcome } from "@/lib/backtest/outcome";
import { SETTLEMENT_TINT } from "@/lib/settlementColors";

export type LiveStatus = "won" | "lost" | "pending";

/**
 * Whether a pick has already been decided by the live total.
 *
 * Every priced stat (yards, receptions, attempts, completions) only ever goes
 * up during a game and every line is X.5, so an OVER is clinched the moment
 * the total passes the line and an UNDER is lost at the same moment. The other
 * two outcomes — an UNDER holding, an OVER falling short — are only known once
 * the game is over, which is what `final` says.
 *
 * Shared by `PickRow` (Schedule) and `PropRow` (Edges) so both tabs read a
 * live pick the same way instead of drifting into two rules for one concept.
 */
export function liveStatus(
  side: BoardRow["bestSide"],
  live: number,
  line: number,
  final: boolean,
): LiveStatus {
  const passed = live > line;
  if (side === "over") return passed ? "won" : final ? "lost" : "pending";
  return passed ? "lost" : final ? "won" : "pending";
}

export const LIVE_STATUS_TINT: Record<LiveStatus, string> = {
  won: "bg-[rgba(53,227,159,0.12)] text-[var(--mint)]",
  lost: "bg-[rgba(255,90,110,0.12)] text-[var(--ember)]",
  pending: "bg-[var(--obsidian-3)] text-[var(--mint)]",
};

/**
 * "● 63 so far / 62.5 HIT" — the running total pill, plus the Hit/Miss call
 * once the total decides it. Display only, never fed back into the model.
 */
export function LiveStatusPill({
  liveValue,
  lineValue,
  bestSide,
  liveFinal,
}: {
  liveValue: number;
  lineValue: number;
  bestSide: BoardRow["bestSide"];
  liveFinal: boolean;
}) {
  const status = liveStatus(bestSide, liveValue, lineValue, liveFinal);

  return (
    <span data-live-row className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px]">
      <span
        className={clsx(
          "numeric inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-1.5 py-px font-bold",
          LIVE_STATUS_TINT[status],
        )}
      >
        <span
          aria-hidden
          className={clsx("inline-block size-1 rounded-full bg-current", status === "pending" && "pulse-dot")}
        />
        {liveValue} so far
      </span>
      <span className="numeric text-[var(--ink-mute)]">/ {lineValue}</span>
      {status === "won" ? (
        <span className="eyebrow font-bold text-[var(--mint)]">Hit</span>
      ) : status === "lost" ? (
        <span className="eyebrow font-bold text-[var(--ember)]">Miss</span>
      ) : null}
    </span>
  );
}

const CLOSING_LABEL: Record<Outcome | "void", string> = {
  won: "Hit",
  lost: "Miss",
  push: "Push",
  void: "Void",
};

const CLOSING_LABEL_COLOR: Record<Outcome | "void", string> = {
  won: "text-[var(--mint)]",
  lost: "text-[var(--ember)]",
  push: "text-[var(--ink-dim)]",
  void: "text-[var(--ink-mute)]",
};

/**
 * The final result once a week is graded — "how the bet turned out" once
 * there's nothing left to track live. Distinct from {@link LiveStatusPill}:
 * that one's status is inferred client-side from an in-progress ESPN poll,
 * this one is the pipeline's own official grade (`BoardRow.settled`),
 * already resolved server-side — no "pending" state, since a row with
 * nothing graded yet just doesn't render this at all.
 */
export function ClosingStatusPill({
  actualValue,
  lineValue,
  outcome,
}: {
  actualValue: number | null;
  lineValue: number;
  outcome: Outcome | "void";
}) {
  return (
    <span
      data-closing-row
      className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px]"
    >
      <span
        className={clsx(
          "numeric inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-1.5 py-px font-bold",
          SETTLEMENT_TINT[outcome],
        )}
      >
        {actualValue != null ? `${actualValue} final` : "voided"}
      </span>
      {outcome !== "void" ? (
        <span className="numeric text-[var(--ink-mute)]">/ {lineValue}</span>
      ) : null}
      <span className={clsx("eyebrow font-bold", CLOSING_LABEL_COLOR[outcome])}>
        {CLOSING_LABEL[outcome]}
      </span>
    </span>
  );
}
