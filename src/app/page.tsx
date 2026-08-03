import { PropBoard } from "@/components/PropBoard";
import { Ticker } from "@/components/Ticker";
import {
  Card,
  EmptyState,
  SectionHeading,
  Stat,
  SyntheticWarning,
} from "@/components/ui";
import { buildBoardRows, getSlate } from "@/lib/data";

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
      {/* Ticker sits flush under the nav, breaking the page gutter. */}
      <div className="-mx-3 -mt-4 sm:-mx-4">
        <Ticker rows={rows} />
      </div>

      {/* On a phone the hero is a cost, not a feature: every pixel here is a
          pixel of board the user has to scroll past. The display type and the
          model byline both scale up only once there's room for them. */}
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          Slate · {snapshot.games.length} games · {snapshot.evaluations.length}{" "}
          markets priced
        </div>
        <h1 className="display mt-1 text-[28px] font-black sm:text-[52px]">
          <span className="text-[var(--ink)]">{snapshot.season}</span>
          <span className="mx-2 text-[var(--border-strong)]">/</span>
          <span className="glow-gold text-[var(--gold)]">
            WK {snapshot.week}
          </span>
        </h1>
        <p className="mt-1 hidden text-xs text-[var(--ink-dim)] sm:block">
          Model v{snapshot.configVersion} · quarter-Kelly sizing · edges vs
          de-vigged fair price
        </p>
      </header>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="Model Picks"
          value={String(snapshot.recommendations.length)}
          numericValue={snapshot.recommendations.length}
        />
        <Stat
          label="Exposure"
          value={`${totalUnits.toFixed(2)}u`}
          numericValue={totalUnits}
          decimals={2}
          suffix="u"
        />
        <Stat
          label="Avg Edge"
          value={`${(averageEdge * 100).toFixed(1)}%`}
          numericValue={averageEdge * 100}
          decimals={1}
          suffix="%"
          tone="mint"
        />
        <Stat
          label="Players"
          value={String(snapshot.players.length)}
          numericValue={snapshot.players.length}
          tone="plain"
        />
      </div>

      <div>
        <SectionHeading
          title="Prop Board"
          hint="Tap a price to add it to the slip. Ringed rows are the model's picks."
        />
        <PropBoard rows={rows} season={snapshot.season} week={snapshot.week} />
      </div>

      <Card className="px-4 py-3">
        <p className="text-[11px] leading-relaxed text-[var(--ink-mute)]">
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
