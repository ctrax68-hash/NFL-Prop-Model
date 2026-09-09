import Link from "next/link";

import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";
import { PROP_SHORT, formatOdds, teamLabel } from "@/lib/format";
import { Card, EdgeBadge, SectionHeading } from "./ui";
import { PlayerAvatar } from "./PlayerAvatar";

const PICKS_PER_GAME = 5;

/** UTC-midnight "YYYY-MM-DD", matching how `gameday` is stored (date only, no time). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Just today's games, each with its handful of best props.
 *
 * The full board lists every prop across every game in the week — useful for
 * browsing, useless the morning of a single Thursday-night game when the rest
 * of the slate is five days out. This cuts straight to what's actually
 * kicking off today, so on a one-game day it shows exactly one game.
 */
export function TodaysBestProps({
  games,
  rows,
}: {
  games: readonly SlateGame[];
  rows: readonly BoardRow[];
}) {
  const today = todayIso();
  const todaysGames = games.filter((game) => game.gameday === today);
  if (todaysGames.length === 0) return null;

  const rowsByGame = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = rowsByGame.get(row.gameId);
    if (list) list.push(row);
    else rowsByGame.set(row.gameId, [row]);
  }

  return (
    <div>
      <SectionHeading
        title="Today's Best Props"
        hint={
          todaysGames.length === 1
            ? "The one game kicking off today — everything else on the board is later this week."
            : "Just the games kicking off today, ranked by the model's strongest picks."
        }
      />
      <div className="grid gap-3 sm:grid-cols-2">
        {todaysGames.map((game) => {
          const picks = (rowsByGame.get(game.gameId) ?? [])
            .slice()
            .sort((a, b) => {
              if (a.isRecommended !== b.isRecommended) {
                return a.isRecommended ? -1 : 1;
              }
              return b.bestEdge - a.bestEdge;
            })
            .slice(0, PICKS_PER_GAME);

          return (
            <Card key={game.gameId} className="p-4">
              <div className="mb-3 flex items-baseline justify-between">
                <span className="text-sm font-bold text-[var(--ink)]">
                  {teamLabel(game.awayTeam)}{" "}
                  <span className="text-[var(--ink-mute)]">@</span>{" "}
                  {teamLabel(game.homeTeam)}
                </span>
                <span className="eyebrow text-[var(--ink-mute)]">
                  {game.gameday}
                </span>
              </div>

              {picks.length === 0 ? (
                <p className="text-xs text-[var(--ink-mute)]">
                  No priced props for this game yet.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {picks.map((row) => (
                    <Link
                      key={row.propId}
                      href={`/prop/${encodeURIComponent(row.propId)}`}
                      className="tap flex min-h-[48px] items-center gap-2.5 rounded-[var(--radius-sm)] border border-[var(--border)] bg-[rgba(32,26,36,0.5)] px-2.5 py-1.5 transition-colors hover:border-[var(--bronze)]"
                    >
                      <PlayerAvatar
                        url={row.headshotUrl}
                        name={row.playerName}
                        size={32}
                      />
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
                            row.bestSide === "over"
                              ? row.oddsOverAmerican
                              : row.oddsUnderAmerican,
                          )}
                        </span>
                      </span>
                      <EdgeBadge edge={row.bestEdge} className="shrink-0" />
                    </Link>
                  ))}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
