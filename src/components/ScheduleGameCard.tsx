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
import { PickRow, liveStatus } from "./PickRow";

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
 * The header always carries both the score and the time together, stacked at
 * the top of the card rather than split across two rows: kickoff time before
 * the game, score plus a live clock (polled from ESPN — see
 * `src/lib/live/espn.ts`) once it starts, or FINAL plus the original kickoff
 * once it's over. Each pick row also shows that player's current total for
 * the stat while the game is live, and turns green or red as the total
 * decides the pick (see `PickRow`). Once every recommended pick on the card
 * has a live verdict, a running "N/M hits" tally sits under the FINAL detail
 * line. This is a scoreboard,
 * not a second opinion: nothing it shows ever changes a projection, a price
 * or a recommendation.
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
  // ESPN says it's over but the slate hasn't been graded yet: totals are
  // settled, so unders and unreached overs can be called on the rows.
  const liveFinal = inProgress && live!.game.status === "post";

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

  // How the model's actual plays (not every priced prop — just the ones with
  // a stake) came out, once the live feed has enough to call every one of
  // them. Rows ESPN has no matching stat for don't count either way, same as
  // the per-row display.
  const recommendedTally = useMemo(() => {
    if (!liveFinal) return null;
    let hits = 0;
    let decided = 0;
    for (const row of picks) {
      if (!row.isRecommended) continue;
      const value = liveValueFor(row);
      if (value == null) continue;
      const status = liveStatus(row.bestSide, value, row.lineValue, true);
      decided += 1;
      if (status === "won") hits += 1;
    }
    return decided > 0 ? { hits, decided } : null;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- liveValueFor closes over inProgress/liveByPlayer, both already in this list.
  }, [liveFinal, picks, inProgress, liveByPlayer]);

  const preview = picks.slice(0, PREVIEW_COUNT);
  const rest = picks.slice(PREVIEW_COUNT);

  return (
    <Card className={clsx("min-w-0 p-4", finished && "opacity-55")}>
      <div className="mb-3">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/games/${gameSlug(game.gameId)}`}
            className="min-w-0 text-sm font-bold text-[var(--ink)] transition-colors hover:text-[var(--gold)]"
          >
            {teamLabel(game.awayTeam)}{" "}
            <span className="text-[var(--ink-mute)]">@</span>{" "}
            {teamLabel(game.homeTeam)}
          </Link>
          {/* Score and time always travel together, right here at the top —
              never split off into the weather row below. */}
          <span className="flex shrink-0 flex-col items-end gap-0.5 text-right">
            {finished ? (
              <>
                <span className="eyebrow font-bold text-[var(--ink-mute)]">
                  FINAL {game.awayScore}-{game.homeScore}
                </span>
                <Kickoff
                  kickoffAt={game.kickoffAt ?? null}
                  gameday={game.gameday}
                  className="eyebrow text-[var(--ink-mute)]"
                />
              </>
            ) : inProgress ? (
              <>
                <span className="numeric text-xs font-bold text-[var(--ink)]">
                  {teamLabel(game.awayTeam)} {live!.game.awayScore ?? 0} &ndash;{" "}
                  {teamLabel(game.homeTeam)} {live!.game.homeScore ?? 0}
                </span>
                {liveFinal ? (
                  <>
                    <span className="eyebrow font-bold text-[var(--ink-mute)]">
                      {live!.game.detail || "Final"}
                    </span>
                    {recommendedTally ? (
                      <span
                        className={clsx(
                          "eyebrow numeric font-bold",
                          recommendedTally.hits === recommendedTally.decided
                            ? "text-[var(--mint)]"
                            : recommendedTally.hits === 0
                              ? "text-[var(--ember)]"
                              : "text-[var(--ink-mute)]",
                        )}
                      >
                        {recommendedTally.hits}/{recommendedTally.decided} hits
                      </span>
                    ) : null}
                  </>
                ) : (
                  <span className="eyebrow flex items-center gap-1 text-[var(--mint)]">
                    <span
                      aria-hidden
                      className="pulse-dot inline-block size-1.5 rounded-full bg-[var(--mint)]"
                    />
                    {live!.game.detail || "Live"}
                  </span>
                )}
              </>
            ) : (
              <Kickoff
                kickoffAt={game.kickoffAt ?? null}
                gameday={game.gameday}
                className="eyebrow text-[var(--ink-mute)]"
              />
            )}
          </span>
        </div>
        <div className="mt-1.5 flex items-center gap-1.5">
          <WeatherBadge
            weatherType={game.weatherType}
            windSpeedMph={game.windSpeedMph}
            temperatureF={game.temperatureF}
          />
        </div>
      </div>

      {preview.length === 0 ? (
        <p className="text-xs text-[var(--ink-mute)]">
          No priced props for this game yet.
        </p>
      ) : (
        <div className="space-y-1.5">
          {preview.map((row) => (
            <PickRow
              key={row.propId}
              row={row}
              liveValue={liveValueFor(row)}
              liveFinal={liveFinal}
            />
          ))}

          {expanded
            ? rest.map((row) => (
                <PickRow
                  key={row.propId}
                  row={row}
                  liveValue={liveValueFor(row)}
                  liveFinal={liveFinal}
                />
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
