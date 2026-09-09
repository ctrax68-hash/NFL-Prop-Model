import type { Metadata } from "next";

import { ScheduleGameCard } from "@/components/ScheduleGameCard";
import { Card, EmptyState, SyntheticWarning } from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import type { BoardRow } from "@/lib/data";
import type { SlateGame } from "@/lib/pipeline/types";

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

  // Games still to be played, soonest first; finished games trail behind them
  // in the same chronological order rather than dropping off the page.
  const games = [...snapshot.games].sort((a, b) => {
    const aFinished = isFinished(a);
    const bFinished = isFinished(b);
    if (aFinished !== bFinished) return aFinished ? 1 : -1;
    return a.gameday === b.gameday
      ? a.gameId.localeCompare(b.gameId)
      : a.gameday.localeCompare(b.gameday);
  });

  const rowsByGame = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = rowsByGame.get(row.gameId);
    if (list) list.push(row);
    else rowsByGame.set(row.gameId, [row]);
  }

  const upcomingCount = games.filter((g) => !isFinished(g)).length;

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
        <div className="grid gap-3 sm:grid-cols-2">
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
