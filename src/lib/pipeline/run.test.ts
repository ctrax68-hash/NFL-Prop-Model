import { describe, expect, it } from "vitest";

import { applyInjuryAdjustments, buildActuals } from "./run";
import { DEFAULT_CONFIG, withConfig } from "../engine/config";
import type { InjuryStatus, PlayerBaseline, PropLine } from "../engine/types";
import type { PlayerRecord } from "../ingest/baselines";
import type { PlayerWeek, SnapCountRow } from "../ingest/nflverse";
import type { SlateGame } from "./types";

function record(
  playerId: string,
  overrides: Partial<PlayerBaseline> & { injuryStatus?: InjuryStatus } = {},
): PlayerRecord {
  const baseline: PlayerBaseline = {
    playerId,
    name: playerId,
    teamId: "KC",
    position: "WR",
    baselineTargetShare: 0.2,
    baselineRushShare: 0,
    baselineRouteParticipation: 0.8,
    baselineSnapShare: 0.8,
    baselineYardsPerTarget: 8,
    baselineYardsPerCarry: 4,
    baselineCatchRate: 0.65,
    baselineReceptionsPerGame: 5,
    baselineCarriesPerGame: 0,
    baselinePassAttemptShare: 0,
    baselineYardsPerPassAttempt: 7,
    baselineCompletionRate: 0.65,
    gamesSampleN: 10,
    ...overrides,
  };
  return {
    baseline,
    headshotUrl: null,
    statHistory: {},
    lastSeen: { season: 2025, week: 10 },
  };
}

describe("applyInjuryAdjustments", () => {
  it("passes a healthy player through unchanged", () => {
    const records = new Map([["p1", record("p1")]]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.get("p1")).toBe(records.get("p1"));
  });

  it("excludes a player ruled Out entirely", () => {
    const records = new Map([["p1", record("p1", { injuryStatus: "out" })]]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.has("p1")).toBe(false);
  });

  it("leaves shares unchanged when the multiplier is 1 (the shipped default)", () => {
    const records = new Map([
      ["p1", record("p1", { injuryStatus: "questionable" })],
    ]);
    const out = applyInjuryAdjustments(records, DEFAULT_CONFIG);
    expect(out.get("p1")?.baseline.baselineTargetShare).toBe(0.2);
  });

  it("haircuts a Questionable player's usage shares when configured", () => {
    const config = withConfig({ injury: { questionableVolumeMultiplier: 0.8 } });
    const records = new Map([
      [
        "p1",
        record("p1", {
          injuryStatus: "questionable",
          baselineTargetShare: 0.2,
          baselinePassAttemptShare: 0.9,
        }),
      ],
    ]);
    const out = applyInjuryAdjustments(records, config);
    const baseline = out.get("p1")!.baseline;
    expect(baseline.baselineTargetShare).toBeCloseTo(0.16);
    expect(baseline.baselinePassAttemptShare).toBeCloseTo(0.72);
  });

  it("haircuts a Doubtful player using the doubtful multiplier, not the questionable one", () => {
    const config = withConfig({
      injury: { questionableVolumeMultiplier: 0.8, doubtfulVolumeMultiplier: 0.5 },
    });
    const records = new Map([
      ["p1", record("p1", { injuryStatus: "doubtful", baselineTargetShare: 0.2 })],
    ]);
    const out = applyInjuryAdjustments(records, config);
    expect(out.get("p1")?.baseline.baselineTargetShare).toBeCloseTo(0.1);
  });
});

