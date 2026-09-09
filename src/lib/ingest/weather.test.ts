import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { attachWeatherForecasts, type WeatherForecastGame } from "./weather";

const STADIUM_COORDS = { KAN00: { lat: 39.0489, lon: -94.4839 } };

function game(overrides: Partial<WeatherForecastGame> = {}): WeatherForecastGame {
  return {
    gameId: "2026_01_DEN_KC",
    gameday: "2026-09-14",
    gametime: "20:15",
    location: "Home",
    stadiumId: "KAN00",
    roof: "outdoors",
    homeScore: null,
    temperatureF: null,
    windSpeedMph: null,
    weatherType: "outdoors",
    ...overrides,
  };
}

describe("attachWeatherForecasts", () => {
  const originalUserAgent = process.env.NWS_USER_AGENT;

  afterEach(() => {
    process.env.NWS_USER_AGENT = originalUserAgent;
  });

  it("no-ops entirely when NWS_USER_AGENT is unset, rather than fetching with a fake header", async () => {
    delete process.env.NWS_USER_AGENT;
    const games = [game()];
    const result = await attachWeatherForecasts(games, STADIUM_COORDS);
    expect(result).toEqual(games);
  });

  describe("with a user agent configured", () => {
    beforeEach(() => {
      process.env.NWS_USER_AGENT = "test-agent (test@example.com)";
    });

    it("skips a neutral-site game (no domestic stadium to look up)", async () => {
      const g = game({ location: "Neutral" });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips a dome game (no forecast needed)", async () => {
      const g = game({ roof: "dome" });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips a closed-roof game", async () => {
      const g = game({ roof: "closed" });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips an already-played game (homeScore present)", async () => {
      const g = game({ homeScore: 24 });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips a game that already has a recorded temperature", async () => {
      const g = game({ temperatureF: 55 });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips a game with no stadium id to resolve coordinates from", async () => {
      const g = game({ stadiumId: null });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });

    it("skips a game whose stadium has no known coordinates", async () => {
      const g = game({ stadiumId: "UNKNOWN00" });
      const result = await attachWeatherForecasts([g], STADIUM_COORDS);
      expect(result[0]).toEqual(g);
    });
  });
});
