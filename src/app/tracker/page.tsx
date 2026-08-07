import clsx from "clsx";

import { ExampleBetCard } from "@/components/ExampleBetCard";
import { SettleButton } from "@/components/SettleButton";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { listBets } from "@/lib/data";
import type { PlacedBet } from "@/lib/db/store";
import {
  PROP_LABELS,
  formatCurrency,
  formatOdds,
  formatPercent,
  formatSignedUnits,
  formatUnits,
  sideLabel,
} from "@/lib/format";

export const dynamic = "force-dynamic";

const STATUS_STYLES: Record<PlacedBet["status"], string> = {
  pending: "bg-[var(--obsidian-3)] text-[var(--gold)] ring-1 ring-[rgba(255,194,75,0.3)]",
  won: "bg-[rgba(53,227,159,0.12)] text-[var(--mint)]",
  lost: "bg-[rgba(255,90,110,0.12)] text-[var(--ember)]",
  push: "bg-[var(--obsidian-3)] text-[var(--ink-dim)]",
  void: "bg-[var(--obsidian-3)] text-[var(--ink-mute)]",
};

function BetCard({ bet }: { bet: PlacedBet }) {
  return (
    <div className="flex items-start gap-3 border-b px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[var(--ink)]">{bet.playerName}</p>
        <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
          {sideLabel(bet.side)} {bet.lineValue} {PROP_LABELS[bet.propType]} ·{" "}
          <span className="numeric">{formatOdds(bet.oddsAmerican)}</span> ·{" "}
          {bet.season} wk {bet.week}
        </p>
        <p className="mt-1 text-[11px] text-[var(--ink-mute)]">
          <span className="numeric">{formatUnits(bet.units)}</span> ·{" "}
          <span className="numeric">{formatCurrency(bet.stake)}</span> · edge{" "}
          <span className="numeric">{formatPercent(bet.edge)}</span>
          {bet.actualValue != null ? (
            <>
              {" · actual "}
              <span className="numeric font-medium text-[var(--ink-dim)]">
                {bet.actualValue}
              </span>
            </>
          ) : null}
        </p>
      </div>

      <div className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={clsx(
            "rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold uppercase",
            STATUS_STYLES[bet.status],
          )}
        >
          {bet.status}
        </span>
        {bet.profitUnits != null ? (
          <span
            className={clsx(
              "display text-base font-black",
              bet.profitUnits > 0
                ? "text-[var(--mint)]"
                : bet.profitUnits < 0
                  ? "text-[var(--ember)]"
                  : "text-[var(--ink-mute)]",
            )}
          >
            {formatSignedUnits(bet.profitUnits)}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export default async function TrackerPage() {
  const bets = await listBets();

  if (bets.length === 0) {
    return (
      <div className="space-y-4">
        <h1 className="display text-[34px] font-black text-[var(--ink)]">TRACKER</h1>
        <EmptyState
          title="No bets logged yet"
          body="Add prices to the bet slip from the board, then log them here to track results, P/L and closing line value."
        />
        <div>
          <p className="mb-2 text-[11px] tracking-[0.08em] text-[var(--ink-mute)] uppercase">
            What a logged bet looks like
          </p>
          <ExampleBetCard />
        </div>
      </div>
    );
  }

  const pending = bets.filter((bet) => bet.status === "pending");
  const settled = bets.filter((bet) => bet.status !== "pending");

  const decisive = settled.filter(
    (bet) => bet.status === "won" || bet.status === "lost",
  );
  const wins = settled.filter((bet) => bet.status === "won").length;
  const profitUnits = settled.reduce(
    (sum, bet) => sum + (bet.profitUnits ?? 0),
    0,
  );
  // Pushes and voids return the stake, so they are not risked capital.
  const stakedUnits = decisive.reduce((sum, bet) => sum + bet.units, 0);
  const roi = stakedUnits > 0 ? profitUnits / stakedUnits : 0;
  const openUnits = pending.reduce((sum, bet) => sum + bet.units, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <div className="eyebrow">Position Log</div>
          <h1 className="display mt-1 text-[34px] font-black text-[var(--ink)] sm:text-[42px]">
            TRACKER
          </h1>
          <p className="mt-1 text-xs text-[var(--ink-mute)]">
            {bets.length} logged · {pending.length} open
          </p>
        </div>
        <SettleButton />
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat
          label="P/L"
          value={formatSignedUnits(profitUnits)}
          numericValue={profitUnits}
          decimals={2}
          prefix={profitUnits > 0 ? "+" : ""}
          suffix="u"
          tone={profitUnits > 0 ? "mint" : profitUnits < 0 ? "ember" : "plain"}
        />
        <Stat
          label="ROI"
          value={decisive.length > 0 ? formatPercent(roi, 2) : "—"}
          tone={roi > 0 ? "mint" : roi < 0 ? "ember" : "plain"}
          hint={`${stakedUnits.toFixed(1)}u risked`}
        />
        <Stat
          label="Hit rate"
          value={
            decisive.length > 0
              ? formatPercent(wins / decisive.length)
              : "—"
          }
          hint={`${wins}/${decisive.length}`}
        />
        <Stat label="Open" value={formatUnits(openUnits)} />
      </div>

      {pending.length > 0 ? (
        <div>
          <SectionHeading title="Open bets" />
          <Card className="overflow-hidden">
            {pending.map((bet) => (
              <BetCard key={bet.id} bet={bet} />
            ))}
          </Card>
        </div>
      ) : null}

      {settled.length > 0 ? (
        <div>
          <SectionHeading
            title="Settled"
            hint="Props on players who never took the field settle as void, matching how a book refunds them."
          />
          <Card className="overflow-hidden">
            {settled
              .slice()
              .sort((a, b) => (b.settledAt ?? "").localeCompare(a.settledAt ?? ""))
              .map((bet) => (
                <BetCard key={bet.id} bet={bet} />
              ))}
          </Card>
        </div>
      ) : null}
    </div>
  );
}
