import { describe, expect, it } from "vitest";

import type { BacktestResult } from "../backtest";
import { DEFAULT_CONFIG } from "../engine/config";
import type { PropEvaluation } from "../engine/edge";
import type { BetCandidate } from "../engine/selection";
import type { PropType } from "../engine/types";
import type { PropActual, SlateSnapshot } from "../pipeline/types";
import { buildCalibrationMonitor, driftWarnings, MONITOR_MIN_PROPS } from "./monitor";

function evaluation(propId: string, propType: PropType, prob: number, line = 50): PropEvaluation {
  return {
    propId,
    playerId: "p",
    gameId: "g",
    propType,
    lineValue: line,
    projectedValue: line,
    sigma: 10,
    distribution: "gamma",
    snapShare: 0.8,
    isQb: false,
    modelProbOver: prob,
    modelProbUnder: 1 - prob,
    modelProbPush: 0,
    modelProbOverNoPush: prob,
    modelProbUnderNoPush: 1 - prob,
    rawImpliedOver: 0.5,
    rawImpliedUnder: 0.5,
    fairProbOver: 0.5,
    fairProbUnder: 0.5,
    overround: 1.05,
    edgeOver: prob - 0.5,
    edgeUnder: 0.5 - prob,
    evOver: 0,
    evUnder: 0,
  };
}

function actual(propId: string, propType: PropType, value: number | null): PropActual {
  return { propId, playerId: "p", propType, actualValue: value, status: value == null ? "did-not-play" : "graded" };
}

/**
 * A week where `n` props of one type were priced at `prob` and `overs` of them
 * went over; recommendations (all overs) are attached when `betCount` > 0.
 */
function week(
  wk: number,
  propType: PropType,
  n: number,
  prob: number,
  overs: number,
  betCount = 0,
  betWins = 0,
): SlateSnapshot {
  const evaluations: PropEvaluation[] = [];
  const actuals: PropActual[] = [];
  const recommendations: BetCandidate[] = [];
  for (let i = 0; i < n; i += 1) {
    const id = `w${wk}-${propType}-${i}`;
    evaluations.push(evaluation(id, propType, prob));
    actuals.push(actual(id, propType, i < overs ? 60 : 40));
    if (i < betCount) {
      recommendations.push({
        propId: id,
        playerId: "p",
        gameId: "g",
        propType,
        side: "over",
        lineValue: 50,
        oddsAmerican: -110,
        edge: 0.06,
        modelProb: prob,
        fairProb: 0.5,
        kelly: { recommendedUnits: 0.5 },
      } as unknown as BetCandidate);
      // Bets are the first `betCount` props; make exactly `betWins` of them overs.
      actuals[i] = actual(id, propType, i < betWins ? 60 : 40);
    }
  }
  return {
    runId: `run-${wk}`,
    generatedAt: "2026-09-01T00:00:00Z",
    season: 2026,
    week: wk,
    configVersion: "test",
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "test",
    propsAreReal: true,
    games: [],
    players: [],
    teamProjections: [],
    projections: [],
    props: [],
    evaluations,
    recommendations,
    rejected: [],
    actuals,
    gameLogs: [],
  };
}

function reference(biasPp: Record<string, number>, hitRate: Record<string, number>): BacktestResult {
  return {
    seasons: [2023, 2024, 2025],
    weeksRun: 54,
    voidedProps: 0,
    propsAreReal: false,
    bets: [],
    summary: { label: "all", bets: 4000, wins: 2400, losses: 1600, pushes: 0, hitRate: 0.6, unitsStaked: 0, unitsProfit: 0, roi: 0 },
    byEdgeBucket: [],
    byPropType: Object.entries(hitRate).map(([label, h]) => ({ label, bets: 500, wins: 0, losses: 0, pushes: 0, hitRate: h, unitsStaked: 0, unitsProfit: 0, roi: 0 })),
    bySeason: [],
    calibration: [{ binLow: 0.5, binHigh: 0.6, predicted: 0.55, realized: 0.54, n: 10000 }],
    calibrationByPropType: Object.entries(biasPp).map(([propType, b]) => ({
      propType: propType as PropType,
      n: 5000,
      predicted: 0.55,
      realized: 0.55 + b / 100,
      biasPp: b,
      meanRatio: 1,
      medianRatio: 1,
      zeroRate: 0,
      bins: [],
    })),
    equityCurve: [],
  };
}

