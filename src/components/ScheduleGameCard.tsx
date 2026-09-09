"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import clsx from "clsx";

import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";
import { teamLabel } from "@/lib/format";
import { normaliseName } from "@/lib/text";
import { gameSlug } from "@/lib/seo";
import { useLiveGame } from "@/lib/live/useLiveGame";
import { Card, WeatherBadge } from "./ui";
import { Kickoff } from "./Kickoff";
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
 *
 * While a game is actually in progress, the header swaps the kickoff time for
 * a live score (polled from ESPN — see `src/lib/live/espn.ts`) and each pick
 * row shows that player's current total for the stat next to the line. This
 * is a scoreboard, not a second opinion: nothing it shows ever changes a
 * projection, a price or a recommendation.
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

  const live = useLiveGame({
    gameId: game.gameId,
    kickoffAt: game.kickoffAt ?? null,
    finished,
  });
  const inProgress = !finished && live != null && live.game.status !== "pre";

  const liveByPlayer = useMemo(() => {
    if (!live) return null;
    const map = new Map<string, (typeof live.players)[number]>();
    for (const player of live.players) map.set(player.key, player);
    return map;
  }, [live]);

  const liveValueFor = (row: BoardRow): number | null => {
    if (!inProgress || !liveByPlayer) return null;
    return liveByPlayer.get(normaliseName(row.playerName))?.stats[row.propType] ?? null;
  };

  const preview = picks.slice(0, PREVIEW_COUNT);
  const rest = picks.slice(PREVIEW_COUNT);

  return (
    <Card className={clsx("min-w-0 p-4", finished && "opacity-55")}>
      <div className="mb-3">
        <div className="flex items-baseline justify-between gap-2">
          <Link
            href={`/games/${gameSlug(game.gameId)}`}
            className="min-w-0 text-sm font-bold text-[var(--ink)] transition-colors hover:text-[var(--gold)]"
          >
            {teamLabel(game.awayTeam)}{" "}
            <span className="text-[var(--ink-mute)]">@</span>{" "}
            {teamLabel(game.homeTeam)}
          </Link>
          {finished ? (
            <span className="eyebrow shrink-0 font-bold text-[var(--ink-mute)]">
              FINAL {game.awayScore}-{game.homeScore}
            </span>
          ) : inProgress ? (
            <span className="numeric shrink-0 text-right text-xs font-bold text-[var(--ink)]">
              {teamLabel(game.awayTeam)} {live!.game.awayScore ?? 0} &ndash;{" "}
              {teamLabel(game.homeTeam)} {live!.game.homeScore ?? 0}
            </span>
          ) : (
            <Kickoff
              kickoffAt={game.kickoffAt ?? null}
              gameday={game.gameday}
              className="eyebrow shrink-0 text-right text-[var(--ink-mute)]"
            />
          )}
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <WeatherBadge
            weatherType={game.weatherType}
            windSpeedMph={game.windSpeedMph}
            temperatureF={game.temperatureF}
          />
          {finished ? (
            <Kickoff
              kickoffAt={game.kickoffAt ?? null}
              gameday={game.gameday}
              className="eyebrow text-[var(--ink-mute)]"
            />
          ) : inProgress ? (
            <span className="eyebrow flex items-center gap-1 text-[var(--mint)]">
              <span
                aria-hidden
                className="pulse-dot inline-block size-1.5 rounded-full bg-[var(--mint)]"
              />
              {live!.game.detail || "Live"}
            </span>
          ) : null}
        </div>
      </div>

      {preview.length === 0 ? (
        <p className="text-xs text-[var(--ink-mute)]">
          No priced props for this game yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {preview.map((row) => (
            <PickRow key={row.propId} row={row} liveValue={liveValueFor(row)} />
          ))}

          {expanded
            ? rest.map((row) => (
                <PickRow key={row.propId} row={row} liveValue={liveValueFor(row)} />
              ))
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
