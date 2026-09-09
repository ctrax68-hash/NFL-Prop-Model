/**
 * The running calibration check.
 *
 * The backtest says what calibration the model achieved over three seasons.
 * This asks whether the weeks graded so far *this* season still look like
 * that, per prop type, and flags the ones that have wandered further than
 * sampling noise explains. It is a tripwire for a human, not an autopilot:
 * nothing here changes a coefficient. The reference band is the backtest's
 * own bias for that prop type; the yardstick is the binomial standard error
 * at the current sample, so a stat with forty graded props can't trip it and
 * one with four hundred can.
 */

import { grade, type BacktestResult } from "../backtest";
import type { PropType } from "../engine/types";
import type { SeasonWeek } from "../ingest/asOf";
import type { SlateSnapshot } from "../pipeline/types";

export type DriftStatus = "ok" | "watch" | "drift" | "insufficient";

/** Fewer graded props than this and the z-score is noise, not a signal. */
export const MONITOR_MIN_PROPS = 50;
export const MONITOR_MIN_BETS = 30;
export const WATCH_Z = 2;
export const DRIFT_Z = 3;

export interface DriftReading {
  n: number;
  /** Mean model probability of the over (or the reference hit rate, for bets). */
  predicted: number;
  realized: number;
  biasPp: number;
  referenceBiasPp: number | null;
  /** Standard-error units between the realised gap and the reference gap. */
  z: number | null;
  status: DriftStatus;
}

export interface PropTypeDrift {
  propType: PropType;
  calibration: DriftReading;
  /** Recommended bets only — the tail actually staked. */
  bets: DriftReading;
}

export interface CalibrationMonitor {
  asOf: SeasonWeek;
  weeks: SeasonWeek[];
  gradedProps: number;
  gradedBets: number;
  overall: DriftReading;
  byPropType: PropTypeDrift[];
  reference: { seasons: number[]; gradedProps: number; bets: number } | null;
}

interface Point {
  propType: PropType;
  prob: number;
  wentOver: boolean;
}

interface Bet {
  propType: PropType;
  won: boolean;
}

function status(z: number | null, n: number, minN: number): DriftStatus {
  if (z == null || n < minN) return "insufficient";
  const a = Math.abs(z);
  if (a >= DRIFT_Z) return "drift";
  if (a >= WATCH_Z) return "watch";
  return "ok";
}

/**
 * Compare a realised rate against its expected rate, allowing for the
 * reference gap the backtest already showed for this slice.
 */
function reading(
  n: number,
  predicted: number,
  realized: number,
  referenceBiasPp: number | null,
  minN: number,
): DriftReading {
  const biasPp = (realized - predicted) * 100;
  const p = Math.min(0.99, Math.max(0.01, predicted));
  const se = n > 0 ? Math.sqrt((p * (1 - p)) / n) : 0;
  const z =
    n >= minN && se > 0
      ? (biasPp - (referenceBiasPp ?? 0)) / 100 / se
      : null;
  return {
    n,
    predicted: round(predicted),
    realized: round(realized),
    biasPp: round(biasPp),
    referenceBiasPp: referenceBiasPp == null ? null : round(referenceBiasPp),
    z: z == null ? null : round(z),
    status: status(z, n, minN),
  };
}

function calibrationReading(points: readonly Point[], referenceBiasPp: number | null): DriftReading {
  const n = points.length;
  const predicted = n > 0 ? points.reduce((s, p) => s + p.prob, 0) / n : 0;
  const realized = n > 0 ? points.filter((p) => p.wentOver).length / n : 0;
  return reading(n, predicted, realized, referenceBiasPp, MONITOR_MIN_PROPS);
}

function betReading(bets: readonly Bet[], referenceHitRate: number | null): DriftReading {
  const n = bets.length;
  const realized = n > 0 ? bets.filter((b) => b.won).length / n : 0;
  // For bets the "prediction" is the hit rate the backtest achieved on this
  // slice; the reference gap is therefore already folded into `predicted`.
  const predicted = referenceHitRate ?? 0.5;
  return reading(n, predicted, realized, 0, MONITOR_MIN_BETS);
}

