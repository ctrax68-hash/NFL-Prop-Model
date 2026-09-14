import { describe, expect, it } from "vitest";

import { DEFAULT_CONFIG } from "../engine/config";
import type { BetCandidate } from "../engine/selection";
import type { PropActual, SlatePlayer, SlateSnapshot } from "../pipeline/types";
import { buildSeasonRecord } from "./seasonRecord";

function bet(propId: string, units: number, oddsAmerican = -110): BetCandidate {
  return {
    propId,
    playerId: "p1",
    gameId: "g1",
    propType: "receiving_yards",
    lineValue: 50,
    side: "over",
    edge: 0.06,
    ev: 0.03,
    modelProb: 0.56,
    modelProbNoPush: 0.56,
    fairProb: 0.5,
    impliedProb: 0.5,
    oddsAmerican,
    kelly: { kellyFractionRaw: 0.02, kellyFractionFractional: units / 4, recommendedUnits: units },
  } as BetCandidate;
}

function actual(propId: string, value: number | null): PropActual {
  return {
    propId,
    playerId: "p1",
    propType: "receiving_yards",
    actualValue: value,
    status: value == null ? "did-not-play" : "graded",
  };
}

const PLAYER: SlatePlayer = {
  playerId: "p1",
  name: "Test Player",
  teamId: "SEA",
  position: "WR",
  headshotUrl: null,
  gamesSampleN: 5,
};

function snapshot(overrides: Partial<SlateSnapshot>): SlateSnapshot {
  return {
    runId: "run",
    generatedAt: "2026-09-01T00:00:00Z",
    season: 2026,
    week: 1,
    configVersion: "test",
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "odds-api",
    propsAreReal: true,
    games: [],
    players: [PLAYER],
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

describe("buildSeasonRecord", () => {
  it("returns null when no week has graded yet", () => {
    const snapshots = [snapshot({ week: 1, actuals: [] })];
    expect(buildSeasonRecord(snapshots, 2026)).toBeNull();
  });

  it("matches a hand-computed record for a single graded week", () => {
    // Line 50, over: 60 wins, 40 loses.
    const snapshots = [
      snapshot({
        week: 1,
        recommendations: [bet("a", 1), bet("b", 1), bet("c", 1)],
        actuals: [actual("a", 60), actual("b", 60), actual("c", 40)],
      }),
    ];

    const result = buildSeasonRecord(snapshots, 2026);

    expect(result).not.toBeNull();
    expect(result!.season).toBe(2026);
    expect(result!.weeks).toEqual([1]);
    expect(result!.propsAreReal).toBe(true);
    expect(result!.record.wins).toBe(2);
    expect(result!.record.losses).toBe(1);
    expect(result!.record.pushes).toBe(0);
    expect(result!.record.hitRate).toBeCloseTo(2 / 3, 5);
    // -110: win pays 100/110 units, loss costs 1 unit.
    const expectedProfit = 100 / 110 + 100 / 110 - 1;
    expect(result!.record.unitsProfit).toBeCloseTo(expectedProfit, 4);
    expect(result!.record.unitsStaked).toBeCloseTo(3, 4);
  });

  it("accumulates multiple graded weeks into one record", () => {
    const snapshots = [
      snapshot({ week: 1, recommendations: [bet("a", 1)], actuals: [actual("a", 60)] }),
      snapshot({ week: 2, recommendations: [bet("b", 1)], actuals: [actual("b", 40)] }),
    ];

    const result = buildSeasonRecord(snapshots, 2026);

    expect(result!.weeks).toEqual([1, 2]);
    expect(result!.record.wins).toBe(1);
    expect(result!.record.losses).toBe(1);
  });

  it("excludes a push from wins/losses and staked units, but still counts the bet", () => {
    const snapshots = [
      snapshot({ week: 1, recommendations: [bet("a", 1)], actuals: [actual("a", 50)] }), // pushes at the line
    ];

    const result = buildSeasonRecord(snapshots, 2026);

    expect(result!.record.bets).toBe(1);
    expect(result!.record.wins).toBe(0);
    expect(result!.record.losses).toBe(0);
    expect(result!.record.pushes).toBe(1);
    expect(result!.record.unitsStaked).toBe(0);
    expect(result!.record.unitsProfit).toBe(0);
  });

  it("skips a recommendation with no matching actual yet (voided or still pending)", () => {
    const snapshots = [
      snapshot({
        week: 1,
        recommendations: [bet("a", 1), bet("b", 1)],
        actuals: [actual("a", 60), actual("b", null)], // b did-not-play: actualValue null
      }),
    ];

    const result = buildSeasonRecord(snapshots, 2026);

    expect(result!.record.bets).toBe(1);
  });

  it("is false for propsAreReal if any included week used synthetic lines, even when others were real", () => {
    const snapshots = [
      snapshot({ week: 1, propsAreReal: true, recommendations: [bet("a", 1)], actuals: [actual("a", 60)] }),
      snapshot({ week: 2, propsAreReal: false, recommendations: [bet("b", 1)], actuals: [actual("b", 60)] }),
    ];

    const result = buildSeasonRecord(snapshots, 2026);

    expect(result!.propsAreReal).toBe(false);
  });

  it("ignores snapshots from a different season", () => {
    const snapshots = [
      snapshot({ season: 2025, week: 18, recommendations: [bet("a", 1)], actuals: [actual("a", 60)] }),
    ];

    expect(buildSeasonRecord(snapshots, 2026)).toBeNull();
  });
});
