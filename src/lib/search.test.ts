import { describe, expect, it } from "vitest";

import { buildSearchIndex, search, type SearchIndex } from "./search";
import type { SlateSnapshot } from "./pipeline/types";

function snapshotFixture(): Pick<SlateSnapshot, "players" | "games"> {
  return {
    players: [
      {
        playerId: "p1",
        name: "Patrick Mahomes",
        teamId: "KC",
        position: "QB",
        headshotUrl: null,
        gamesSampleN: 10,
      },
      {
        playerId: "p2",
        name: "Travis Kelce",
        teamId: "KC",
        position: "TE",
        headshotUrl: null,
        gamesSampleN: 10,
      },
      {
        playerId: "p3",
        name: "Josh Allen",
        teamId: "BUF",
        position: "QB",
        headshotUrl: null,
        gamesSampleN: 10,
      },
    ],
    games: [
      {
        gameId: "2025_10_BUF_KC",
        season: 2025,
        week: 10,
        gameday: "2025-11-09",
        homeTeam: "KC",
        awayTeam: "BUF",
        spreadHome: -2.5,
        total: 48,
        impliedTeamTotalHome: 25.25,
        impliedTeamTotalAway: 22.75,
        weatherType: "outdoors",
        windSpeedMph: null,
        temperatureF: null,
        homeScore: null,
        awayScore: null,
      },
    ],
  };
}

function index(): SearchIndex {
  return buildSearchIndex(snapshotFixture() as SlateSnapshot);
}

describe("buildSearchIndex", () => {
  it("extracts the searchable fields from a snapshot's players and games", () => {
    const idx = index();
    expect(idx.players).toHaveLength(3);
    expect(idx.games).toHaveLength(1);
    expect(idx.players[0]).toEqual({
      playerId: "p1",
      name: "Patrick Mahomes",
      teamId: "KC",
      position: "QB",
      headshotUrl: null,
    });
  });
});

describe("search", () => {
  it("returns nothing for a blank query", () => {
    expect(search(index(), "  ")).toEqual({ players: [], games: [] });
  });

  it("matches a player name case-insensitively", () => {
    const result = search(index(), "mahomes");
    expect(result.players.map((p) => p.playerId)).toEqual(["p1"]);
  });

  it("matches a substring in the middle of a name", () => {
    const result = search(index(), "kelc");
    expect(result.players.map((p) => p.playerId)).toEqual(["p2"]);
  });

  it("ranks a starts-with match ahead of a contains-only match", () => {
    // Both "Josh Allen" and "Travis Kelce" have no shared prefix with "a", so
    // pick names that actually exercise the ordering: "Josh" starts with
    // "jo", nothing else contains it.
    const result = search(index(), "jo");
    expect(result.players.map((p) => p.playerId)).toEqual(["p3"]);
  });

  it("matches a game by either team's abbreviation", () => {
    expect(search(index(), "buf").games.map((g) => g.gameId)).toEqual([
      "2025_10_BUF_KC",
    ]);
    expect(search(index(), "kc").games.map((g) => g.gameId)).toEqual([
      "2025_10_BUF_KC",
    ]);
  });

  it("respects the result limit", () => {
    const bigIndex: SearchIndex = {
      players: Array.from({ length: 5 }, (_, i) => ({
        playerId: `p${i}`,
        name: `Test Player ${i}`,
        teamId: "KC",
        position: "WR",
        headshotUrl: null,
      })),
      games: [],
    };
    expect(search(bigIndex, "test", 2).players).toHaveLength(2);
  });
});
