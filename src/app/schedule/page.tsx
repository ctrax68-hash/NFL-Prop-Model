import type { Metadata } from "next";

import { ScheduleGameCard } from "@/components/ScheduleGameCard";
import { Card, EmptyState, SyntheticWarning } from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";
import { fetchPostGameIds } from "@/lib/live/espn";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "NFL Schedule & Player Props This Week",
  description:
    "Every NFL game this week with the model's top prop picks per game, weather and injury context included.",
};

function isFinished(game: SlateGame): boolean {
  return game.homeScore != null && game.awayScore != null;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ season?: string; week?: string }>;
}) {
  const params = await searchParams;
  const season = params.season ? Number(params.season) : undefined;
  const week = params.week ? Number(params.week) : undefined;

  const snapshot = await getSlate(season, week);

  if (!snapshot) {
    return (
      <div className="space-y-4">
        <h1 className="display text-[34px] font-black text-[var(--ink)]">
          SCHEDULE
        </h1>
        <EmptyState
          title="No slate generated yet"
          body="Run the weekly pipeline to pull nflverse data, project every player on the slate, price the props and size the bets."
          command="npx tsx scripts/pipeline.ts --season 2025 --week 12"
        />
      </div>
    );
  }

  const rows = buildBoardRows(snapshot);

  // Cross-checked against ESPN below (`effectivelyFinished`) so a game that
  // finished outside the pipeline's own cron schedule still sinks to the
  // bottom and drops out of "games left" the same day — not just once the
  // slate is next re-graded. `isFinished` itself (persisted-score-only)
  // still governs what each card renders — see `effectivelyFinished`'s
  // doc-comment below.
  const postGameIds = await fetchPostGameIds(snapshot.season, snapshot.week, snapshot.games);
  const effectivelyFinished = (game: SlateGame) =>
    isFinished(game) || postGameIds.has(game.gameId);

  // Games still to be played, soonest first; finished games trail behind them
  // in the same chronological order rather than dropping off the page. Both
  // keys are ISO strings, so a kickoff instant and a bare date sort together.
  const kickoffKey = (game: SlateGame) => game.kickoffAt ?? game.gameday;
  const games = [...snapshot.games].sort((a, b) => {
    const aFinished = effectivelyFinished(a);
    const bFinished = effectivelyFinished(b);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;
    return (
      kickoffKey(a).localeCompare(kickoffKey(b)) || a.gameId.localeCompare(b.gameId)
    );
  });

  const rowsByGame = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = rowsByGame.get(row.gameId);
    if (list) list.push(row);
    else rowsByGame.set(row.gameId, [row]);
  }

  const upcomingCount = games.filter((g) => !effectivelyFinished(g)).length;

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          {snapshot.season} · WK {snapshot.week} · {upcomingCount} of{" "}
          {games.length} games left
        </div>
        <h1 className="display mt-1 text-[28px] font-black text-[var(--ink)] sm:text-[52px]">
          SCHEDULE
        </h1>
        <p className="mt-1 hidden text-xs text-[var(--ink-dim)] sm:block">
          Every game this week, soonest first — the model&apos;s top picks per
          game, with everything else a tap away. Final games sink to the
          bottom.
        </p>
      </header>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      {games.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--ink-dim)]">
            No games on this slate.
          </p>
        </Card>
      ) : (
        // Explicit minmax(0,1fr) columns: an implicit `auto` column grows to
        // the widest card's min-content, so one long player name in a preview
        // row (a nowrap line) widened every card past the phone's viewport
        // and clipped the edge badges.
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {games.map((game) => {
            const finished = isFinished(game);
            const picks = (rowsByGame.get(game.gameId) ?? [])
              .slice()
              .sort((a, b) => {
                if (a.isRecommended !== b.isRecommended) {
                  return a.isRecommended ? -1 : 1;
                }
                return b.bestEdge - a.bestEdge;
              });

            return (
              <ScheduleGameCard
                key={game.gameId}
                game={game}
                picks={picks}
                finished={finished}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
