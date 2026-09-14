import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../engine/config";
import type { PropEvaluation } from "../engine/edge";
import type { BetCandidate, RejectedCandidate } from "../engine/selection";
import type { PropLine } from "../engine/types";
import { carryForwardMissingProps } from "./carryForward";
import type { PropActual, SlateSnapshot } from "./types";

/** A minimal, valid snapshot — only `props`/`evaluations`/`recommendations`/
 * `rejected`/`actuals` vary between tests; everything else is filler this
 * function never reads. */
function snapshot(overrides: Partial<SlateSnapshot>): SlateSnapshot {
  return {
    runId: "run-fresh",
    generatedAt: "2026-09-13T00:00:00.000Z",
    season: 2026,
    week: 1,
    configVersion: DEFAULT_CONFIG.configVersion,
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "odds-api",
    propsAreReal: true,
    games: [],
    players: [],
    teamProjections: [],
    projections: [],
    props: [],
    evaluations: [],
    recommendations: [],
    rejected: [],
    actuals: [],
    gameLogs: [],
    ...overrides,
  };
}

function prop(propId: string, gameId = "2026_01_NE_SEA"): PropLine {
  return {
    propId,
    gameId,
    playerId: "player-1",
    propType: "receiving_yards",
    lineValue: 62.5,
    oddsOverAmerican: -110,
    oddsUnderAmerican: -110,
    bookName: "draftkings",
    timestamp: "2026-09-09T12:00:00.000Z",
  };
}

function evaluation(propId: string, gameId = "2026_01_NE_SEA"): PropEvaluation {
  return {
    propId,
    playerId: "player-1",
    gameId,
    propType: "receiving_yards",
    lineValue: 62.5,
    projectedValue: 70,
    sigma: 20,
    distribution: "normal",
    snapShare: 0.6,
    isQb: false,
    modelProbOver: 0.6,
    modelProbUnder: 0.4,
    modelProbPush: 0,
    modelProbOverNoPush: 0.6,
    modelProbUnderNoPush: 0.4,
    rawImpliedOver: 0.52,
    rawImpliedUnder: 0.52,
    fairProbOver: 0.5,
    fairProbUnder: 0.5,
    overround: 0.04,
    edgeOver: 0.1,
    edgeUnder: -0.1,
  } as PropEvaluation;
}

function recommendation(propId: string, gameId = "2026_01_NE_SEA"): BetCandidate {
  return {
    propId,
    playerId: "player-1",
    gameId,
    propType: "receiving_yards",
    lineValue: 62.5,
    side: "over",
    edge: 0.1,
    ev: 0.05,
    modelProb: 0.6,
    modelProbNoPush: 0.6,
    fairProb: 0.5,
    impliedProb: 0.52,
    oddsAmerican: -110,
    kelly: {
      kellyFractionRaw: 0.05,
      kellyFractionFractional: 0.02,
      recommendedUnits: 0.5,
    },
  } as BetCandidate;
}

function rejected(propId: string): RejectedCandidate {
  return { propId, side: "over", reason: "below edge threshold" };
}

function actual(propId: string): PropActual {
  return { propId, playerId: "player-1", propType: "receiving_yards", actualValue: 71, status: "graded" };
}

describe("carryForwardMissingProps", () => {
  it("returns the fresh snapshot unchanged when there is no previous run", () => {
    const fresh = snapshot({ props: [prop("a")] });
    const { snapshot: result, carriedPropIds } = carryForwardMissingProps(null, fresh);
    expect(result).toBe(fresh);
    expect(carriedPropIds).toEqual([]);
  });

  it("returns the fresh snapshot unchanged when the previous run had no props", () => {
    const previous = snapshot({ props: [] });
    const fresh = snapshot({ props: [prop("a")] });
    const { snapshot: result, carriedPropIds } = carryForwardMissingProps(previous, fresh);
    expect(result).toBe(fresh);
    expect(carriedPropIds).toEqual([]);
  });

  it("returns the fresh snapshot unchanged when every previous prop is still present", () => {
    const previous = snapshot({ props: [prop("a"), prop("b")] });
    const fresh = snapshot({ props: [prop("a"), prop("b"), prop("c")] });
    const { snapshot: result, carriedPropIds } = carryForwardMissingProps(previous, fresh);
    expect(result).toBe(fresh);
    expect(carriedPropIds).toEqual([]);
  });

  it("carries forward a prop that vanished from the fresh run, with its evaluation, recommendation, rejection and actual", () => {
    // "a" is a game that has since finished — its market is gone from the
    // fresh fetch. "b" is a still-open game the fresh run still covers.
    const previous = snapshot({
      props: [prop("a"), prop("b")],
      evaluations: [evaluation("a"), evaluation("b")],
      recommendations: [recommendation("a")],
      rejected: [rejected("b")],
      actuals: [actual("a")],
    });
    const fresh = snapshot({
      props: [prop("b")],
      evaluations: [evaluation("b")],
      recommendations: [],
      rejected: [rejected("b")],
      actuals: [],
    });

    const { snapshot: result, carriedPropIds } = carryForwardMissingProps(previous, fresh);

    expect(carriedPropIds).toEqual(["a"]);
    expect(result.props.map((p) => p.propId).sort()).toEqual(["a", "b"]);
    expect(result.evaluations.map((e) => e.propId).sort()).toEqual(["a", "b"]);
    expect(result.recommendations.map((r) => r.propId)).toEqual(["a"]);
    expect(result.actuals.map((a) => a.propId)).toEqual(["a"]);
    // "b"'s rejection was already in `fresh` — carrying forward must not
    // duplicate it.
    expect(result.rejected).toHaveLength(1);
  });

  it("does not mutate either input snapshot", () => {
    const previous = snapshot({ props: [prop("a")], evaluations: [evaluation("a")] });
    const fresh = snapshot({ props: [] });
    const previousPropsBefore = previous.props;
    const freshPropsBefore = fresh.props;

    carryForwardMissingProps(previous, fresh);

    expect(previous.props).toBe(previousPropsBefore);
    expect(fresh.props).toBe(freshPropsBefore);
  });
});
