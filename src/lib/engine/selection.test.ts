import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "./config";
import type { PropEvaluation } from "./edge";
import { selectBets } from "./selection";
import type { PropLine } from "./types";

/** A prop priced generously enough to clear every default selection filter. */
function makeEvaluation(overrides: Partial<PropEvaluation> = {}): PropEvaluation {
  return {
    propId: "game1|player1|receptions|book-a",
    playerId: "player1",
    gameId: "game1",
    propType: "receptions",
    lineValue: 4.5,
    projectedValue: 5.5,
    sigma: 1.5,
    distribution: "negative-binomial",
    snapShare: null,
    modelProbOver: 0.7,
    modelProbUnder: 0.28,
    modelProbPush: 0.02,
    modelProbOverNoPush: 0.714,
    modelProbUnderNoPush: 0.286,
    rawImpliedOver: 0.524,
    rawImpliedUnder: 0.524,
    fairProbOver: 0.5,
    fairProbUnder: 0.5,
    overround: 1.048,
    edgeOver: 0.214,
    edgeUnder: -0.214,
    evOver: 0.2,
    evUnder: -0.4,
    ...overrides,
  };
}

function makeProp(overrides: Partial<PropLine> = {}): PropLine {
  return {
    propId: "game1|player1|receptions|book-a",
    gameId: "game1",
    playerId: "player1",
    propType: "receptions",
    lineValue: 4.5,
    oddsOverAmerican: -110,
    oddsUnderAmerican: -110,
    bookName: "book-a",
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

const context = { gamesSampleByPlayer: new Map([["player1", 10]]) };

describe("selectBets — market-key dedup", () => {
  it("keeps only the higher-edge candidate when two books quote the same market", () => {
    const cheap = makeEvaluation({
      propId: "game1|player1|receptions|book-a",
      edgeOver: 0.05,
      edgeUnder: -0.05,
    });
    const rich = makeEvaluation({
      propId: "game1|player1|receptions|book-b",
      edgeOver: 0.15,
      edgeUnder: -0.15,
    });
    const propsById = new Map([
      [cheap.propId, makeProp({ propId: cheap.propId, bookName: "book-a" })],
      [rich.propId, makeProp({ propId: rich.propId, bookName: "book-b" })],
    ]);

    const result = selectBets([cheap, rich], propsById, context, DEFAULT_CONFIG);

    expect(result.selected).toHaveLength(1);
    expect(result.selected[0].propId).toBe(rich.propId);
    expect(
      result.rejected.some(
        (r) =>
          r.propId === cheap.propId &&
          r.reason.includes("higher-edge candidate"),
      ),
    ).toBe(true);
  });

  it("does not dedupe different markets, even for the same player", () => {
    const receptions = makeEvaluation({
      propId: "game1|player1|receptions|book-a",
      propType: "receptions",
      edgeOver: 0.1,
      edgeUnder: -0.1,
    });
    const receivingYards = makeEvaluation({
      propId: "game1|player1|receiving_yards|book-a",
      propType: "receiving_yards",
      edgeOver: 0.08,
      edgeUnder: -0.08,
    });
    const propsById = new Map([
      [receptions.propId, makeProp({ propId: receptions.propId, propType: "receptions" })],
      [
        receivingYards.propId,
        makeProp({ propId: receivingYards.propId, propType: "receiving_yards" }),
      ],
    ]);

    const result = selectBets(
      [receptions, receivingYards],
      propsById,
      context,
      DEFAULT_CONFIG,
    );

    expect(result.selected).toHaveLength(2);
  });

  it("leaves a single-book slate's selection unaffected", () => {
    const single = makeEvaluation();
    const propsById = new Map([[single.propId, makeProp()]]);

    const result = selectBets([single], propsById, context, DEFAULT_CONFIG);

    expect(result.selected).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
  });
});
