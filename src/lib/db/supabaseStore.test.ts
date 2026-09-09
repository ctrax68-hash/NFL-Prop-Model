import { describe, expect, it } from "vitest";

import { pickLineHistoryPoint } from "./supabaseStore";
import { DEFAULT_CONFIG } from "../engine/config";
import type { PropEvaluation } from "../engine/edge";
import type { PropLine } from "../engine/types";
import type { SlateSnapshot } from "../pipeline/types";

function prop(overrides: Partial<PropLine> & { propId: string }): PropLine {
  return {
    gameId: "2026_01_KC_BUF",
    playerId: "p1",
    propType: "receiving_yards",
    lineValue: 50.5,
    oddsOverAmerican: -110,
    oddsUnderAmerican: -110,
    bookName: "book-a",
    timestamp: "2026-09-08T12:00:00Z",
    ...overrides,
  };
}

function evaluation(
  overrides: Partial<PropEvaluation> & { propId: string },
): PropEvaluation {
  return {
    playerId: "p1",
    gameId: "2026_01_KC_BUF",
    propType: "receiving_yards",
    lineValue: 50.5,
    projectedValue: 55,
    sigma: 15,
    distribution: "gamma",
    snapShare: 0.8,
    isQb: false,
    modelProbOver: 0.55,
    modelProbUnder: 0.45,
    modelProbPush: 0,
    modelProbOverNoPush: 0.55,
    modelProbUnderNoPush: 0.45,
    rawImpliedOver: 0.5,
    rawImpliedUnder: 0.5,
    fairProbOver: 0.5,
    fairProbUnder: 0.5,
    overround: 1.05,
    edgeOver: 0.05,
    edgeUnder: -0.05,
    evOver: 0.01,
    evUnder: -0.01,
    ...overrides,
  };
}

function snapshot(props: PropLine[], evaluations: PropEvaluation[]): SlateSnapshot {
  return {
    runId: "test",
    generatedAt: new Date().toISOString(),
    season: 2026,
    week: 1,
    configVersion: "test",
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "synthetic",
    propsAreReal: false,
    games: [],
    players: [],
    teamProjections: [],
    projections: [],
    props,
    evaluations,
    recommendations: [],
    rejected: [],
    actuals: [],
    gameLogs: [],
  };
}

describe("pickLineHistoryPoint", () => {
  it("returns null when the snapshot never priced the market", () => {
    const point = pickLineHistoryPoint(
      snapshot([], []),
      "2026_01_KC_BUF",
      "p1",
      "receiving_yards",
    );
    expect(point).toBeNull();
  });

  it("picks the single quoting book when there is only one", () => {
    const p = prop({ propId: "g|p1|receiving_yards|book-a", lineValue: 62.5 });
    const e = evaluation({ propId: p.propId, edgeOver: 0.04, edgeUnder: -0.02 });
    const point = pickLineHistoryPoint(
      snapshot([p], [e]),
      p.gameId,
      p.playerId,
      p.propType,
    );
    expect(point?.lineValue).toBe(62.5);
    expect(point?.bookName).toBe("book-a");
  });

  it("keeps the best-edge book when two books quote the same market", () => {
    const weak = prop({
      propId: "g|p1|receiving_yards|book-a",
      bookName: "book-a",
      lineValue: 60.5,
    });
    const strong = prop({
      propId: "g|p1|receiving_yards|book-b",
      bookName: "book-b",
      lineValue: 65.5,
    });
    const weakEval = evaluation({
      propId: weak.propId,
      edgeOver: 0.02,
      edgeUnder: -0.01,
    });
    const strongEval = evaluation({
      propId: strong.propId,
      edgeOver: 0.09,
      edgeUnder: -0.04,
    });

    const point = pickLineHistoryPoint(
      snapshot([weak, strong], [weakEval, strongEval]),
      weak.gameId,
      weak.playerId,
      weak.propType,
    );
    expect(point?.bookName).toBe("book-b");
    expect(point?.lineValue).toBe(65.5);
    expect(point?.edgeOver).toBeCloseTo(0.09);
  });

  it("ignores props for a different game, player or prop type", () => {
    const wrongGame = prop({ propId: "x|p1|receiving_yards|book-a", gameId: "other" });
    const wrongPlayer = prop({ propId: "g|p2|receiving_yards|book-a", playerId: "p2" });
    const wrongType = prop({
      propId: "g|p1|receptions|book-a",
      propType: "receptions",
    });
    const evals = [wrongGame, wrongPlayer, wrongType].map((p) =>
      evaluation({ propId: p.propId, gameId: p.gameId, playerId: p.playerId, propType: p.propType }),
    );

    const point = pickLineHistoryPoint(
      snapshot([wrongGame, wrongPlayer, wrongType], evals),
      "2026_01_KC_BUF",
      "p1",
      "receiving_yards",
    );
    expect(point).toBeNull();
  });
});
