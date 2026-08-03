import {
  BucketBars,
  CalibrationChart,
  EquityCurve,
} from "@/components/charts";
import { Card, EmptyState, SectionHeading, Stat } from "@/components/ui";
import { getBacktest } from "@/lib/data";
import { formatPercent, formatSignedUnits } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function BacktestPage() {
  const result = await getBacktest();

  if (!result) {
    return (
      <div className="space-y-4">
        <h1 className="display text-[34px] font-black text-[var(--ink)]">BACKTEST</h1>
        <EmptyState
          title="No backtest yet"
          body="Replay past weeks to grade what the model would have recommended, then come back for ROI, hit rate by edge bucket and — the measurement that actually matters — calibration."
          command="npx tsx scripts/backtest.ts --seasons 2023-2024 --out .data/backtest.json"
        />
      </div>
    );
  }

  const { summary, calibration } = result;

  const totalN = calibration.reduce((sum, bin) => sum + bin.n, 0);
  const meanCalibrationError =
    totalN > 0
      ? calibration.reduce(
          (sum, bin) => sum + Math.abs(bin.realized - bin.predicted) * bin.n,
          0,
        ) / totalN
      : 0;

  // Sampling the equity curve keeps the SVG light without changing its shape.
  const step = Math.max(1, Math.floor(result.equityCurve.length / 400));
  const equityPoints = result.equityCurve.filter(
    (_, index) => index % step === 0 || index === result.equityCurve.length - 1,
  );

  return (
    <div className="space-y-4">
      <div>
        <div className="eyebrow">Historical Replay</div>
        <h1 className="display mt-1 text-[34px] font-black text-[var(--ink)] sm:text-[42px]">
          BACKTEST
        </h1>
        <p className="mt-1 text-xs text-[var(--ink-mute)]">
          {result.seasons.join(", ")} · {result.weeksRun} weeks replayed ·{" "}
          {summary.bets.toLocaleString()} bets · {result.voidedProps.toLocaleString()} props
          voided
        </p>
      </div>

      {/* The most important thing on this page: what these numbers do and do
          not establish. */}
      <Card className="p-4">
        <h2 className="text-sm font-black tracking-wide text-[var(--amber)] uppercase">
          How to read this page
        </h2>
        <div className="mt-2 space-y-2 text-xs leading-relaxed text-[var(--ink-dim)]">
          {!result.propsAreReal ? (
            <p>
              <span className="font-semibold text-[var(--ink)]">
                ROI here is circular and proves nothing.
              </span>{" "}
              These lines came from the simulated book, which derives them from
              this model&apos;s own projections — so the &ldquo;edge&rdquo; being
              measured is just the simulation&apos;s noise read back. A real
              sportsbook does not set its lines from our numbers.
            </p>
          ) : null}
          <p>
            <span className="font-semibold text-[var(--ink)]">
              Calibration is the real test,
            </span>{" "}
            and it is not circular: it is scored against actual NFL results. It
            asks whether props the model priced at 60% went over about 60% of the
            time. A mis-specified distribution shows up here immediately, no
            matter where the lines came from.
          </p>
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat
          label="Calibration error"
          value={`${(meanCalibrationError * 100).toFixed(2)} pp`}
          numericValue={meanCalibrationError * 100}
          decimals={2}
          suffix=" pp"
          tone={meanCalibrationError < 0.03 ? "mint" : "gold"}
          hint={`${totalN.toLocaleString()} props scored`}
        />
        <Stat label="Bets" value={summary.bets.toLocaleString()} numericValue={summary.bets} tone="plain" />
        <Stat
          label="Hit rate"
          value={formatPercent(summary.hitRate)}
          numericValue={summary.hitRate * 100}
          decimals={1}
          suffix="%"
          hint={`${summary.wins}W / ${summary.losses}L / ${summary.pushes}P`}
        />
        <Stat
          label="P/L"
          value={formatSignedUnits(summary.unitsProfit)}
          tone={summary.unitsProfit > 0 ? "mint" : "ember"}
          hint={`${summary.unitsStaked.toFixed(0)}u risked${result.propsAreReal ? "" : " · simulated"}`}
        />
      </div>

      <Card className="p-4">
        <SectionHeading
          title="Calibration"
          hint="Predicted probability against what actually happened. Scored on every priced prop, not just the ones bet — restricting it to bets would only describe the tail we selected."
        />
        <div className="grid gap-4 md:grid-cols-[minmax(0,340px)_1fr] md:items-start">
          <CalibrationChart bins={calibration} />
          <div className="scroll-x">
            <table className="w-full min-w-[300px] text-xs">
              <thead>
                <tr className="text-left text-[var(--ink-mute)]">
                  <th className="py-1.5 font-medium">Bin</th>
                  <th className="py-1.5 text-right font-medium">Predicted</th>
                  <th className="py-1.5 text-right font-medium">Realised</th>
                  <th className="py-1.5 text-right font-medium">Error</th>
                  <th className="py-1.5 text-right font-medium">n</th>
                </tr>
              </thead>
              <tbody>
                {calibration.map((bin) => {
                  const error = bin.realized - bin.predicted;
                  return (
                    <tr key={bin.binLow} className="border-t">
                      <td className="numeric py-1.5">
                        {bin.binLow.toFixed(1)}–{bin.binHigh.toFixed(1)}
                      </td>
                      <td className="numeric py-1.5 text-right">
                        {bin.predicted.toFixed(3)}
                      </td>
                      <td className="numeric py-1.5 text-right">
                        {bin.realized.toFixed(3)}
                      </td>
                      <td
                        className={
                          Math.abs(error) > 0.05
                            ? "numeric py-1.5 text-right text-[var(--amber)]"
                            : "numeric py-1.5 text-right text-[var(--ink-dim)]"
                        }
                      >
                        {error > 0 ? "+" : ""}
                        {error.toFixed(3)}
                      </td>
                      <td className="numeric py-1.5 text-right text-[var(--ink-mute)]">
                        {bin.n.toLocaleString()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </Card>

      {equityPoints.length > 1 ? (
        <Card className="p-4">
          <SectionHeading
            title="Cumulative profit"
            hint={
              result.propsAreReal
                ? "Units won or lost across the replay, in order."
                : "Shape only — against simulated lines the level is meaningless."
            }
          />
          <EquityCurve points={equityPoints} />
        </Card>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-4">
          <SectionHeading
            title="Hit rate by edge bucket"
            hint="A working model should hit more often where it claimed more edge."
          />
          <BucketBars
            buckets={result.byEdgeBucket.filter((bucket) => bucket.bets > 0)}
            valueOf={(bucket) =>
              (result.byEdgeBucket.find((b) => b.label === bucket.label)
                ?.hitRate ?? 0)
            }
            format={(value) => formatPercent(value)}
            label="Hit rate"
          />
        </Card>

        <Card className="p-4">
          <SectionHeading title="By prop type" hint="Hit rate across markets." />
          <BucketBars
            buckets={result.byPropType}
            valueOf={(bucket) =>
              result.byPropType.find((b) => b.label === bucket.label)?.hitRate ??
              0
            }
            format={(value) => formatPercent(value)}
            label="Hit rate"
          />
        </Card>
      </div>
    </div>
  );
}
