import { Card, EmptyState, SectionHeading, SyntheticWarning } from "@/components/ui";
import { PickRow } from "@/components/PickRow";
import { buildBoardRows, getSlate } from "@/lib/data";
import { teamLabel } from "@/lib/format";

export const dynamic = "force-dynamic";

const PREVIEW_COUNT = 50;

export default async function EdgesPage({
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
          EDGES
        </h1>
        <EmptyState
          title="No slate generated yet"
          body="Run the weekly pipeline to pull nflverse data, project every player on the slate, price the props and size the bets."
          command="npx tsx scripts/pipeline.ts --season 2025 --week 12"
        />
      </div>
    );
  }

  // Dimmed, not dropped — same rule Schedule uses for a settled game, so the
  // top row here always matches Schedule's single highest-edge row rather
  // than disagreeing once every game on the slate has gone final.
  const finishedGameIds = new Set(
    snapshot.games
      .filter((g) => g.homeScore != null && g.awayScore != null)
      .map((g) => g.gameId),
  );
  const rows = buildBoardRows(snapshot);
  const preview = rows.slice(0, PREVIEW_COUNT);

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          {snapshot.season} · WK {snapshot.week} · {rows.length} priced markets
        </div>
        <h1 className="display mt-1 text-[28px] font-black text-[var(--ink)] sm:text-[52px]">
          EDGES
        </h1>
        <p className="mt-1 hidden text-xs text-[var(--ink-dim)] sm:block">
          Every priced market on the slate, ranked by the model&apos;s edge over
          the book&apos;s de-vigged fair price — highest edge first, across
          every game.
        </p>
      </header>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      {preview.length === 0 ? (
        <Card className="p-4">
          <p className="text-sm text-[var(--ink-dim)]">
            No priced props left to bet on this slate.
          </p>
        </Card>
      ) : (
        <Card className="p-4">
          <SectionHeading
            title="Biggest edges"
            hint={`Top ${preview.length} of ${rows.length} markets`}
          />
          <div className="space-y-1.5">
            {preview.map((row) => (
              <PickRow
                key={row.propId}
                row={row}
                subtitle={`${teamLabel(row.teamId)} ${row.opponentLabel}`}
                finished={finishedGameIds.has(row.gameId)}
              />
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
