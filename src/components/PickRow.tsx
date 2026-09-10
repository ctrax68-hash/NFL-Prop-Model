import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import { PROP_SHORT, formatOdds, formatPercent, formatUnits } from "@/lib/format";
import { EdgeBadge, InjuryBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";

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
 * Exported so `ScheduleGameCard` can tally hits/misses across a whole card's
 * recommended picks using the exact same rule this file uses per row.
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

const ROW_TINT: Record<LiveStatus, string | false> = {
  won: "border-[rgba(53,227,159,0.45)] bg-[rgba(53,227,159,0.06)] hover:border-[var(--mint)]",
  lost: "border-[rgba(255,90,110,0.45)] bg-[rgba(255,90,110,0.06)] hover:border-[var(--ember)]",
  pending: false,
};

const PILL_TINT: Record<LiveStatus, string> = {
  won: "bg-[rgba(53,227,159,0.12)] text-[var(--mint)]",
  lost: "bg-[rgba(255,90,110,0.12)] text-[var(--ember)]",
  pending: "bg-[var(--obsidian-3)] text-[var(--mint)]",
};

/**
 * Marks a recommended row — the model's actual play, not just a priced prop —
 * so it stands out from the wall of other numbers on the same card at a
 * glance, before anyone reads the stake or the edge badge. Same gold as the
 * stake text and the Nav logo's glow: this app's "gold" is a deliberate brand
 * colour, not literal yellow (see the note at the top of globals.css).
 */
function RecommendedStar() {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      className="size-3.5 shrink-0"
      style={{ filter: "drop-shadow(0 0 3px rgba(77,163,255,0.65))" }}
    >
      <path
        fill="var(--gold)"
        d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z"
      />
    </svg>
  );
}

/**
 * One priced market: player, prop, line and edge, tap-to-bet.
 *
 * Shared between the Schedule tab's per-game cards and the public game and
 * player pages so the views can't drift into different row designs for the
 * same underlying {@link BoardRow}.
 *
 * A recommended row — the model's actual play — carries a gold star next to
 * the name so it stands out from every other priced prop on the same card.
 *
 * While a game is live the row grows a fourth line carrying the player's
 * running total for the stat. It gets its own line, and never wraps, so the
 * number sits in the same place on every row instead of spilling onto the
 * line above whenever the projection text ran long. Once the total settles the
 * pick — see {@link liveStatus} — the pill and the row itself go green or red,
 * matching the Tracker's won/lost colours, so a card reads at a glance.
 */
export function PickRow({
  row,
  subtitle,
  finished,
  liveValue,
  liveFinal = false,
}: {
  row: BoardRow;
  /** Defaults to the opponent (Schedule's context); the player page passes the prop name instead. */
  subtitle?: string;
  /** Dims the row rather than hiding it — a settled game is done being bettable but still worth a glance. */
  finished?: boolean;
  /** This player's live in-game total for this stat, while the game is in progress. Display only — never fed back into the model. */
  liveValue?: number | null;
  /** True once the live feed reports the game over, which is when unders and unreached overs can be called. */
  liveFinal?: boolean;
}) {
  const modelProb = row.bestSide === "over" ? row.modelProbOver : row.modelProbUnder;
  const status =
    liveValue != null ? liveStatus(row.bestSide, liveValue, row.lineValue, liveFinal) : null;

  return (
    <Link
      href={`/prop/${encodeURIComponent(row.propId)}`}
      className={clsx(
        "tap flex min-h-[60px] items-center gap-2.5 rounded-[var(--radius-sm)] border px-2.5 py-1.5 transition-colors",
        // One border/background utility per state — stacking the tint on top
        // of the defaults would leave the cascade, not the status, to decide.
        status && ROW_TINT[status]
          ? ROW_TINT[status]
          : "border-[var(--border)] bg-[rgba(32,26,36,0.5)] hover:border-[var(--bronze)]",
        finished && "opacity-55",
      )}
    >
      <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-[var(--ink)]">
          {row.isRecommended ? <RecommendedStar /> : null}
          <span className="truncate">{row.playerName}</span>
          <span className="shrink-0 text-[11px] font-medium text-[var(--ink-mute)]">
            {row.position}
          </span>
          <InjuryBadge status={row.injuryStatus} className="shrink-0" />
        </span>
        <span className="eyebrow block text-[var(--ink-mute)]">
          {PROP_SHORT[row.propType]} · {subtitle ?? row.opponentLabel}
        </span>
        {/* Single line, always: with the stake in here too it was one
            character over a phone's width and wrapped on recommended rows. */}
        <span className="numeric block truncate text-[11px] text-[var(--ink-dim)]">
          proj {row.projectedValue.toFixed(1)} · model {formatPercent(modelProb, 0)}
        </span>
        {liveValue != null && status ? (
          <span
            data-live-row
            className="mt-1 flex items-center gap-1.5 whitespace-nowrap text-[11px]"
          >
            <span
              className={clsx(
                "numeric inline-flex items-center gap-1 rounded-[var(--radius-pill)] px-1.5 py-px font-bold",
                PILL_TINT[status],
              )}
            >
              <span
                aria-hidden
                className={clsx(
                  "inline-block size-1 rounded-full bg-current",
                  status === "pending" && "pulse-dot",
                )}
              />
              {liveValue} so far
            </span>
            <span className="numeric text-[var(--ink-mute)]">/ {row.lineValue}</span>
            {status === "won" ? (
              <span className="eyebrow font-bold text-[var(--mint)]">Hit</span>
            ) : status === "lost" ? (
              <span className="eyebrow font-bold text-[var(--ember)]">Miss</span>
            ) : null}
          </span>
        ) : null}
      </span>
      <span className="numeric shrink-0 text-right text-xs text-[var(--ink-dim)]">
        <span className="block">
          {row.bestSide === "over" ? "O" : "U"} {row.lineValue}
        </span>
        <span className="block">
          {formatOdds(
            row.bestSide === "over" ? row.oddsOverAmerican : row.oddsUnderAmerican,
          )}
        </span>
        {/* Line, price, stake: the three betting numbers stacked together. */}
        {row.isRecommended ? (
          <span className="block font-bold text-[var(--gold)]">
            {formatUnits(row.recommendedUnits)}
          </span>
        ) : null}
      </span>
      <EdgeBadge edge={row.bestEdge} className="shrink-0" />
    </Link>
  );
}
