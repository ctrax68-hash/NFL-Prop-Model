"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";
import { ChevronDown } from "lucide-react";

import type { BoardRow, BoardRowBook } from "@/lib/data";
import type { Side } from "@/lib/engine/types";
import { PROP_SHORT, formatOdds, formatPercent, formatUnits } from "@/lib/format";
import { EdgeBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";
import { useBetSlip, type SlipLeg } from "./BetSlipProvider";

/**
 * Holographic price button.
 *
 * Both sides are neutral until chosen; the accent means "you took this", not
 * "this is the over". Selected fills solid with an outer glow so a built slip
 * is legible at a glance while scrolling.
 */
function OddsButton({
  side,
  odds,
  line,
  selected,
  recommended,
  edge,
  onSelect,
}: {
  side: Side;
  odds: number;
  line: number;
  selected: boolean;
  recommended: boolean;
  edge: number;
  onSelect: () => void;
}) {
  const isOver = side === "over";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${isOver ? "Over" : "Under"} ${line} at ${formatOdds(odds)}, model edge ${formatPercent(edge)}`}
      className={clsx(
        "tap relative flex min-h-[56px] min-w-[80px] flex-1 flex-col items-center justify-center rounded-[var(--radius-sm)] border transition-all duration-200 active:scale-[0.96]",
        selected
          ? "border-transparent"
          : recommended
            ? "border-[rgba(53,227,159,0.4)] bg-[rgba(32,26,36,0.75)] hover:border-[var(--mint)]"
            : "border-[var(--border)] bg-[rgba(32,26,36,0.55)] hover:border-[var(--border-strong)]",
      )}
      // Over and under are not hue-coded. The side is already stated on the
      // chip ("O 10.5" / "U 10.5"), and giving each its own colour meant two
      // adjacent hues doing no work — the accent is worth more spent on the
      // one thing that is genuinely state: which side you've actually taken.
      style={
        selected
          ? {
              background:
                "linear-gradient(180deg, var(--gold-bright), var(--gold))",
              boxShadow: "var(--glow-gold)",
            }
          : undefined
      }
    >
      <span
        className={clsx(
          "eyebrow",
          selected ? "text-[#04101f] opacity-80" : "text-[var(--ink-mute)]",
        )}
      >
        {isOver ? "O" : "U"} {line}
      </span>
      <span
        className="numeric text-[15px] font-bold"
        style={{ color: selected ? "#04101f" : "var(--ink)" }}
      >
        {formatOdds(odds)}
      </span>
    </button>
  );
}

export function PropRow({
  row,
  season,
  week,
  index = 0,
}: {
  row: BoardRow;
  season: number;
  week: number;
  index?: number;
}) {
  const slip = useBetSlip();
  const [expanded, setExpanded] = useState(false);
  const otherBooks = row.books.filter((book) => book.propId !== row.propId);

  const makeLeg = (book: BoardRowBook, side: Side): SlipLeg => ({
    propId: book.propId,
    season,
    week,
    gameId: row.gameId,
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    propType: row.propType,
    lineValue: book.lineValue,
    side,
    oddsAmerican:
      side === "over" ? book.oddsOverAmerican : book.oddsUnderAmerican,
    modelProb: side === "over" ? book.modelProbOver : book.modelProbUnder,
    fairProb: side === "over" ? book.fairProbOver : book.fairProbUnder,
    edge: side === "over" ? book.edgeOver : book.edgeUnder,
    suggestedUnits: book.recommendedUnits || 0.25,
    units: book.recommendedUnits || 0.25,
  });

  return (
    <div
      className={clsx(
        "scan animate-rise relative flex flex-col border-b border-[var(--border)] last:border-b-0",
        "hover:bg-[rgba(255,194,75,0.035)]",
        row.isRecommended && "pick-ring",
      )}
      style={{
        // Stagger only the first screenful — past that the delay would just
        // look like the list is broken.
        animationDelay: index < 14 ? `${index * 28}ms` : undefined,
      }}
    >
      <div className="flex items-center gap-2.5 px-2.5 py-3 sm:gap-3 sm:px-3">
        <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={40} />

        <div className="min-w-0 flex-1">
          <Link
            href={`/prop/${encodeURIComponent(row.propId)}`}
            // The hit area is padded out to the 44px thumb minimum and pulled
            // back with a matching negative margin, so the row stays visually
            // tight while still being tappable without aiming.
            className="-my-2.5 flex min-h-[44px] items-center truncate py-2.5 text-[15px] font-semibold text-[var(--ink)] transition-colors hover:text-[var(--gold)]"
          >
            {row.playerName}
          </Link>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
            <span className="font-medium text-[var(--ink-dim)]">
              {row.position} · {row.teamId}
            </span>
            <span className="text-[var(--ink-mute)]">{row.opponentLabel}</span>
            <span className="eyebrow">{PROP_SHORT[row.propType]}</span>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <EdgeBadge edge={row.bestEdge} />
            <span className="numeric text-[11px] text-[var(--ink-mute)]">
              proj {row.projectedValue.toFixed(1)}
            </span>
            {row.isRecommended ? (
              <span className="numeric text-[11px] font-bold text-[var(--gold)]">
                {formatUnits(row.recommendedUnits)}
              </span>
            ) : null}
            {otherBooks.length > 0 ? (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                aria-expanded={expanded}
                className="flex items-center gap-0.5 text-[11px] text-[var(--ink-mute)] transition-colors hover:text-[var(--gold)]"
              >
                +{otherBooks.length} book{otherBooks.length > 1 ? "s" : ""}
                <ChevronDown
                  size={12}
                  className={clsx("transition-transform", expanded && "rotate-180")}
                />
              </button>
            ) : null}
          </div>
        </div>

        <div className="relative z-[2] flex shrink-0 gap-1.5">
          <OddsButton
            side="over"
            odds={row.oddsOverAmerican}
            line={row.lineValue}
            edge={row.edgeOver}
            selected={slip.has(row.propId, "over")}
            recommended={row.isRecommended && row.bestSide === "over"}
            onSelect={() => slip.toggle(makeLeg(row, "over"))}
          />
          <OddsButton
            side="under"
            odds={row.oddsUnderAmerican}
            line={row.lineValue}
            edge={row.edgeUnder}
            selected={slip.has(row.propId, "under")}
            recommended={row.isRecommended && row.bestSide === "under"}
            onSelect={() => slip.toggle(makeLeg(row, "under"))}
          />
        </div>
      </div>

      {expanded && otherBooks.length > 0 ? (
        <div className="flex flex-col gap-1 border-t border-[var(--border)] bg-[var(--obsidian-2)] px-2.5 py-2 sm:px-3">
          {otherBooks.map((book) => (
            <div key={book.propId} className="flex items-center gap-2">
              <span className="w-16 shrink-0 truncate text-[11px] text-[var(--ink-mute)]">
                {book.bookName}
              </span>
              <span className="flex-1" />
              <div className="flex shrink-0 gap-1.5">
                <OddsButton
                  side="over"
                  odds={book.oddsOverAmerican}
                  line={book.lineValue}
                  edge={book.edgeOver}
                  selected={slip.has(book.propId, "over")}
                  recommended={book.isRecommended && book.bestSide === "over"}
                  onSelect={() => slip.toggle(makeLeg(book, "over"))}
                />
                <OddsButton
                  side="under"
                  odds={book.oddsUnderAmerican}
                  line={book.lineValue}
                  edge={book.edgeUnder}
                  selected={slip.has(book.propId, "under")}
                  recommended={book.isRecommended && book.bestSide === "under"}
                  onSelect={() => slip.toggle(makeLeg(book, "under"))}
                />
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
