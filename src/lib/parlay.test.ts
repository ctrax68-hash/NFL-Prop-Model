import { describe, expect, it } from "vitest";

import { buildParlayLadder } from "./parlay";
import { DEFAULT_CONFIG } from "./engine/config";
import { americanToDecimal } from "./engine/odds";
import type { BetCandidate } from "./engine/selection";
import type { SlatePlayer, SlateSnapshot } from "./pipeline/types";

function candidate(
  gameId: string,
  playerId: string,
  modelProb: number,
  oddsAmerican: number,
  ev: number,
): BetCandidate {
  return {
    propId: `${gameId}|${playerId}|receiving_yards`,
    playerId,
    gameId,
    propType: "receiving_yards",
    lineValue: 50.5,
    side: "over",
    edge: 0.05,
    ev,
    modelProb,
    modelProbNoPush: modelProb,
    fairProb: modelProb - 0.03,
    impliedProb: modelProb - 0.05,
    oddsAmerican,
    kelly: {
      kellyFractionRaw: 0,
      kellyFractionFractional: 0,
      recommendedUnits: 0,
      bankrollFraction: 0,
    },
  };
}

function player(playerId: string, gameId: string): SlatePlayer {
  return {
    playerId,
    name: `Player ${playerId}`,
    teamId: gameId.slice(0, 3),
    position: "WR",
    headshotUrl: null,
    gamesSampleN: 10,
  };
}

function snapshot(recommendations: BetCandidate[]): SlateSnapshot {
  const players = recommendations.map((c) => player(c.playerId, c.gameId));
  return {
    runId: "test",
    generatedAt: new Date().toISOString(),
    season: 2025,
    week: 1,
    configVersion: "test",
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "synthetic",
    propsAreReal: false,
    games: [],
    players,
    teamProjections: [],
    projections: [],
    props: [],
    evaluations: [],
    recommendations,
    rejected: [],
    actuals: [],
    gameLogs: [],
  };
}

describe("buildParlayLadder", () => {
  it("returns one rung per leg count, up to the requested max", () => {
    const recs = Array.from({ length: 10 }, (_, i) =>
      candidate(`game-${i}`, `p-${i}`, 0.6, -110, 0.1 - i * 0.001),
    );
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);
    expect(ladder.map((r) => r.legCount)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it("caps the ladder at the number of distinct games available", () => {
    const recs = [
      candidate("game-1", "p-1", 0.6, -110, 0.1),
      candidate("game-2", "p-2", 0.6, -110, 0.09),
      candidate("game-3", "p-3", 0.6, -110, 0.08),
    ];
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);
    expect(ladder).toHaveLength(3);
  });

  it("takes at most one leg per game, keeping the higher-ev candidate", () => {
    const recs = [
      candidate("game-1", "p-1", 0.55, -110, 0.02),
      candidate("game-1", "p-2", 0.65, -110, 0.2), // same game, better ev
      candidate("game-2", "p-3", 0.6, -110, 0.1),
    ];
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);
    // Only 2 distinct games, so the ladder tops out at 2 legs.
    expect(ladder).toHaveLength(2);
    const oneLegRung = ladder[0];
    expect(oneLegRung.legs).toHaveLength(1);
    expect(oneLegRung.legs[0].playerId).toBe("p-2"); // the better of the two on game-1
  });

  it("ranks legs by ev, which is the ev-maximising order for the ladder", () => {
    const recs = [
      candidate("game-1", "p-1", 0.6, -110, 0.3),
      candidate("game-2", "p-2", 0.6, -110, 0.1),
      candidate("game-3", "p-3", 0.6, -110, 0.2),
    ];
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);
    expect(ladder[0].legs[0].playerId).toBe("p-1");
    expect(ladder[2].legs.map((l) => l.playerId)).toEqual(["p-1", "p-3", "p-2"]);
  });

  it("combines odds and probability multiplicatively under independence", () => {
    const recs = [
      candidate("game-1", "p-1", 0.6, -110, 0.14),
      candidate("game-2", "p-2", 0.55, 120, 0.21),
    ];
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);
    const twoLeg = ladder[1];

    const expectedDecimal = americanToDecimal(-110) * americanToDecimal(120);
    const expectedProb = 0.6 * 0.55;

    expect(twoLeg.decimalOdds).toBeCloseTo(expectedDecimal, 10);
    expect(twoLeg.probability).toBeCloseTo(expectedProb, 10);
    expect(twoLeg.ev).toBeCloseTo(expectedProb * expectedDecimal - 1, 10);
  });

  it("prices a longer parlay with a higher payout but lower win probability", () => {
    const recs = Array.from({ length: 8 }, (_, i) =>
      candidate(`game-${i}`, `p-${i}`, 0.6, -110, 0.1 - i * 0.001),
    );
    const ladder = buildParlayLadder(snapshot(recs), DEFAULT_CONFIG, 8);

    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i].decimalOdds).toBeGreaterThan(ladder[i - 1].decimalOdds);
      expect(ladder[i].probability).toBeLessThan(ladder[i - 1].probability);
    }
  });

  it("returns an empty ladder when there are no recommendations", () => {
    expect(buildParlayLadder(snapshot([]), DEFAULT_CONFIG, 8)).toEqual([]);
  });
});
