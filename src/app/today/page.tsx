import { DailyGameCard } from "@/components/DailyGameCard";
import { Card, EmptyState, SyntheticWarning } from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import type { BoardRow } from "@/lib/data";

export const dynamic = "force-dynamic";

/** UTC-midnight "YYYY-MM-DD", matching how `gameday` is stored (date only, no time). */
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default async function TodayPage({
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
        <h1 className="display text-[34px] font-black text-[var(--ink)]">TODAY</h1>
        <EmptyState
          title="No slate generated yet"
          body="Run the weekly pipeline to pull nflverse data, project every player on the slate, price the props and size the bets."
          command="npx tsx scripts/pipeline.ts --season 2025 --week 12"
        />
      </div>
    );
  }

  const rows = buildBoardRows(snapshot);
  const today = todayIso();
  const todaysGames = snapshot.games
    .filter((game) => game.gameday === today)
    .sort((a, b) => a.gameId.localeCompare(b.gameId));

  const rowsByGame = new Map<string, BoardRow[]>();
  for (const row of rows) {
    const list = rowsByGame.get(row.gameId);
    if (list) list.push(row);
    else rowsByGame.set(row.gameId, [row]);
  }

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          {today} · {todaysGames.length} game
          {todaysGames.length === 1 ? "" : "s"}
        </div>
        <h1 className="display mt-1 text-[28px] font-black sm:text-[52px] text-[var(--ink)]">
          TODAY
        </h1>
        <p className="mt-1 hidden text-xs text-[var(--ink-dim)] sm:block">
          Just what&apos;s kicking off today — the model&apos;s top picks per
          game, with everything else a tap away.
        </p>
      </header>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      {todaysGames.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--ink-dim)]">
            No games kick off today. Check the board for the rest of the
            week&apos;s slate.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {todaysGames.map((game) => {
            const picks = (rowsByGame.get(game.gameId) ?? [])
              .slice()
              .sort((a, b) => {
                if (a.isRecommended !== b.isRecommended) {
                  return a.isRecommended ? -1 : 1;
                }
                return b.bestEdge - a.bestEdge;
              });

            return <DailyGameCard key={game.gameId} game={game} picks={picks} />;
          })}
        </div>
      )}
    </div>
  );
}
