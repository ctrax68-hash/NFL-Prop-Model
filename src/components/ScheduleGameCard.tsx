"use client";

import { useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";
import { teamLabel } from "@/lib/format";
import { gameSlug } from "@/lib/seo";
import { Card, WeatherBadge } from "./ui";
import { PickRow } from "./PickRow";

const PREVIEW_COUNT = 5;

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
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <Link
          href={`/games/${gameSlug(game.gameId)}`}
          className="min-w-0 text-sm font-bold text-[var(--ink)] transition-colors hover:text-[var(--gold)]"
        >
          {teamLabel(game.awayTeam)}{" "}
          <span className="text-[var(--ink-mute)]">@</span>{" "}
          {teamLabel(game.homeTeam)}
        </Link>
        <span className="flex shrink-0 items-center gap-1.5">
          <WeatherBadge
            weatherType={game.weatherType}
            windSpeedMph={game.windSpeedMph}
            temperatureF={game.temperatureF}
          />
          {finished ? (
            <span className="eyebrow font-bold text-[var(--ink-mute)]">
              FINAL {game.awayScore}-{game.homeScore}
            </span>
          ) : (
            <span className="eyebrow text-[var(--ink-mute)]">{game.gameday}</span>
          )}
        </span>
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
