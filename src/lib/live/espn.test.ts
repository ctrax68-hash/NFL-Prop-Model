import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchEspnScoreboard,
  fetchPostGameIds,
  findEvent,
  parseBoxscore,
  parseGameId,
  parseGameState,
  type RawEspnEvent,
  type RawEspnScoreboard,
  type RawEspnSummary,
} from "./espn";

// A recorded-shape fixture (see the caveat atop espn.ts): only the fields
// these parsers read, trimmed from ESPN's public scoreboard/summary
// responses as documented/observed. Two events, to exercise both the
// team-alias case (WSH) and a plain match, plus a game not on the board.
const SCOREBOARD: RawEspnScoreboard = {
  events: [
    {
      id: "401671801",
      status: { type: { state: "in", shortDetail: "8:42 - 3rd Quarter" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "17", team: { abbreviation: "SEA" } },
            { homeAway: "away", score: "14", team: { abbreviation: "NE" } },
          ],
        },
      ],
    },
    {
      id: "401671802",
      status: { type: { state: "post", shortDetail: "Final" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "24", team: { abbreviation: "WSH" } },
            { homeAway: "away", score: "20", team: { abbreviation: "PHI" } },
          ],
        },
      ],
    },
    {
      id: "401671803",
      status: { type: { state: "pre", shortDetail: "8:20 PM EDT" } },
      competitions: [
        {
          competitors: [
            { homeAway: "home", score: "0", team: { abbreviation: "KC" } },
            { homeAway: "away", score: "0", team: { abbreviation: "DEN" } },
          ],
        },
      ],
    },
  ],
};

describe("parseGameId", () => {
  it("splits nflverse's own gameId shape", () => {
    expect(parseGameId("2025_18_NYJ_BUF")).toEqual({
      season: 2025,
      week: 18,
      awayTeam: "NYJ",
      homeTeam: "BUF",
    });
  });

  it("handles a two-letter team abbreviation", () => {
    expect(parseGameId("2026_01_NE_SEA")).toEqual({
      season: 2026,
      week: 1,
      awayTeam: "NE",
      homeTeam: "SEA",
    });
  });

  it("returns null for anything else", () => {
    expect(parseGameId("not-a-game-id")).toBeNull();
    expect(parseGameId("")).toBeNull();
  });
});

describe("findEvent", () => {
  it("matches a plain team pair", () => {
    const event = findEvent(SCOREBOARD, "NE", "SEA");
    expect(event?.id).toBe("401671801");
  });

  it("matches through the ESPN/nflverse team alias (WSH -> WAS)", () => {
    const event = findEvent(SCOREBOARD, "PHI", "WAS");
    expect(event?.id).toBe("401671802");
  });

  it("returns null for a game not on this week's board", () => {
    expect(findEvent(SCOREBOARD, "DAL", "NYG")).toBeNull();
  });

  it("does not match home and away swapped", () => {
    expect(findEvent(SCOREBOARD, "SEA", "NE")).toBeNull();
  });
});

describe("parseGameState", () => {
  it("reads status, detail and both scores for a live game", () => {
    const state = parseGameState(SCOREBOARD.events![0]);
    expect(state).toEqual({
      status: "in",
      detail: "8:42 - 3rd Quarter",
      homeScore: 17,
      awayScore: 14,
    });
  });

  it("reads a finished game", () => {
    const state = parseGameState(SCOREBOARD.events![1]);
    expect(state.status).toBe("post");
    expect(state.detail).toBe("Final");
  });

  it("falls back to pre for an unrecognised status", () => {
    const odd: RawEspnEvent = { id: "x", status: { type: { state: "suspended" } } };
    expect(parseGameState(odd).status).toBe("pre");
  });

  it("treats a missing/non-numeric score as null rather than 0", () => {
    const noScore: RawEspnEvent = {
      id: "x",
      status: { type: { state: "pre" } },
      competitions: [{ competitors: [{ homeAway: "home" }, { homeAway: "away" }] }],
    };
    const state = parseGameState(noScore);
    expect(state.homeScore).toBeNull();
    expect(state.awayScore).toBeNull();
  });
});

