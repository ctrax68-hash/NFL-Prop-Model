"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";
import { PROP_SHORT, formatOdds, teamLabel } from "@/lib/format";
import { Card, EdgeBadge } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";

const PREVIEW_COUNT = 5;

function PickRow({ row }: { row: BoardRow }) {
  return (
    <Link
      href={`/prop/${encodeURIComponent(row.propId)}`}
      className="tap flex min-h-[48px] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.5)] px-2.5 py-1.5 transition-colors hover:border-[var(--bronze)]"
    >
      <PlayerAvatar url={row.headshotUrl} name={row.playerName} size={32} />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-[var(--ink)]">
          {row.playerName}
        </span>
        <span className="eyebrow text-[var(--ink-mute)]">
          {PROP_SHORT[row.propType]} · {row.opponentLabel}
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

/**
 * One game's card: the top {@link PREVIEW_COUNT} picks up front, everything
 * else behind a tap so a slate of forty-plus markets per game doesn't turn
 * the schedule back into the same wall of noise this page exists to avoid.
 *
 * A finished game (final score in) renders dimmed with a FINAL badge instead
 * of dropping off the page — it's done being bettable, but a settled score is
 * still worth a glance without a trip to the Tracker.
 */
export function ScheduleGameCard({
  game,
  picks,
  finished,
}: {
  game: SlateGame;
  picks: readonly BoardRow[];
  finished: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const preview = picks.slice(0, PREVIEW_COUNT);
  const rest = picks.slice(PREVIEW_COUNT);

  return (
    <Card className={clsx("p-4", finished && "opacity-55")}>
      <div className="mb-3 flex items-baseline justify-between">
        <span className="text-sm font-bold text-[var(--ink)]">
          {teamLabel(game.awayTeam)}{" "}
          <span className="text-[var(--ink-mute)]">@</span>{" "}
          {teamLabel(game.homeTeam)}
        </span>
        {finished ? (
          <span className="eyebrow font-bold text-[var(--ink-mute)]">
            FINAL {game.awayScore}-{game.homeScore}
          </span>
        ) : (
          <span className="eyebrow text-[var(--ink-mute)]">{game.gameday}</span>
        )}
      </div>

      {preview.length === 0 ? (
        <p className="text-xs text-[var(--ink-mute)]">
          No priced props for this game yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {preview.map((row) => (
            <PickRow key={row.propId} row={row} />
          ))}

          {expanded
            ? rest.map((row) => <PickRow key={row.propId} row={row} />)
            : null}

          {rest.length > 0 ? (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="tap flex min-h-[40px] w-full items-center justify-center rounded-[var(--radius-sm)] border border-[var(--border)] text-xs font-semibold text-[var(--ink-dim)] transition-colors hover:border-[var(--bronze)] hover:text-[var(--ink)]"
            >
              {expanded ? "Show less" : `Show ${rest.length} more`}
            </button>
          ) : null}
        </div>
      )}
    </Card>
  );
}