function referenceOverallBiasPp(reference: BacktestResult): number | null {
  const total = reference.calibration.reduce((s, b) => s + b.n, 0);
  if (total === 0) return null;
  return (
    (reference.calibration.reduce((s, b) => s + (b.realized - b.predicted) * b.n, 0) / total) * 100
  );
}

export function buildCalibrationMonitor(
  snapshots: readonly SlateSnapshot[],
  reference: BacktestResult | null,
  asOf: SeasonWeek,
): CalibrationMonitor {
  const points: Point[] = [];
  const bets: Bet[] = [];
  const weeks: SeasonWeek[] = [];

  for (const snapshot of snapshots) {
    if (snapshot.actuals.length === 0) continue;
    weeks.push({ season: snapshot.season, week: snapshot.week });

    const actualByProp = new Map<string, number>();
    for (const actual of snapshot.actuals) {
      if (actual.actualValue != null) actualByProp.set(actual.propId, actual.actualValue);
    }

    // Same rules as the backtest: every priced prop counts for calibration,
    // pushes are excluded, voided props (never played) are excluded.
    for (const evaluation of snapshot.evaluations) {
      const actual = actualByProp.get(evaluation.propId);
      if (actual == null || actual === evaluation.lineValue) continue;
      points.push({
        propType: evaluation.propType,
        prob: evaluation.modelProbOverNoPush,
        wentOver: actual > evaluation.lineValue,
      });
    }

    for (const candidate of snapshot.recommendations) {
      const actual = actualByProp.get(candidate.propId);
      if (actual == null) continue;
      const outcome = grade(candidate.side, candidate.lineValue, actual);
      if (outcome === "push") continue;
      bets.push({ propType: candidate.propType, won: outcome === "won" });
    }
  }

  weeks.sort((a, b) => a.season - b.season || a.week - b.week);

  const refBiasByType = new Map<PropType, number>();
  const refHitByType = new Map<PropType, number>();
  if (reference) {
    for (const c of reference.calibrationByPropType) refBiasByType.set(c.propType, c.biasPp);
    for (const b of reference.byPropType) refHitByType.set(b.label as PropType, b.hitRate);
  }

  const propTypes = [...new Set(points.map((p) => p.propType))].sort();
  const byPropType: PropTypeDrift[] = propTypes
    .map((propType) => ({
      propType,
      calibration: calibrationReading(
        points.filter((p) => p.propType === propType),
        refBiasByType.get(propType) ?? null,
      ),
      bets: betReading(
        bets.filter((b) => b.propType === propType),
        refHitByType.get(propType) ?? null,
      ),
    }))
    .sort((a, b) => b.calibration.n - a.calibration.n);

  return {
    asOf,
    weeks,
    gradedProps: points.length,
    gradedBets: bets.length,
    overall: calibrationReading(points, reference ? referenceOverallBiasPp(reference) : null),
    byPropType,
    reference: reference
      ? {
          seasons: reference.seasons,
          gradedProps: reference.calibration.reduce((s, b) => s + b.n, 0),
          bets: reference.summary.bets,
        }
      : null,
  };
}

/** Anything that should stop a human and make them look. */
export function driftWarnings(monitor: CalibrationMonitor): string[] {
  const out: string[] = [];
  const describe = (label: string, r: DriftReading, what: string) =>
    `${label}: ${what} ${r.realized * 100 > r.predicted * 100 ? "above" : "below"} expectation by ${Math.abs(r.biasPp - (r.referenceBiasPp ?? 0)).toFixed(1)}pp (z=${r.z}, n=${r.n})`;
  if (monitor.overall.status === "watch" || monitor.overall.status === "drift") {
    out.push(describe("overall", monitor.overall, "realised over-rate"));
  }
  for (const entry of monitor.byPropType) {
    if (entry.calibration.status === "watch" || entry.calibration.status === "drift") {
      out.push(describe(entry.propType, entry.calibration, "realised over-rate"));
    }
    if (entry.bets.status === "watch" || entry.bets.status === "drift") {
      out.push(describe(`${entry.propType} bets`, entry.bets, "hit rate"));
    }
  }
  return out;
}

function round(value: number): number {
  return Number(value.toFixed(4));
}
