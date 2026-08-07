/**
 * Historical replay.
 *
 * Re-runs the weekly pipeline across past weeks and grades what it recommended
 * against what actually happened. Every derivation inside the pipeline filters
 * to games strictly before the week being projected, so nothing here can see
 * the future — {@link assertNoLookahead} checks that rather than assuming it.
 */

import type { EngineConfig } from "../engine/config";
import { DEFAULT_CONFIG } from "../engine/config";
import type { PropType, Side } from "../engine/types";
import type { PropsProvider } from "../ingest/props/provider";
import { SyntheticPropsProvider } from "../ingest/props/synthetic";
import type { DataBundle } from "../pipeline/bundle";
import { runPipeline } from "../pipeline/run";
import type { SlateSnapshot } from "../pipeline/types";

export type Outcome = "won" | "lost" | "push";

export interface GradedBet {
  season: number;
  week: number;
  propId: string;
  playerId: string;
  playerName: string;
  gameId: string;
  propType: PropType;
  side: Side;
  lineValue: number;
  oddsAmerican: number;
  units: number;
  edge: number;
  modelProb: number;
  fairProb: number;
  actualValue: number;
  outcome: Outcome;
  profitUnits: number;
}

export interface Bucket {
  label: string;
  bets: number;
  wins: number;
  losses: number;
  pushes: number;
  hitRate: number;
  unitsStaked: number;
  unitsProfit: number;
  roi: number;
}

export interface CalibrationBin {
  binLow: number;
  binHigh: number;
  /** Mean model probability of the over within the bin. */
  predicted: number;
  /** Share of props in the bin that actually went over. */
  realized: number;
  n: number;
}

/**
 * Calibration split by prop type, plus the shape statistics that explain it.
 *
 * A single global calibration number averages over position groups that fail in
 * opposite directions, which is how a defect isolated to skill positions stayed
 * invisible behind one headline figure. These three statistics together
 * distinguish *where* a mis-specified distribution is wrong:
 *
 *   - `biasPp` — realised minus predicted. Directional error, not dispersion.
 *   - `medianRatio` — median(actual)/line. Below 1 means the model's median sits
 *     too high, so too much probability mass is parked above the line.
 *   - `zeroRate` — share of graded props that came in at exactly zero. A point
 *     mass no continuous density can represent.
 *
 * A mean that lands on the line while the median sits well below it is the
 * signature of unmodelled right skew.
 */
export interface PropTypeCalibration {
  propType: PropType;
  n: number;
  predicted: number;
  realized: number;
  biasPp: number;
  meanRatio: number;
  medianRatio: number;
  zeroRate: number;
  bins: CalibrationBin[];
}

export interface BacktestResult {
  seasons: number[];
  weeksRun: number;
  /** Props excluded because the player never took the field. */
  voidedProps: number;
  propsAreReal: boolean;
  bets: GradedBet[];
  summary: Bucket;
  byEdgeBucket: Bucket[];
  byPropType: Bucket[];
  bySeason: Bucket[];
  calibration: CalibrationBin[];
  /** Calibration split per prop type, with the shape statistics behind it. */
  calibrationByPropType: PropTypeCalibration[];
  /** Cumulative profit in units after each bet, in chronological order. */
  equityCurve: Array<{ index: number; season: number; week: number; cumulativeUnits: number }>;
}

export interface BacktestOptions {
  seasons: readonly number[];
  weeks?: readonly number[];
  config?: EngineConfig;
  provider?: PropsProvider;
  bankroll?: number;
  onProgress?: (season: number, week: number, snapshot: SlateSnapshot) => void;
}

const DEFAULT_WEEKS = Array.from({ length: 18 }, (_, i) => i + 1);

