"use client";

import Link from "next/link";

import type { BoardRow } from "@/lib/data";
import { PROP_SHORT, formatOdds } from "@/lib/format";

/**
 * Stock-ticker marquee of the model's strongest edges.
 *
 * The list is duplicated once and the track translates exactly -50%, which is
 * what makes the loop seamless — at the halfway point the second copy sits
 * precisely where the first began. `aria-hidden` on the duplicate keeps screen
 * readers from hearing everything twice.
 *
 * Hidden entirely under reduced motion (see globals.css) — a scrolling strip is
 * the single most irritating element for anyone motion-sensitive.
 */
export function Ticker({ rows }: { rows: BoardRow[] }) {
  const top = rows.filter((row) => row.isRecommended).slice(0, 14);
  if (top.length < 3) return null;

  const item = (row: BoardRow, key: string, hidden: boolean) => (
    <Link
      key={key}
      href={`/prop/${encodeURIComponent(row.propId)}`}
      aria-hidden={hidden}
      tabIndex={hidden ? -1 : undefined}
      className="group inline-flex shrink-0 items-center gap-2.5 px-4 py-1.5 transition-colors hover:bg-[rgba(255,194,75,0.06)]"
    >
      <span className="text-[11px] font-semibold tracking-wide text-[var(--ink)]">
        {row.playerName}
      </span>
      <span className="eyebrow">{PROP_SHORT[row.propType]}</span>
      <span className="numeric text-[11px] text-[var(--ink-dim)]">
        {row.bestSide === "over" ? "O" : "U"} {row.lineValue}
      </span>
      <span className="numeric text-[11px] text-[var(--ink-dim)]">
        {formatOdds(
          row.bestSide === "over" ? row.oddsOverAmerican : row.oddsUnderAmerican,
        )}
      </span>
      <span className="numeric text-[11px] font-bold text-[var(--mint)]">
        +{(row.bestEdge * 100).toFixed(1)}%
      </span>
      <span aria-hidden className="text-[var(--border-strong)]">
        ◆
      </span>
    </Link>
  );

  return (
    <div className="relative overflow-hidden border-b border-[var(--border)] bg-[rgba(16,12,18,0.6)]">
      {/* Edge fades so items dissolve rather than clip. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16"
        style={{
          background: "linear-gradient(90deg, var(--void), transparent)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16"
        style={{
          background: "linear-gradient(270deg, var(--void), transparent)",
        }}
      />

      <div className="flex items-center">
        <div className="z-20 flex shrink-0 items-center gap-1.5 border-r border-[var(--border)] bg-[var(--obsidian-2)] px-3 py-1.5">
          <span
            aria-hidden
            className="pulse-dot inline-block size-1.5 rounded-full bg-[var(--mint)]"
          />
          <span className="eyebrow text-[var(--gold)]">Live Edges</span>
        </div>

        <div
          className="ticker-track flex w-max hover:[animation-play-state:paused]"
          style={{ animation: "ticker-scroll 42s linear infinite" }}
        >
          {top.map((row) => item(row, `a-${row.propId}`, false))}
          {top.map((row) => item(row, `b-${row.propId}`, true))}
        </div>
      </div>
    </div>
  );
}
