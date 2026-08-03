"use client";

import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { Side } from "@/lib/engine/types";
import {
  PROP_SHORT,
  formatOdds,
  formatPercent,
  formatUnits,
} from "@/lib/format";
import { EdgeBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";
import { useBetSlip, type SlipLeg } from "./BetSlipProvider";

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
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      aria-label={`${side === "over" ? "Over" : "Under"} ${line} at ${formatOdds(odds)}, model edge ${formatPercent(edge)}`}
      className={clsx(
        "group relative flex min-h-[52px] min-w-[74px] flex-1 flex-col items-center justify-center rounded-[var(--radius-sm)] border px-2 py-1.5 transition-colors",
        selected
          ? "border-transparent bg-[var(--accent)] text-[var(--accent-ink)]"
          : recommended
            ? "border-[var(--positive)]/45 bg-[var(--surface-2)] hover:border-[var(--positive)]"
            : "border-[var(--border)] bg-[var(--surface-2)] hover:border-[var(--border-strong)]",
      )}
    >
      <span
        className={clsx(
          "text-[10px] font-semibold tracking-wide uppercase",
          selected ? "opacity-80" : "text-[var(--text-muted)]",
        )}
      >
        {side === "over" ? "O" : "U"} {line}
      </span>
      <span className="tnum text-sm font-semibold">{formatOdds(odds)}</span>
    </button>
  );
}

export function PropRow({
  row,
  season,
  week,
}: {
  row: BoardRow;
  season: number;
  week: number;
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
    <div className="flex items-center gap-3 border-b px-3 py-2.5 last:border-b-0 hover:bg-[var(--surface-2)]/60">
      <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={40} />

      <div className="min-w-0 flex-1">
        <Link
          href={`/prop/${encodeURIComponent(row.propId)}`}
          className="block truncate text-sm font-semibold hover:text-[var(--accent)]"
        >
          {row.playerName}
        </Link>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-[var(--text-muted)]">
          <span className="font-medium text-[var(--text-secondary)]">
            {row.position} · {row.teamId}
          </span>
          <span>{row.opponentLabel}</span>
          <span className="text-[var(--text-secondary)]">
            {PROP_SHORT[row.propType]}
          </span>
        </div>
        <div className="mt-1 flex items-center gap-2">
          <EdgeBadge edge={row.bestEdge} />
          <span className="tnum text-[11px] text-[var(--text-muted)]">
            proj {row.projectedValue.toFixed(1)}
          </span>
          {row.isRecommended ? (
            <span className="tnum text-[11px] font-medium text-[var(--positive)]">
              {formatUnits(row.recommendedUnits)}
            </span>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 gap-1.5">
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
