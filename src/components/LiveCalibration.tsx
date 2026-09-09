import clsx from "clsx";

import type {
  CalibrationMonitor,
  DriftReading,
  DriftStatus,
} from "@/lib/calibration/monitor";
import type { SigmaRefitReport } from "@/lib/pipeline/sigmaRefit";
import { PROP_SHORT, formatPercent } from "@/lib/format";
import { Card, SectionHeading } from "./ui";

const STATUS: Record<DriftStatus, { label: string; className: string; title: string }> = {
  ok: {
    label: "IN BAND",
    className: "bg-[rgba(47,227,155,0.12)] text-[var(--mint)]",
    title: "Within two standard errors of what the backtest achieved on this slice.",
  },
  watch: {
    label: "WATCH",
    className: "bg-[rgba(255,176,32,0.14)] text-[var(--amber)]",
    title: "Two to three standard errors from the backtest — could still be noise; worth watching.",
  },
  drift: {
    label: "DRIFT",
    className: "bg-[rgba(255,90,90,0.14)] text-[var(--ember)]",
    title: "Three or more standard errors from the backtest — sampling noise no longer explains it.",
  },
  insufficient: {
    label: "THIN",
    className: "bg-[var(--obsidian-3)] text-[var(--ink-mute)]",
    title: "Too few graded props to judge yet.",
  },
};

function StatusPill({ status }: { status: DriftStatus }) {
  const s = STATUS[status];
  return (
    <span
      className={clsx(
        "numeric inline-flex shrink-0 items-center rounded-[var(--radius-pill)] px-2 py-0.5 text-[10px] font-bold tracking-wide",
        s.className,
      )}
      title={s.title}
    >
      {s.label}
    </span>
  );
}

const signedPp = (value: number) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}pp`;

function Reading({ label, reading, kind }: { label: string; reading: DriftReading; kind: "props" | "bets" }) {
  return (
    <div className="flex items-center justify-between gap-2 py-1.5">
      <span className="min-w-0">
        <span className="block text-[13px] font-semibold text-[var(--ink)]">{label}</span>
        <span className="numeric block text-[11px] text-[var(--ink-dim)]">
          {kind === "props" ? (
            <>
              n={reading.n} · priced {formatPercent(reading.predicted, 0)} over · realised{" "}
              {formatPercent(reading.realized, 0)} · gap {signedPp(reading.biasPp)}
              {reading.referenceBiasPp != null ? ` (backtest ${signedPp(reading.referenceBiasPp)})` : ""}
            </>
          ) : (
            <>
              bets {reading.n} · hit {formatPercent(reading.realized, 0)} vs backtest{" "}
              {formatPercent(reading.predicted, 0)}
            </>
          )}
          {reading.z != null ? ` · z ${reading.z.toFixed(1)}` : ""}
        </span>
      </span>
      <StatusPill status={reading.status} />
    </div>
  );
}

/**
 * The running check that this season still looks like the backtest — per
 * prop type, over the weeks graded so far. Computed by the pipeline and
 * stored on the latest snapshot; see `src/lib/calibration/monitor.ts`.
 */
export function LiveCalibration({
  monitor,
  sigmaRefit,
}: {
  monitor: CalibrationMonitor | undefined;
  sigmaRefit: SigmaRefitReport | undefined;
}) {
  return (
    <Card className="p-4" hud>
      <SectionHeading
        title="This season, live"
        hint="Weeks already played this season, graded and compared with the backtest above. A tripwire, not an autopilot — nothing here changes the model by itself."
      />

      {!monitor ? (
        <p className="text-xs text-[var(--ink-mute)]">
          Appears once the pipeline has graded a completed week — the first
          check lands after Week 1&apos;s stat lines post.
        </p>
      ) : (
        <>
          <p className="numeric mb-2 text-[11px] text-[var(--ink-mute)]">
            {monitor.asOf.season} WK {monitor.weeks.map((w) => w.week).join(", ")} graded ·{" "}
            {monitor.gradedProps.toLocaleString()} props · {monitor.gradedBets.toLocaleString()}{" "}
            recommended bets
            {monitor.reference
              ? ` · reference: backtest ${monitor.reference.seasons[0]}–${monitor.reference.seasons[monitor.reference.seasons.length - 1]}`
              : " · no backtest reference"}
          </p>
          <div className="divide-y divide-[var(--border)]">
            <Reading label="All prop types" reading={monitor.overall} kind="props" />
            {monitor.byPropType.map((entry) => (
              <div key={entry.propType}>
                <Reading label={PROP_SHORT[entry.propType]} reading={entry.calibration} kind="props" />
                {entry.bets.n > 0 ? (
                  <div className="-mt-1 pb-1.5 pl-3">
                    <Reading label="" reading={entry.bets} kind="bets" />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      )}

      {sigmaRefit ? (
        <p className="mt-3 text-[11px] text-[var(--ink-mute)]">
          Sigma models for this slate were re-fitted from every game before{" "}
          {sigmaRefit.asOf.season} WK {sigmaRefit.asOf.week}
          {(() => {
            const held = sigmaRefit.entries.filter((e) => e.clamped).length;
            const kept = sigmaRefit.entries.filter((e) => !e.fitted).length;
            const notes = [
              held > 0 ? `${held} held inside the ±${Math.round((sigmaRefit.maxRatio - 1) * 100)}% band` : null,
              kept > 0 ? `${kept} kept the shipped fit for lack of sample` : null,
            ].filter(Boolean);
            return notes.length > 0 ? ` (${notes.join("; ")})` : "";
          })()}
          .
        </p>
      ) : null}
    </Card>
  );
}