const ASOF = { season: 2026, week: 5 };

describe("buildCalibrationMonitor", () => {
  it("reads calibration off every graded prop and lists the weeks covered", () => {
    const m = buildCalibrationMonitor(
      [week(2, "receiving_yards", 200, 0.55, 110), week(3, "receiving_yards", 200, 0.55, 110)],
      null,
      ASOF,
    );
    expect(m.weeks).toEqual([{ season: 2026, week: 2 }, { season: 2026, week: 3 }]);
    expect(m.gradedProps).toBe(400);
    expect(m.overall.predicted).toBeCloseTo(0.55, 4);
    expect(m.overall.realized).toBeCloseTo(0.55, 4);
    expect(m.overall.status).toBe("ok");
  });

  it("skips ungraded weeks and voided props", () => {
    const ungraded = { ...week(4, "receptions", 100, 0.5, 50), actuals: [] };
    const voided = week(3, "receptions", 100, 0.5, 50);
    voided.actuals = voided.actuals.map((a, i) => (i < 20 ? { ...a, actualValue: null, status: "did-not-play" as const } : a));
    const m = buildCalibrationMonitor([ungraded, voided], null, ASOF);
    expect(m.weeks).toEqual([{ season: 2026, week: 3 }]);
    expect(m.gradedProps).toBe(80);
  });

  it("flags a prop type whose over-rate has drifted beyond noise, relative to the reference bias", () => {
    // Reference says receiving yards historically ran 1pp under prediction.
    const ref = reference({ receiving_yards: -1, receptions: 0 }, { receiving_yards: 0.6, receptions: 0.59 });
    // 400 props priced at 55% but only 40% went over: a 15pp miss, ~6 SE.
    const m = buildCalibrationMonitor([week(2, "receiving_yards", 400, 0.55, 160)], ref, ASOF);
    const rec = m.byPropType.find((p) => p.propType === "receiving_yards")!;
    expect(rec.calibration.biasPp).toBeCloseTo(-15, 2);
    expect(rec.calibration.referenceBiasPp).toBe(-1);
    expect(rec.calibration.z).toBeLessThan(-3);
    expect(rec.calibration.status).toBe("drift");
    expect(driftWarnings(m).some((w) => w.startsWith("receiving_yards:"))).toBe(true);
  });

  it("stays quiet on a gap that sampling noise explains", () => {
    const ref = reference({ receptions: 0 }, { receptions: 0.59 });
    // 100 props at 55%, 51 over: -4pp, under 1 SE.
    const m = buildCalibrationMonitor([week(2, "receptions", 100, 0.55, 51)], ref, ASOF);
    expect(m.byPropType[0].calibration.status).toBe("ok");
    expect(driftWarnings(m)).toEqual([]);
  });

  it("refuses to judge a thin sample", () => {
    const m = buildCalibrationMonitor([week(2, "passing_yards", MONITOR_MIN_PROPS - 1, 0.55, 5)], null, ASOF);
    expect(m.byPropType[0].calibration.status).toBe("insufficient");
    expect(m.byPropType[0].calibration.z).toBeNull();
  });

  it("grades recommended bets against the reference hit rate", () => {
    const ref = reference({ rushing_yards: 0 }, { rushing_yards: 0.62 });
    // 60 bets, 20 won: 33% against a 62% reference.
    const m = buildCalibrationMonitor([week(2, "rushing_yards", 200, 0.6, 120, 60, 20)], ref, ASOF);
    const entry = m.byPropType.find((p) => p.propType === "rushing_yards")!;
    expect(entry.bets.n).toBe(60);
    expect(entry.bets.predicted).toBeCloseTo(0.62, 4);
    expect(entry.bets.realized).toBeCloseTo(20 / 60, 3);
    expect(entry.bets.status).toBe("drift");
    expect(m.gradedBets).toBe(60);
  });

  it("carries the reference window it was judged against", () => {
    const ref = reference({}, {});
    const m = buildCalibrationMonitor([week(2, "receptions", 100, 0.5, 50)], ref, ASOF);
    expect(m.reference).toEqual({ seasons: [2023, 2024, 2025], gradedProps: 10000, bets: 4000 });
    expect(buildCalibrationMonitor([], null, ASOF).reference).toBeNull();
  });
});
