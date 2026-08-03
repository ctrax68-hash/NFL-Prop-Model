"use client";

import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { Side } from "@/lib/engine/types";
import { PROP_SHORT, formatOdds, formatPercent, formatUnits } from "@/lib/format";
import { EdgeBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";
import { useBetSlip, type SlipLeg } from "./BetSlipProvider";

/**
 * Holographic price button.
 *
 * Over is gold, under is azure — the two sides read as opposites at a glance
 * without needing to parse the O/U glyph. Selected fills solid with an outer
 * glow so a built slip is legible from across the room.
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
  const hue = isOver ? "var(--gold)" : "var(--azure)";

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${isOver ? "Over" : "Under"} ${line} at ${formatOdds(odds)}, model edge ${formatPercent(edge)}`}
      className={clsx(
        "relative flex min-h-[54px] min-w-[76px] flex-1 flex-col items-center justify-center rounded-[var(--radius-sm)] border transition-all duration-200 active:scale-[0.96]",
        selected
          ? "border-transparent"
          : recommended
            ? "border-[rgba(53,227,159,0.4)] bg-[rgba(32,26,36,0.75)] hover:border-[var(--mint)]"
            : "border-[var(--border)] bg-[rgba(32,26,36,0.55)] hover:border-[var(--border-strong)]",
      )}
      style={
        selected
          ? {
              background: isOver
                ? "linear-gradient(180deg, var(--gold-bright), var(--gold))"
                : "linear-gradient(180deg, #8ad8ff, var(--azure))",
              boxShadow: isOver ? "var(--glow-gold)" : "var(--glow-azure)",
            }
          : undefined
      }
    >
      <span
        className={clsx(
          "eyebrow",
          selected ? "text-[#14100a] opacity-80" : "text-[var(--ink-mute)]",
        )}
      >
        {isOver ? "O" : "U"} {line}
      </span>
      <span
        className="numeric text-sm font-bold"
        style={{ color: selected ? "#14100a" : hue }}
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

  const makeLeg = (side: Side): SlipLeg => ({
    propId: row.propId,
    season,
    week,
    gameId: row.gameId,
    playerId: row.playerId,
    playerName: row.playerName,
    teamId: row.teamId,
    propType: row.propType,
    lineValue: row.lineValue,
    side,
    oddsAmerican:
      side === "over" ? row.oddsOverAmerican : row.oddsUnderAmerican,
    modelProb: side === "over" ? row.modelProbOver : row.modelProbUnder,
    fairProb: side === "over" ? row.fairProbOver : row.fairProbUnder,
    edge: side === "over" ? row.edgeOver : row.edgeUnder,
    suggestedUnits: row.recommendedUnits || 0.25,
    units: row.recommendedUnits || 0.25,
  });

  return (
    <div
      className={clsx(
        "scan animate-rise relative flex items-center gap-3 border-b border-[var(--border)] px-3 py-3 last:border-b-0",
        "hover:bg-[rgba(255,194,75,0.035)]",
        row.isRecommended && "pick-ring",
      )}
      style={{
        // Stagger only the first screenful — past that the delay would just
        // look like the list is broken.
        animationDelay: index < 14 ? `${index * 28}ms` : undefined,
      }}
    >
      <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={40} />

      <div className="min-w-0 flex-1">
        <Link
          href={`/prop/${encodeURIComponent(row.propId)}`}
          className="block truncate text-sm font-semibold text-[var(--ink)] transition-colors hover:text-[var(--gold)]"
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
          onSelect={() => slip.toggle(makeLeg("over"))}
        />
        <OddsButton
          side="under"
          odds={row.oddsUnderAmerican}
          line={row.lineValue}
          edge={row.edgeUnder}
          selected={slip.has(row.propId, "under")}
          recommended={row.isRecommended && row.bestSide === "under"}
          onSelect={() => slip.toggle(makeLeg("under"))}
        />
      </div>
    </div>
  );
}
