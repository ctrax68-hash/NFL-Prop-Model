import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import { PROP_SHORT, formatOdds, formatPercent, formatUnits } from "@/lib/format";
import { EdgeBadge, InjuryBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";

/**
 * One priced market: player, prop, line and edge, tap-to-bet.
 *
 * Shared between the Schedule tab's per-game cards and the public game and
 * player pages so the views can't drift into different row designs for the
 * same underlying {@link BoardRow}.
 */
export function PickRow({
  row,
  subtitle,
  finished,
}: {
  row: BoardRow;
  /** Defaults to the opponent (Schedule's context); the player page passes the prop name instead. */
  subtitle?: string;
  /** Dims the row rather than hiding it — a settled game is done being bettable but still worth a glance. */
  finished?: boolean;
}) {
  const modelProb = row.bestSide === "over" ? row.modelProbOver : row.modelProbUnder;

  return (
    <Link
      href={`/prop/${encodeURIComponent(row.propId)}`}
      className={clsx(
        "tap flex min-h-[60px] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.5)] px-2.5 py-1.5 transition-colors hover:border-[var(--bronze)]",
        finished && "opacity-55",
      )}
    >
      <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={32} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate text-[13px] font-semibold text-[var(--ink)]">
          <span className="truncate">{row.playerName}</span>
          <span className="shrink-0 text-[11px] font-medium text-[var(--ink-mute)]">
            {row.position}
          </span>
          <InjuryBadge status={row.injuryStatus} className="shrink-0" />
        </span>
        <span className="eyebrow block text-[var(--ink-mute)]">
          {PROP_SHORT[row.propType]} · {subtitle ?? row.opponentLabel}
        </span>
        <span className="numeric block text-[11px] text-[var(--ink-dim)]">
          proj {row.projectedValue.toFixed(1)} · model {formatPercent(modelProb, 0)}
          {row.isRecommended ? (
            <span className="font-bold text-[var(--gold)]">
              {" "}
              · {formatUnits(row.recommendedUnits)}
            </span>
          ) : null}
        </span>
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
      </span>
      <EdgeBadge edge={row.bestEdge} className="shrink-0" />
    </Link>
  );
}
