import {
  PROP_LABELS,
  formatCurrency,
  formatOdds,
  formatPercent,
  formatSignedUnits,
  formatUnits,
  sideLabel,
} from "@/lib/format";

/**
 * A single hardcoded, illustrative example — not a `PlacedBet`, not read from
 * or written to any store. It exists so a genuinely empty tracker can show
 * what a logged bet looks like without inventing fake history for a
 * single-user tool where "history" means real money.
 */
const EXAMPLE = {
  playerName: "Justin Jefferson",
  side: "over" as const,
  lineValue: 6.5,
  propType: "receptions" as const,
  oddsAmerican: -115,
  season: 2025,
  week: 9,
  units: 1.5,
  stake: 150,
  edge: 0.071,
  actualValue: 8,
  profitUnits: 1.3,
};

export function ExampleBetCard() {
  return (
    <div className="rounded-[var(--radius)] border border-dashed border-[var(--border)] px-4 py-3 opacity-80">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="rounded-[var(--radius-pill)] bg-[var(--obsidian-3)] px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] text-[var(--ink-mute)] uppercase">
              Example
            </span>
          </div>
          <p className="mt-1 truncate text-sm font-semibold text-[var(--ink)]">
            {EXAMPLE.playerName}
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--ink-mute)]">
            {sideLabel(EXAMPLE.side)} {EXAMPLE.lineValue} {PROP_LABELS[EXAMPLE.propType]} ·{" "}
            <span className="numeric">{formatOdds(EXAMPLE.oddsAmerican)}</span> ·{" "}
            {EXAMPLE.season} wk {EXAMPLE.week}
          </p>
          <p className="mt-1 text-[11px] text-[var(--ink-mute)]">
            <span className="numeric">{formatUnits(EXAMPLE.units)}</span> ·{" "}
            <span className="numeric">{formatCurrency(EXAMPLE.stake)}</span> · edge{" "}
            <span className="numeric">{formatPercent(EXAMPLE.edge)}</span>
            {" · actual "}
            <span className="numeric font-medium text-[var(--ink-dim)]">
              {EXAMPLE.actualValue}
            </span>
          </p>
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold text-[var(--ink-mute)] uppercase">
            settled
          </span>
          <span className="display text-base font-black text-[var(--ink-mute)]">
            {formatSignedUnits(EXAMPLE.profitUnits)}
          </span>
        </div>
      </div>
    </div>
  );
}