describe("buildActuals", () => {
  const ASOF = { season: 2026, week: 1 };

  function game(gameId: string, overrides: Partial<SlateGame> = {}): SlateGame {
    return {
      gameId,
      season: 2026,
      week: 1,
      gameday: "2026-09-13",
      kickoffAt: "2026-09-13T17:00:00.000Z",
      homeTeam: "PIT",
      awayTeam: "ATL",
      spreadHome: -1,
      total: 44,
      impliedTeamTotalHome: 22,
      impliedTeamTotalAway: 22,
      weatherType: "outdoors",
      windSpeedMph: 5,
      temperatureF: 65,
      homeScore: null,
      awayScore: null,
      ...overrides,
    };
  }

  function prop(playerId: string, gameId: string): PropLine {
    return {
      propId: `${gameId}|${playerId}|receiving_yards|draftkings`,
      gameId,
      playerId,
      propType: "receiving_yards",
      lineValue: 50,
      oddsOverAmerican: -110,
      oddsUnderAmerican: -110,
      bookName: "draftkings",
      timestamp: "2026-09-13T12:00:00.000Z",
    };
  }

  function playerWeek(playerId: string, overrides: Partial<PlayerWeek> = {}): PlayerWeek {
    return {
      playerId,
      name: playerId,
      position: "WR",
      team: "PIT",
      opponent: "ATL",
      season: 2026,
      week: 1,
      seasonType: "REG",
      headshotUrl: null,
      completions: 0,
      attempts: 0,
      passingYards: 0,
      sacksSuffered: 0,
      carries: 0,
      rushingYards: 0,
      receptions: 4,
      targets: 6,
      receivingYards: 71,
      targetShare: 0.2,
      ...overrides,
    };
  }

  it("does not grade a prop whose game hasn't finished yet, even with a matching stat row", () => {
    const games = [game("g1", { homeScore: null, awayScore: null })];
    const props = [prop("p1", "g1")];
    const playerWeeks = [playerWeek("p1")];

    const actuals = buildActuals(playerWeeks, [], games, ASOF, props, new Map());

    expect(actuals).toEqual([]);
  });

  it("grades a prop with a stat row once its game is final", () => {
    const games = [game("g1", { homeScore: 20, awayScore: 13 })];
    const props = [prop("p1", "g1")];
    const playerWeeks = [playerWeek("p1", { receivingYards: 71 })];

    const actuals = buildActuals(playerWeeks, [], games, ASOF, props, new Map());

    expect(actuals).toEqual([
      { propId: props[0].propId, playerId: "p1", propType: "receiving_yards", actualValue: 71, status: "graded" },
    ]);
  });

  it("grades a finished game's player with no stat row but real snaps as a zero, not void", () => {
    const games = [game("g1", { homeScore: 20, awayScore: 13 })];
    const props = [prop("p2", "g1")];
    // Some other player's stat row, just so the week isn't entirely
    // stats-less (nflverse hasn't published anything for this week yet is a
    // different, already-empty-array case — not what's under test here).
    const playerWeeks = [playerWeek("someone-else")];
    const snapCounts: SnapCountRow[] = [
      { season: 2026, week: 1, player: "P.Layer", team: "PIT", position: "WR", offenseSnaps: 40, offensePct: 0.9 },
    ];

    const actuals = buildActuals(playerWeeks, snapCounts, games, ASOF, props, new Map([["p2", "P. Layer"]]));

    expect(actuals).toEqual([
      { propId: props[0].propId, playerId: "p2", propType: "receiving_yards", actualValue: 0, status: "graded" },
    ]);
  });

  it("voids a finished game's player with no stat row and no snaps", () => {
    const games = [game("g1", { homeScore: 20, awayScore: 13 })];
    const props = [prop("p3", "g1")];
    const playerWeeks = [playerWeek("someone-else")];

    const actuals = buildActuals(playerWeeks, [], games, ASOF, props, new Map([["p3", "Inactive Guy"]]));

    expect(actuals).toEqual([
      { propId: props[0].propId, playerId: "p3", propType: "receiving_yards", actualValue: null, status: "did-not-play" },
    ]);
  });

  it("skips a prop whose gameId isn't in the games list at all", () => {
    const props = [prop("p1", "unknown-game")];
    const playerWeeks = [playerWeek("p1")];

    const actuals = buildActuals(playerWeeks, [], [], ASOF, props, new Map());

    expect(actuals).toEqual([]);
  });
});
