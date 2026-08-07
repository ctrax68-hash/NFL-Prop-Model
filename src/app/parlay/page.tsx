import {
  Card,
  EdgeBadge,
  EmptyState,
  SectionHeading,
  SyntheticWarning,
  WarningCard,
} from "@/components/ui";
import { getSlate } from "@/lib/data";
import { buildParlayLadder, type ParlayLeg, type ParlayRung } from "@/lib/parlay";
import { unitsToStake } from "@/lib/engine/kelly";
import type { EngineConfig } from "@/lib/engine/config";
import {
  PROP_LABELS,
  formatCurrency,
  formatOdds,
  formatPercent,
  formatSignedPercent,
  formatUnits,
  sideLabel,
} from "@/lib/format";

export const dynamic = "force-dynamic";

function LegRow({ leg, rank }: { leg: ParlayLeg; rank: number }) {
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
      <div className="numeric grid size-7 shrink-0 place-items-center rounded-full bg-[var(--obsidian-3)] text-[11px] font-bold text-[var(--ink-dim)]">
        {rank}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">
          {leg.playerName}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
          {leg.teamId} · {sideLabel(leg.side)} {leg.lineValue}{" "}
          {PROP_LABELS[leg.propType]}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="numeric text-sm font-bold text-[var(--ink)]">
          {formatOdds(leg.oddsAmerican)}
        </p>
        <EdgeBadge edge={leg.edge} className="mt-1" />
      </div>
    </div>
  );
}

function LadderRow({
  rung,
  bankroll,
  config,
}: {
  rung: ParlayRung;
  bankroll: number;
  config: EngineConfig;
}) {
  const stake = unitsToStake(rung.kelly.recommendedUnits, bankroll, config);
  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] px-4 py-3 last:border-b-0">
      <div className="numeric grid size-9 shrink-0 place-items-center rounded-full bg-[var(--obsidian-3)] text-sm font-black text-[var(--gold)]">
        {rung.legCount}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-[var(--ink)]">
          {rung.legCount === 1 ? "Straight" : `${rung.legCount}-leg parlay`}
        </p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
          win {formatPercent(rung.probability, rung.legCount > 4 ? 2 : 1)} · ev{" "}
          <span
            className={
              rung.ev > 0 ? "text-[var(--mint)]" : "text-[var(--ink-mute)]"
            }
          >
            {formatSignedPercent(rung.ev)}
          </span>
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="numeric text-base font-black text-[var(--gold)]">
          {formatOdds(Math.round(rung.americanOdds))}
        </p>
        <p className="numeric mt-0.5 text-[11px] text-[var(--ink-mute)]">
          {rung.kelly.recommendedUnits > 0
            ? `${formatUnits(rung.kelly.recommendedUnits)} · ${formatCurrency(stake)}`
            : "below stake floor"}
        </p>
      </div>
    </div>
  );
}

export default async function ParlayPage({
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

  const ladder = buildParlayLadder(snapshot, snapshot.config);

  if (ladder.length === 0) {
    return (
      <div className="space-y-4">
        <header className="pt-1">
          <div className="eyebrow text-[var(--ink-dim)]">
            {snapshot.season} · WK {snapshot.week}
          </div>
          <h1 className="display mt-1 text-[28px] font-black sm:text-[52px]">
            PARLAY
          </h1>
        </header>
        <EmptyState
          title="No recommended props this week"
          body="The model found nothing it liked at the required edge, so there is no pool to build a parlay ladder from."
        />
      </div>
    );
  }

  // The last rung is the fullest — every earlier rung is its top-N prefix — so
  // the pool only needs listing once, in the rank order the ladder used.
  const pool = ladder[ladder.length - 1].legs;

  return (
    <div className="space-y-4">
      <header className="pt-1">
        <div className="eyebrow text-[var(--ink-dim)]">
          {snapshot.season} · WK {snapshot.week} · {pool.length} eligible legs
        </div>
        <h1 className="display mt-1 text-[28px] font-black sm:text-[52px]">
          PARLAY
        </h1>
        <p className="mt-1 hidden text-xs text-[var(--ink-dim)] sm:block">
          Best {ladder.length}-leg ladder, ranked from the week&apos;s own
          recommendations — one leg per game, ordered by expected value.
        </p>
      </header>

      {!snapshot.propsAreReal ? (
        <SyntheticWarning provider={snapshot.propsProvider} />
      ) : null}

      <WarningCard title="Legs are assumed independent — and that held up when measured.">
        A parlay&apos;s odds and win probability shown here are the product of
        each leg&apos;s own win probability, which is only correct if the legs
        don&apos;t influence each other. Same-game correlation is ruled out by
        construction — every leg here comes from a different game. Cross-game
        correlation was measured directly: standardized residuals (actual vs.
        projected, in sigma units) for props in different games came out at
        0.0004 correlation across ~64,500 graded props over 107 weeks
        (2020-2025), with a 95% confidence interval of [-0.0006, 0.0014] —
        indistinguishable from zero. A single week with a shared weather
        system or a slate-wide model miss isn&apos;t ruled out by an average
        this close to zero, so treat the longer parlays with some caution
        regardless.
      </WarningCard>

      <div>
        <SectionHeading
          title="Ladder"
          hint="Same pool of legs at every length — 1 leg through the full board."
        />
        <Card className="overflow-hidden">
          {ladder.map((rung) => (
            <LadderRow
              key={rung.legCount}
              rung={rung}
              bankroll={snapshot.bankroll}
              config={snapshot.config}
            />
          ))}
        </Card>
      </div>

      <div>
        <SectionHeading
          title="Leg pool"
          hint="Ranked by expected value — rank 1 is in every rung above, rank 8 only in the full parlay."
        />
        <Card className="overflow-hidden">
          {pool.map((leg, index) => (
            <LegRow key={leg.propId} leg={leg} rank={index + 1} />
          ))}
        </Card>
      </div>
    </div>
  );
}