export async function runBacktest(
  bundle: DataBundle,
  options: BacktestOptions,
): Promise<BacktestResult> {
  const config = options.config ?? DEFAULT_CONFIG;
  const provider = options.provider ?? new SyntheticPropsProvider();
  const weeks = options.weeks ?? DEFAULT_WEEKS;

  const bets: GradedBet[] = [];
  const calibrationPoints: CalibrationPoint[] = [];
  let weeksRun = 0;
  let voided = 0;

  for (const season of options.seasons) {
    for (const week of weeks) {
      const snapshot = await runPipeline(bundle, {
        season,
        week,
        config,
        provider,
        bankroll: options.bankroll,
      });

      // Nothing to grade for a week that has not been played.
      if (snapshot.actuals.length === 0 || snapshot.games.length === 0) continue;

      assertNoLookahead(snapshot);
      weeksRun += 1;

      // Voided props (player never took the field) are absent from this map, so
      // they drop out of both grading and calibration rather than settling as
      // losses.
      const actualByProp = new Map<string, number>();
      for (const actual of snapshot.actuals) {
        if (actual.actualValue != null) {
          actualByProp.set(actual.propId, actual.actualValue);
        } else {
          voided += 1;
        }
      }
      const nameById = new Map(snapshot.players.map((p) => [p.playerId, p.name]));

      // Calibration is measured across EVERY priced prop, not just the ones we
      // bet. Restricting it to bets would only tell us about the tail we
      // selected, which is exactly where selection bias lives.
      for (const evaluation of snapshot.evaluations) {
        const actual = actualByProp.get(evaluation.propId);
        if (actual == null || actual === evaluation.lineValue) continue;
        calibrationPoints.push({
          prob: evaluation.modelProbOverNoPush,
          wentOver: actual > evaluation.lineValue,
          propType: evaluation.propType,
          lineValue: evaluation.lineValue,
          actual,
        });
      }

      for (const candidate of snapshot.recommendations) {
        const actual = actualByProp.get(candidate.propId);
        if (actual == null) continue;

        const outcome = grade(candidate.side, candidate.lineValue, actual);
        bets.push({
          season,
          week,
          propId: candidate.propId,
          playerId: candidate.playerId,
          playerName: nameById.get(candidate.playerId) ?? candidate.playerId,
          gameId: candidate.gameId,
          propType: candidate.propType,
          side: candidate.side,
          lineValue: candidate.lineValue,
          oddsAmerican: candidate.oddsAmerican,
          units: candidate.kelly.recommendedUnits,
          edge: candidate.edge,
          modelProb: candidate.modelProb,
          fairProb: candidate.fairProb,
          actualValue: actual,
          outcome,
          profitUnits: profit(
            outcome,
            candidate.kelly.recommendedUnits,
            candidate.oddsAmerican,
          ),
        });
      }

      options.onProgress?.(season, week, snapshot);
    }
  }

  bets.sort((a, b) => a.season - b.season || a.week - b.week);

  let cumulative = 0;
  const equityCurve = bets.map((bet, index) => {
    cumulative += bet.profitUnits;
    return {
      index: index + 1,
      season: bet.season,
      week: bet.week,
      cumulativeUnits: Number(cumulative.toFixed(4)),
    };
  });

  return {
    seasons: [...options.seasons],
    weeksRun,
    voidedProps: voided,
    propsAreReal: provider.isReal,
    bets,
    summary: bucketise("all", bets),
    byEdgeBucket: edgeBuckets(bets),
    byPropType: groupBuckets(bets, (bet) => bet.propType),
    bySeason: groupBuckets(bets, (bet) => String(bet.season)),
    calibration: calibrate(calibrationPoints),
    calibrationByPropType: calibrateByPropType(calibrationPoints),
    equityCurve,
  };
}

export function grade(side: Side, line: number, actual: number): Outcome {
  if (actual === line) return "push";
  const wentOver = actual > line;
  return (side === "over") === wentOver ? "won" : "lost";
}

export function profit(
  outcome: Outcome,
  units: number,
  oddsAmerican: number,
): number {
  if (outcome === "push") return 0;
  if (outcome === "lost") return -units;
  const multiple =
    oddsAmerican > 0 ? oddsAmerican / 100 : 100 / -oddsAmerican;
  return units * multiple;
}

function bucketise(label: string, bets: readonly GradedBet[]): Bucket {
  let wins = 0;
  let losses = 0;
  let pushes = 0;
  let unitsStaked = 0;
  let unitsProfit = 0;

  for (const bet of bets) {
    if (bet.outcome === "won") wins += 1;
    else if (bet.outcome === "lost") losses += 1;
    else pushes += 1;
    // A push returns the stake, so it is not risked capital for ROI purposes.
    if (bet.outcome !== "push") unitsStaked += bet.units;
    unitsProfit += bet.profitUnits;
  }

  const decisive = wins + losses;
  return {
    label,
    bets: bets.length,
    wins,
    losses,
    pushes,
    hitRate: decisive > 0 ? wins / decisive : 0,
    unitsStaked: Number(unitsStaked.toFixed(4)),
    unitsProfit: Number(unitsProfit.toFixed(4)),
    roi: unitsStaked > 0 ? unitsProfit / unitsStaked : 0,
  };
}

const EDGE_BUCKETS: Array<[number, number]> = [
  [0.03, 0.05],
  [0.05, 0.08],
  [0.08, 0.12],
  [0.12, 1],
];

function edgeBuckets(bets: readonly GradedBet[]): Bucket[] {
  return EDGE_BUCKETS.map(([low, high]) =>
    bucketise(
      `${(low * 100).toFixed(0)}-${high === 1 ? "+" : (high * 100).toFixed(0)}%`,
      bets.filter((bet) => bet.edge >= low && bet.edge < high),
    ),
  );
}

