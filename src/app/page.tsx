import { PropBoard } from "@/components/PropBoard";
import {
  Card,
  EmptyState,
  SectionHeading,
  Stat,
  SyntheticWarning,
} from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";
import { formatPercent, formatUnits } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BoardPage({
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
      <EmptyState
        title="No slate generated yet"
        body="Run the weekly pipeline to pull nflverse data, project every player on the slate, price the props and size the bets."
        command="npx tsx scripts/pipeline.ts --season 2025 --week 12"
      />
    );
  }

  const rows = buildBoardRows(snapshot);
  const totalUnits = snapshot.recommendations.reduce(
    (sum, bet) => sum + bet.kelly.recommendedUnits,
    0,
  );
  const averageEdge =
    snapshot.recommendations.length > 0
      ? snapshot.recommendations.reduce((sum, bet) => sum + bet.edge, 0) /
        snapshot.recommendations.length
      : 0;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold tracking-tight">
          {snapshot.season} · Week {snapshot.week}
        </h1>
        <p className="mt-0.5 text-xs text-[var(--text-muted)]">
          {snapshot.games.length} games · {snapshot.evaluations.length} props
          priced · model v{snapshot.configVersion}
        </p>
      </div>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="Recommended" value={String(snapshot.recommendations.length)} />
        <Stat label="Exposure" value={formatUnits(totalUnits)} />
        <Stat
          label="Avg edge"
          value={formatPercent(averageEdge)}
          tone={averageEdge > 0 ? "positive" : "neutral"}
        />
        <Stat label="Players" value={String(snapshot.players.length)} />
      </div>

      <div>
        <SectionHeading
          title="Prop board"
          hint="Tap a price to add it to the slip. Highlighted prices are the model's picks."
        />
        <PropBoard rows={rows} season={snapshot.season} week={snapshot.week} />
      </div>

      <Card className="px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[var(--text-muted)]">
          Edges compare the model&apos;s probability against the book&apos;s
          de-vigged fair price, not the raw implied odds — comparing against raw
          odds understates every edge by roughly half the vig. Stakes are quarter
          Kelly, capped at {snapshot.config.kelly.maxUnits}u per bet, where one
          unit is 1% of bankroll.
        </p>
      </Card>
    </div>
  );
}
