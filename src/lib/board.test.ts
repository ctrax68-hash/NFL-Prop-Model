import { describe, expect, it } from "vitest";

import { buildBoardRows } from "./board";
import type { PropEvaluation } from "./engine/edge";
import type { PropLine } from "./engine/types";
import type { PropActual, SlateGame, SlatePlayer, SlateSnapshot } from "./pipeline/types";
import { DEFAULT_CONFIG } from "./engine/config";

const GAME: SlateGame = {
  gameId: "g1",
  season: 2026,
  week: 1,
  gameday: "2026-09-08",
  kickoffAt: "2026-09-08T17:00:00.000Z",
  homeTeam: "SEA",
  awayTeam: "NE",
  spreadHome: -3,
  total: 45,
  impliedTeamTotalHome: 24,
  impliedTeamTotalAway: 21,
  weatherType: "outdoors",
  windSpeedMph: 5,
  temperatureF: 65,
  homeScore: null,
  awayScore: null,
};

const PLAYER: SlatePlayer = {
  playerId: "p1",
  name: "Test Player",
  teamId: "SEA",
  position: "WR",
  headshotUrl: null,
  gamesSampleN: 5,
};

function prop(propId: string, lineValue = 50): PropLine {
  return {
    propId,
    gameId: "g1",
    playerId: "p1",
    propType: "receiving_yards",
    lineValue,
    oddsOverAmerican: -110,
    oddsUnderAmerican: -110,
    bookName: "draftkings",
    timestamp: "2026-09-08T12:00:00.000Z",
  };
}

function evaluation(propId: string, lineValue = 50): PropEvaluation {
  return {
    propId,
    playerId: "p1",
    gameId: "g1",
    propType: "receiving_yards",
    lineValue,
    projectedValue: 55,
    sigma: 15,
    distribution: "normal",
    snapShare: 0.7,
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
    evOver: 0.02,
    evUnder: -0.02,
  };
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

function snapshot(overrides: Partial<SlateSnapshot>): SlateSnapshot {
  return {
    runId: "run",
    generatedAt: "2026-09-08T00:00:00.000Z",
    season: 2026,
    week: 1,
    configVersion: "test",
    config: DEFAULT_CONFIG,
    bankroll: 10000,
    propsProvider: "odds-api",
    propsAreReal: true,
    games: [GAME],
    players: [PLAYER],
    teamProjections: [],
    projections: [],
    props: [prop("g1|p1|receiving_yards|draftkings")],
    evaluations: [evaluation("g1|p1|receiving_yards|draftkings")],
    recommendations: [],
    rejected: [],
    actuals: [],
    gameLogs: [],
    ...overrides,
  };
}

describe("buildBoardRows settlement + kickoff", () => {
  const propId = "g1|p1|receiving_yards|draftkings";

  it("carries the game's kickoffAt through onto the row", () => {
    const [row] = buildBoardRows(snapshot({}));
    expect(row.kickoffAt).toBe(GAME.kickoffAt);
  });

  it("is null when nothing has graded this prop yet", () => {
    const [row] = buildBoardRows(snapshot({ actuals: [] }));
    expect(row.settled).toBeNull();
  });

  it("grades a won over", () => {
    // bestSide is "over" here since edgeOver > edgeUnder in the fixture.
    const [row] = buildBoardRows(snapshot({ actuals: [actual(propId, 60)] }));
    expect(row.bestSide).toBe("over");
    expect(row.settled).toEqual({ actualValue: 60, outcome: "won" });
  });

  it("grades a lost over", () => {
    const [row] = buildBoardRows(snapshot({ actuals: [actual(propId, 40)] }));
    expect(row.settled).toEqual({ actualValue: 40, outcome: "lost" });
  });

  it("grades a push at the line", () => {
    const [row] = buildBoardRows(snapshot({ actuals: [actual(propId, 50)] }));
    expect(row.settled).toEqual({ actualValue: 50, outcome: "push" });
  });

  it("marks a did-not-play prop as void, not lost", () => {
    const [row] = buildBoardRows(snapshot({ actuals: [actual(propId, null)] }));
    expect(row.settled).toEqual({ actualValue: null, outcome: "void" });
  });

  it("grades against the recommended side's own line, not a generic over", () => {
    // Force bestSide to "under" so a value below the line is the win.
    const underEval: PropEvaluation = { ...evaluation(propId), edgeOver: -0.05, edgeUnder: 0.05 };
    const [row] = buildBoardRows(
      snapshot({ evaluations: [underEval], actuals: [actual(propId, 40)] }),
    );
    expect(row.bestSide).toBe("under");
    expect(row.settled).toEqual({ actualValue: 40, outcome: "won" });
  });
});