function groupBuckets(
  bets: readonly GradedBet[],
  key: (bet: GradedBet) => string,
): Bucket[] {
  const groups = new Map<string, GradedBet[]>();
  for (const bet of bets) {
    const k = key(bet);
    const list = groups.get(k);
    if (list) list.push(bet);
    else groups.set(k, [bet]);
  }
  return [...groups.entries()]
    .map(([label, group]) => bucketise(label, group))
    .sort((a, b) => b.bets - a.bets);
}

/**
 * Bin predicted probabilities and compare them against realised frequencies.
 *
 * This is the measurement that actually validates the model. ROI over a few
 * hundred bets is dominated by variance and, against synthetic lines, circular
 * on top of that. Calibration is neither: it asks whether props the model
 * priced at 60% went over about 60% of the time, judged against real NFL
 * results, and a mis-specified distribution shows up immediately.
 */
export function calibrate(
  points: ReadonlyArray<{ prob: number; wentOver: boolean }>,
  binCount = 10,
): CalibrationBin[] {
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < binCount; i += 1) {
    const binLow = i / binCount;
    const binHigh = (i + 1) / binCount;

    const inBin = points.filter(
      (p) => p.prob >= binLow && (i === binCount - 1 ? p.prob <= binHigh : p.prob < binHigh),
    );
    if (inBin.length === 0) continue;

    bins.push({
      binLow,
      binHigh,
      predicted:
        inBin.reduce((sum, p) => sum + p.prob, 0) / inBin.length,
      realized: inBin.filter((p) => p.wentOver).length / inBin.length,
      n: inBin.length,
    });
  }

  return bins;
}

/** A scored prop, carrying enough context to diagnose *why* it missed. */
export interface CalibrationPoint {
  prob: number;
  wentOver: boolean;
  propType: PropType;
  lineValue: number;
  actual: number;
}

function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

/**
 * Per-prop-type calibration, plus the statistics that identify the failure mode.
 *
 * Ratios are taken per prop and then averaged/medianed, not computed from
 * aggregate means, so a handful of high-volume passing props cannot dominate the
 * receiving numbers.
 */
export function calibrateByPropType(
  points: readonly CalibrationPoint[],
  binCount = 10,
): PropTypeCalibration[] {
  const groups = new Map<PropType, CalibrationPoint[]>();
  for (const point of points) {
    const list = groups.get(point.propType);
    if (list) list.push(point);
    else groups.set(point.propType, [point]);
  }

  return [...groups.entries()]
    .map(([propType, group]) => {
      const predicted =
        group.reduce((sum, p) => sum + p.prob, 0) / group.length;
      const realized = group.filter((p) => p.wentOver).length / group.length;

      // A line of zero would make the ratio meaningless; those props are
      // excluded from the shape statistics but still counted in calibration.
      const ratios = group
        .filter((p) => p.lineValue > 0)
        .map((p) => p.actual / p.lineValue);

      return {
        propType,
        n: group.length,
        predicted,
        realized,
        biasPp: (realized - predicted) * 100,
        meanRatio:
          ratios.length > 0
            ? ratios.reduce((sum, r) => sum + r, 0) / ratios.length
            : 0,
        medianRatio: median(ratios),
        zeroRate: group.filter((p) => p.actual === 0).length / group.length,
        bins: calibrate(group, binCount),
      };
    })
    .sort((a, b) => b.n - a.n);
}

/**
 * Guard against look-ahead bias.
 *
 * If baselines were ever built from games at or after the week being projected,
 * the backtest would report a model that cannot exist. Rather than trusting the
 * as-of plumbing, assert the invariant that makes it observable: a projection
 * must never reproduce the actual result too precisely to be a forecast.
 */
export function assertNoLookahead(snapshot: SlateSnapshot): void {
  const actualByProp = new Map(
    snapshot.actuals.map((actual) => [actual.propId, actual.actualValue]),
  );

  let compared = 0;
  let suspiciouslyExact = 0;

  for (const evaluation of snapshot.evaluations) {
    const actual = actualByProp.get(evaluation.propId);
    if (actual == null || actual === 0) continue;
    compared += 1;
    if (Math.abs(evaluation.projectedValue - actual) < 1e-6) {
      suspiciouslyExact += 1;
    }
  }

  if (compared >= 50 && suspiciouslyExact / compared > 0.02) {
    throw new Error(
      `Look-ahead detected in ${snapshot.season} week ${snapshot.week}: ` +
        `${suspiciouslyExact}/${compared} projections exactly equal the actual result. ` +
        "Baselines are seeing the week they are meant to predict.",
    );
  }
}