const SUMMARY: RawEspnSummary = {
  boxscore: {
    players: [
      {
        team: { abbreviation: "NE" },
        statistics: [
          {
            name: "passing",
            labels: ["C/ATT", "YDS", "AVG", "TD", "INT", "SACKS", "QBR", "RTG"],
            athletes: [
              { athlete: { displayName: "Drake Maye" }, stats: ["18/27", "210", "7.8", "1", "0", "2-14", "72.1", "98.4"] },
            ],
          },
          {
            name: "rushing",
            labels: ["CAR", "YDS", "AVG", "TD", "LONG"],
            athletes: [
              { athlete: { displayName: "Drake Maye" }, stats: ["4", "22", "5.5", "0", "9"] },
              { athlete: { displayName: "Rhamondre Stevenson" }, stats: ["11", "48", "4.4", "0", "14"] },
            ],
          },
          {
            name: "receiving",
            labels: ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"],
            athletes: [
              { athlete: { displayName: "Stefon Diggs" }, stats: ["6", "71", "11.8", "1", "22", "9"] },
            ],
          },
        ],
      },
      {
        team: { abbreviation: "SEA" },
        statistics: [
          {
            name: "receiving",
            labels: ["REC", "YDS", "AVG", "TD", "LONG", "TGTS"],
            athletes: [
              { athlete: { displayName: "Jaxon Smith-Njigba" }, stats: ["7", "88", "12.6", "0", "24", "10"] },
            ],
          },
        ],
      },
    ],
  },
};

describe("parseBoxscore", () => {
  it("splits a combined C/ATT cell into completions and attempts", () => {
    const players = parseBoxscore(SUMMARY);
    const maye = players.find((p) => p.key === "drakemaye");
    expect(maye?.stats.pass_completions).toBe(18);
    expect(maye?.stats.pass_attempts).toBe(27);
    expect(maye?.stats.passing_yards).toBe(210);
  });

  it("merges a player's rushing line into the same entry as their passing line", () => {
    const players = parseBoxscore(SUMMARY);
    const maye = players.find((p) => p.key === "drakemaye");
    expect(maye?.stats.rush_attempts).toBe(4);
    expect(maye?.stats.rushing_yards).toBe(22);
    expect(maye?.team).toBe("NE");
  });

  it("reads a receiving-only player correctly", () => {
    const players = parseBoxscore(SUMMARY);
    const diggs = players.find((p) => p.key === "stefondiggs");
    expect(diggs?.stats).toEqual({ receptions: 6, receiving_yards: 71 });
  });

  it("keys players from both teams by normalised name, not confusing them", () => {
    const players = parseBoxscore(SUMMARY);
    const jsn = players.find((p) => p.key === "jaxonsmithnjigba");
    expect(jsn?.team).toBe("SEA");
    expect(jsn?.stats).toEqual({ receptions: 7, receiving_yards: 88 });
    expect(players).toHaveLength(4);
  });

  it("returns an empty list for an empty box score", () => {
    expect(parseBoxscore({} as RawEspnSummary)).toEqual([]);
    expect(parseBoxscore({ boxscore: {} })).toEqual([]);
  });
});

describe("fetchEspnScoreboard", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("never lets Next's fetch cache serve back a stale scoreboard", async () => {
    const fetchMock: typeof fetch = vi.fn(async () =>
      new Response(JSON.stringify({ events: [] }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await fetchEspnScoreboard(2026, 1);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const init = vi.mocked(fetchMock).mock.calls[0][1];
    expect(init?.cache).toBe("no-store");
  });
});

describe("fetchPostGameIds", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("flags a game ESPN already calls final, even though the persisted slate hasn't graded it, and leaves in-progress/pregame games out", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(SCOREBOARD), { status: 200 })),
    );

    const ids = await fetchPostGameIds(2025, 18, [
      { gameId: "2025_18_NE_SEA", awayTeam: "NE", homeTeam: "SEA" }, // "in" on the board
      { gameId: "2025_18_PHI_WAS", awayTeam: "PHI", homeTeam: "WAS" }, // "post" (WSH alias)
      { gameId: "2025_18_DEN_KC", awayTeam: "DEN", homeTeam: "KC" }, // "pre" on the board
      { gameId: "2025_18_BUF_MIA", awayTeam: "BUF", homeTeam: "MIA" }, // not on the board at all
    ]);

    expect(ids).toEqual(new Set(["2025_18_PHI_WAS"]));
  });

  it("degrades to an empty set — not a thrown error — when ESPN's fetch fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("site.api.espn.com unreachable");
      }),
    );

    const ids = await fetchPostGameIds(2025, 18, [
      { gameId: "2025_18_NE_SEA", awayTeam: "NE", homeTeam: "SEA" },
    ]);

    expect(ids).toEqual(new Set());
  });
});
