import { describe, expect, it } from "vitest";

import { resolveCurrentWeek } from "./schedule";
import type { GameRow } from "./ingest/nflverse";

function game(
  season: number,
  week: number,
  gameday: string,
  overrides: Partial<GameRow> = {},
): GameRow {
  return {
    gameId: `${season}_${String(week).padStart(2, "0")}_AAA_BBB`,
    season,
    week,
    gameType: "REG",
    gameday,
    homeTeam: "AAA",
    awayTeam: "BBB",
    homeScore: null,
    awayScore: null,
    spreadHome: null,
    total: null,
    roof: "outdoors",
    temperatureF: null,
    windSpeedMph: null,
    weatherType: "outdoors",
    ...overrides,
  };
}

/** A full 16-game week, all on the same date, for brevity. */
function fullWeek(season: number, week: number, gameday: string): GameRow[] {
  return Array.from({ length: 16 }, (_, i) =>
    game(season, week, gameday, {
      gameId: `${season}_${String(week).padStart(2, "0")}_${i}`,
      homeTeam: `H${i}`,
      awayTeam: `A${i}`,
    }),
  );
}

describe("resolveCurrentWeek", () => {
  it("picks the week that has arrived and not yet finished", () => {
    const now = new Date("2025-11-19T12:00:00Z"); // a Wednesday
    const games = [
      ...fullWeek(2025, 11, "2025-11-16"), // last Sunday — finished
      ...fullWeek(2025, 12, "2025-11-23"), // this coming Sunday — current
      ...fullWeek(2025, 13, "2025-11-30"), // next week — not imminent yet
    ];
    expect(resolveCurrentWeek(games, now)).toEqual({ season: 2025, week: 12 });
  });

  it("rolls over mid-week once the prior week's last game has passed", () => {
    // Tuesday, the day after the week 11 slate (including MNF) wrapped.
    const now = new Date("2025-11-18T12:00:00Z");
    const games = [
      ...fullWeek(2025, 11, "2025-11-17"), // MNF finished yesterday
      ...fullWeek(2025, 12, "2025-11-23"),
    ];
    expect(resolveCurrentWeek(games, now)).toEqual({ season: 2025, week: 12 });
  });

  it("a bye week never empties a week's group", () => {
    const now = new Date("2025-11-19T12:00:00Z");
    // Only 14 games this week (2 teams on bye) instead of 16 — the group
    // still exists and should still resolve normally.
    const games = fullWeek(2025, 12, "2025-11-23").slice(0, 14);
    expect(resolveCurrentWeek(games, now)).toEqual({ season: 2025, week: 12 });
  });

  it("returns null in the true off-season", () => {
    const now = new Date("2025-07-01T12:00:00Z");
    const games = fullWeek(2025, 1, "2025-09-07");
    expect(resolveCurrentWeek(games, now)).toBeNull();
  });

  it("returns null when the schedule is published but months away", () => {
    // nflverse publishes the full season schedule in May, long before the
    // lookahead window — this must not be mistaken for "current".
    const now = new Date("2025-05-15T12:00:00Z");
    const games = fullWeek(2025, 1, "2025-09-04");
    expect(resolveCurrentWeek(games, now)).toBeNull();
  });

  it("returns null once the season's last REG week has passed, not a playoff week", () => {
    const now = new Date("2026-01-10T12:00:00Z");
    const games = [
      ...fullWeek(2025, 18, "2025-01-04"),
      // A playoff round the following week — must be ignored entirely.
      ...fullWeek(2025, 19, "2026-01-11").map((g) => ({
        ...g,
        gameType: "WC",
      })),
    ];
    expect(resolveCurrentWeek(games, now)).toBeNull();
  });

  it("prefers the earlier of two qualifying weeks across a season boundary", () => {
    const now = new Date("2026-01-03T12:00:00Z");
    const games = [
      ...fullWeek(2025, 18, "2026-01-04"), // tomorrow — not finished yet
      ...fullWeek(2026, 1, "2026-09-10"), // next season, far in the future
    ];
    expect(resolveCurrentWeek(games, now)).toEqual({ season: 2025, week: 18 });
  });
});
